import { createHash, timingSafeEqual } from 'node:crypto'
import express from 'express'
import mongoose from 'mongoose'
import { Account, Asset, Budget, Card, CardEvent, Entry, Goal, GoalEvent, Receipt, Reminder, Valuation, Workspace } from './models.js'
import { accountBalances, accountInput, cents, day, entryInput, id, object, RequestError } from './ledger.js'
import { CARD_PAYMENT, cardInput, cardSummary, eventInput, today, validateCardEvent } from './cards.js'
import { budgetInput, budgetSummaries, goalInput, goalSummary, spendingRecords } from './planning.js'
import { assetInput, nextReminder, reminderDue, reminderInput, valuationInput } from './records.js'
import { reportSummary } from './reports.js'
import { createAuth, requireOrigin } from './auth.js'

const digest = value => createHash('sha256').update(value).digest()
const fields = '-owner -createdAt -updatedAt'

export function createApp({ token, owner, origin, secureCookies = false, sendReset }) {
  const app = express()
  const tokenDigest = token && digest(token)
  const auth = createAuth({ origin, secureCookies, sendReset, localAccess: Boolean(token) })
  app.disable('x-powered-by')
  app.use('/api', (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' })
    const requestOrigin = req.get('origin')
    if (requestOrigin && requestOrigin !== origin) return res.status(403).json({ message: 'Origem não autorizada.' })
    res.vary('Origin')
    if (requestOrigin) res.set({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    })
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  app.get('/api/health', (_req, res) => res.sendStatus(mongoose.connection.readyState === 1 ? 204 : 503))
  app.use('/api/auth', auth.router)
  app.use('/api/ledger', async (req, res, next) => {
    const authorization = req.get('authorization')
    if (authorization) {
      const supplied = /^Bearer (\S+)$/.exec(authorization)?.[1]
      if (!tokenDigest || !supplied || !timingSafeEqual(tokenDigest, digest(supplied))) {
        return res.status(401).json({ message: 'Chave de acesso inválida.' })
      }
      req.owner = owner
    } else {
      const user = await auth.getUser(req)
      if (!user) return res.status(401).json({ message: 'Entre para acessar seus registros.' })
      if (req.method !== 'GET' && req.method !== 'HEAD') requireOrigin(req, origin)
      req.owner = String(user._id)
    }
    next()
  }, express.json({ limit: '8kb', strict: true }))

  async function snapshot(ownerId, session) {
    const accounts = await Account.find({ owner: ownerId }).sort({ createdAt: 1, _id: 1 }).select(fields).session(session).lean()
    const entries = await Entry.find({ owner: ownerId }).sort({ date: -1, createdAt: -1, _id: -1 }).select(fields).session(session).lean()
    const cards = await Card.find({ owner: ownerId }).sort({ createdAt: 1, _id: 1 }).select(fields).session(session).lean()
    const events = await CardEvent.find({ owner: ownerId }).sort({ date: 1, _id: 1 }).select(fields).session(session).lean()
    const byCard = new Map()
    for (const event of events) {
      const cardId = String(event.cardId)
      if (!byCard.has(cardId)) byCard.set(cardId, [])
      byCard.get(cardId).push(event)
    }
    const currentDay = today()
    const cardSummaries = cards.map(card => cardSummary(card, byCard.get(String(card._id)) ?? [], currentDay))
    const budgets = await Budget.find({ owner: ownerId }).sort({ month: -1, categoryKey: 1 }).select(fields).session(session).lean()
    const goals = await Goal.find({ owner: ownerId }).sort({ createdAt: 1, _id: 1 }).select(fields).session(session).lean()
    const goalEvents = await GoalEvent.find({ owner: ownerId }).sort({ date: -1, _id: -1 }).select(fields).session(session).lean()
    const reminders = await Reminder.find({ owner: ownerId }).select(fields).session(session).lean()
    const assetRows = await Asset.find({ owner: ownerId }).sort({ createdAt: 1, _id: 1 }).select(fields).session(session).lean()
    const valuations = await Valuation.find({ owner: ownerId }).sort({ date: -1, _id: -1 }).select(fields).session(session).lean()
    const assets = assetRows.map(asset => ({
      ...asset, valuations: valuations.filter(row => String(row.assetId) === String(asset._id)),
    }))
    return {
      ...accountBalances(accounts, entries), entries,
      cards: cardSummaries,
      budgets: budgetSummaries(budgets, spendingRecords(entries, cardSummaries)),
      goals: goals.map(goal => goalSummary(goal, goalEvents.filter(event => String(event.goalId) === String(goal._id)))),
      reminders: reminders.map(row => ({ ...row, effectiveDate: reminderDue(row) }))
        .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)),
      assets,
      reports: reportSummary(entries, accounts, cardSummaries, assets, currentDay.slice(0, 7)),
    }
  }

  // Serialize changes to the same workspace, including account archival and entry edits.
  async function write(ownerId, operation) {
    return mongoose.connection.transaction(async session => {
      await Workspace.updateOne({ _id: ownerId }, { $inc: { revision: 1 } }, { session })
      await operation(session)
      return snapshot(ownerId, session)
    })
  }

  async function createOnce(req, path, data, operation) {
    const key = req.get('idempotency-key')
    if (!key || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(key)) throw new RequestError(400, 'Chave de envio inválida.')
    const receiptId = req.owner + ':' + key.toLowerCase()
    const fingerprint = digest(JSON.stringify([path, data])).toString('hex')
    return write(req.owner, async session => {
      const previous = await Receipt.findById(receiptId).session(session).lean()
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new RequestError(409, 'A chave de envio já foi usada para outro registro.')
        return
      }
      await operation(session)
      await Receipt.create([{ _id: receiptId, fingerprint }], { session })
    })
  }

  async function saveEntry(ownerId, data, existingId, session) {
    const filter = { owner: ownerId, _id: existingId }
    const previous = existingId ? await Entry.findOne(filter).session(session).lean() : null
    if (existingId && !previous) throw new RequestError(404, 'Movimentação não encontrada.')
    if (previous?.type === CARD_PAYMENT) throw new RequestError(409, 'O pagamento está vinculado à fatura do cartão.')
    const linked = [data.accountId, data.destinationId].filter(Boolean)
    const accounts = await Account.find({ owner: ownerId, _id: { $in: linked } }).session(session).lean()
    const previousAccounts = [previous?.accountId, previous?.destinationId].filter(Boolean).map(String)
    if (accounts.length !== linked.length || accounts.some(account => account.archived && !previousAccounts.includes(String(account._id)))) {
      throw new RequestError(400, 'Escolha contas ativas para a movimentação.')
    }
    if (!existingId) {
      await Entry.create([{ ...data, owner: ownerId }], { session })
      return
    }
    const unset = Object.fromEntries(['destinationId', 'category', 'expenseKind'].filter(key => !(key in data)).map(key => [key, 1]))
    await Entry.updateOne(filter, { $set: data, $unset: unset }, { session })
  }

  app.get('/api/ledger', async (req, res) => res.json(await mongoose.connection.transaction(
    session => snapshot(req.owner, session), { readConcern: { level: 'snapshot' } },
  )))
  app.post('/api/ledger/accounts', async (req, res) => {
    const data = accountInput(req.body)
    const result = await createOnce(req, 'accounts', data, session => Account.create([{ ...data, owner: req.owner }], { session }))
    res.status(201).json(result)
  })
  app.put('/api/ledger/accounts/:id', async (req, res) => {
    const filter = { _id: id(req.params.id), owner: req.owner }
    const data = accountInput(req.body, true)
    res.json(await write(req.owner, async session => {
      const result = await Account.updateOne(filter, { $set: data }, { session })
      if (!result.matchedCount) throw new RequestError(404, 'Conta não encontrada.')
    }))
  })
  app.post('/api/ledger/entries', async (req, res) => {
    const data = entryInput(req.body)
    res.status(201).json(await createOnce(req, 'entries', data, session => saveEntry(req.owner, data, null, session)))
  })
  app.put('/api/ledger/entries/:id', async (req, res) => {
    const entryId = id(req.params.id)
    const data = entryInput(req.body)
    res.json(await write(req.owner, session => saveEntry(req.owner, data, entryId, session)))
  })
  app.delete('/api/ledger/entries/:id', async (req, res) => {
    const filter = { _id: id(req.params.id), owner: req.owner }
    res.json(await write(req.owner, async session => {
      const result = await Entry.deleteOne({ ...filter, type: { $ne: CARD_PAYMENT } }, { session })
      if (!result.deletedCount && await Entry.exists(filter).session(session)) {
        throw new RequestError(409, 'O pagamento está vinculado à fatura do cartão.')
      }
      if (!result.deletedCount) throw new RequestError(404, 'Movimentação não encontrada.')
    }))
  })

  app.post('/api/ledger/cards', async (req, res) => {
    const data = cardInput(req.body)
    res.status(201).json(await createOnce(req, 'cards', data, session => Card.create([{ ...data, owner: req.owner }], { session })))
  })
  app.put('/api/ledger/cards/:id', async (req, res) => {
    const filter = { _id: id(req.params.id), owner: req.owner }
    const data = cardInput(req.body)
    res.json(await write(req.owner, async session => {
      const card = await Card.findOne(filter).session(session)
      if (!card) throw new RequestError(404, 'Cartão não encontrado.')
      if ((card.close !== data.close || card.due !== data.due) && await CardEvent.exists({ owner: req.owner, cardId: card._id }).session(session)) {
        throw new RequestError(409, 'Os dias da fatura ficam fixos após o primeiro lançamento.')
      }
      await card.set(data).save({ session })
    }))
  })
  app.post('/api/ledger/cards/:id/events', async (req, res) => {
    const cardId = id(req.params.id)
    const currentDay = today()
    const data = eventInput(req.body, currentDay)
    res.status(201).json(await createOnce(req, 'cards/' + cardId + '/events', data, async session => {
      const owner = req.owner
      const card = await Card.findOne({ _id: cardId, owner }).session(session).lean()
      if (!card) throw new RequestError(404, 'Cartão não encontrado.')
      const events = await CardEvent.find({ owner, cardId }).session(session).lean()
      validateCardEvent(card, events, data, currentDay)
      const [event] = await CardEvent.create([{ ...data, cardId, owner }], { session })
      if (data.type === 'payment') {
        const account = await Account.exists({ _id: data.accountId, owner, archived: false }).session(session)
        if (!account) throw new RequestError(400, 'Escolha uma conta ativa para o pagamento.')
        await Entry.create([{
          _id: event._id, owner, type: CARD_PAYMENT, accountId: data.accountId, amount: data.amount, date: data.date,
          description: 'Pagamento de fatura · ' + card.name,
        }], { session })
      }
    }))
  })

  app.post('/api/ledger/budgets', async (req, res) => {
    const data = budgetInput(req.body)
    res.status(201).json(await createOnce(req, 'budgets', data, session => Budget.updateOne(
      { owner: req.owner, month: data.month, categoryKey: data.categoryKey },
      { $set: data }, { upsert: true, session },
    )))
  })

  app.post('/api/ledger/goals', async (req, res) => {
    const data = goalInput(req.body)
    res.status(201).json(await createOnce(req, 'goals', data, session => Goal.create([{ ...data, owner: req.owner }], { session })))
  })
  app.put('/api/ledger/goals/:id', async (req, res) => {
    const data = goalInput(req.body)
    const filter = { _id: id(req.params.id), owner: req.owner }
    res.json(await write(req.owner, async session => {
      const result = await Goal.updateOne(filter, { $set: data }, { session })
      if (!result.matchedCount) throw new RequestError(404, 'Meta não encontrada.')
    }))
  })
  app.post('/api/ledger/goals/:id/events', async (req, res) => {
    const goalId = id(req.params.id)
    object(req.body, ['amount'])
    const amount = cents(req.body.amount, true)
    if (!amount) throw new RequestError(400, 'Informe um valor diferente de zero.')
    res.status(201).json(await createOnce(req, 'goals/' + goalId + '/events', { amount }, async session => {
      const owner = req.owner
      const goal = await Goal.findOne({ _id: goalId, owner }).session(session).lean()
      if (!goal) throw new RequestError(404, 'Meta não encontrada.')
      if (goal.status !== 'active') throw new RequestError(409, 'Reative a meta para registrar um aporte ou retirada.')
      const events = await GoalEvent.find({ owner, goalId }).session(session).lean()
      if (-amount > goalSummary(goal, events).saved) throw new RequestError(400, 'A retirada excede o valor reservado.')
      await GoalEvent.create([{ owner, goalId, amount, date: today() }], { session })
    }))
  })

  app.post('/api/ledger/reminders', async (req, res) => {
    const data = reminderInput(req.body)
    res.status(201).json(await createOnce(req, 'reminders', data, session =>
      Reminder.create([{ ...data, owner: req.owner, status: 'active' }], { session })))
  })
  app.put('/api/ledger/reminders/:id', async (req, res) => {
    const data = reminderInput(req.body)
    const filter = { _id: id(req.params.id), owner: req.owner, status: 'active' }
    res.json(await write(req.owner, async session => {
      const row = await Reminder.findOne(filter).session(session)
      if (!row) throw new RequestError(404, 'Lembrete ativo não encontrado.')
      if (data.dueOn === row.dueOn && data.frequency === row.frequency) data.anchor = row.anchor
      else row.snoozedUntil = undefined
      await row.set(data).save({ session })
    }))
  })
  app.post('/api/ledger/reminders/:id/actions', async (req, res) => {
    const reminderId = id(req.params.id)
    const action = req.body?.action
    object(req.body, action === 'snooze' ? ['action', 'occurrence', 'until'] : ['action', 'occurrence'])
    if (!['confirm', 'cancel', 'snooze'].includes(action)) throw new RequestError(400, 'Escolha uma ação válida.')
    const occurrence = day(req.body.occurrence)
    const until = action === 'snooze' ? day(req.body.until) : null
    res.status(201).json(await createOnce(req, 'reminders/' + reminderId + '/actions', { action, occurrence, until }, async session => {
      const row = await Reminder.findOne({ _id: reminderId, owner: req.owner, status: 'active' }).session(session)
      if (!row || reminderDue(row) !== occurrence) throw new RequestError(409, 'O lembrete mudou. Atualize seus registros.')
      if (action === 'cancel') row.status = 'cancelled'
      if (action === 'snooze') {
        if (until <= occurrence || until <= today()) throw new RequestError(400, 'Escolha uma data posterior à atual e ao lembrete.')
        row.snoozedUntil = until
      }
      if (action === 'confirm') {
        const next = nextReminder(row)
        row.lastConfirmedOn = today()
        row.snoozedUntil = undefined
        if (next) row.dueOn = next
        else row.status = 'completed'
      }
      await row.save({ session })
    }))
  })

  async function verifyAssetAccount(owner, accountId, session) {
    if (accountId && !await Account.exists({ _id: accountId, owner }).session(session)) {
      throw new RequestError(400, 'Escolha uma conta do seu espaço.')
    }
  }
  app.post('/api/ledger/assets', async (req, res) => {
    object(req.body, ['name', 'kind', 'acquired', 'accountId', 'reviewOn', 'value', 'date'])
    const { value, date, ...input } = req.body
    const data = assetInput(input)
    const valuation = valuationInput({ value, date, reviewOn: data.reviewOn }, today())
    res.status(201).json(await createOnce(req, 'assets', { data, valuation }, async session => {
      const owner = req.owner
      await verifyAssetAccount(owner, data.accountId, session)
      const [asset] = await Asset.create([{ ...data, owner }], { session })
      await Valuation.create([{ owner, assetId: asset._id, value: valuation.value, date: valuation.date }], { session })
    }))
  })
  app.put('/api/ledger/assets/:id', async (req, res) => {
    const data = assetInput(req.body)
    const filter = { _id: id(req.params.id), owner: req.owner }
    res.json(await write(req.owner, async session => {
      await verifyAssetAccount(req.owner, data.accountId, session)
      const result = await Asset.updateOne(filter, { $set: data }, { session })
      if (!result.matchedCount) throw new RequestError(404, 'Registro patrimonial não encontrado.')
    }))
  })
  app.post('/api/ledger/assets/:id/valuations', async (req, res) => {
    const assetId = id(req.params.id)
    const data = valuationInput(req.body, today())
    res.status(201).json(await createOnce(req, 'assets/' + assetId + '/valuations', data, async session => {
      const owner = req.owner
      const result = await Asset.updateOne({ _id: assetId, owner }, { $set: { reviewOn: data.reviewOn } }, { session })
      if (!result.matchedCount) throw new RequestError(404, 'Registro patrimonial não encontrado.')
      await Valuation.create([{ owner, assetId, value: data.value, date: data.date }], { session })
    }))
  })

  app.use('/api', (_req, res) => res.status(404).json({ message: 'Endereço não encontrado.' }))
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error)
    if (error instanceof RequestError) return res.status(error.status).json({ message: error.message })
    if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Formato de dados inválido.' })
    if (error.type === 'entity.too.large') return res.status(413).json({ message: 'O envio excedeu o tamanho permitido.' })
    console.error('Falha na API financeira:', error.name)
    res.status(500).json({ message: 'Não foi possível concluir a operação.' })
  })
  return app
}
