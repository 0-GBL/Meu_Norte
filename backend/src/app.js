import { createHash, randomUUID } from 'node:crypto'
import express from 'express'
import mongoose from 'mongoose'
import { Account, Asset, Budget, Card, CardEvent, Entry, Goal, GoalEvent, Receipt, Reminder, Valuation, Workspace } from './models.js'
import { accountBalances, accountInput, day, entryInput, id, object, RequestError } from './ledger.js'
import { CARD_PAYMENT, cardInput, cardSummary, eventInput, nextCardDates, today, validateCardEvent } from './cards.js'
import { budgetInput, budgetSummaries, goalEventInput, goalInput, goalSummary, spendingRecords, validateGoalWithdrawal } from './planning.js'
import { accountReminderKinds, assetInput, assetOperation, assetReminderKinds, cardReminderKinds, isActiveAsset, nextReminder, reminderDue, reminderInput, valuationInput } from './records.js'
import { periodReport, portfolioPosition, reportComparison, reportSummary } from './reports.js'
import { comparisonPeriod } from '../../shared/reportPeriods.mjs'
import { registerAssetReceiptRoutes } from './assetReceipts.js'
import { createAuth, requireOrigin } from './auth.js'

const digest = value => createHash('sha256').update(value).digest()
const fields = '-owner -createdAt -updatedAt'

function offsetDay(day, offset) {
  const date = new Date(day + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function decorateReminder(row, cards, currentDay) {
  let dueOn = row.dueOn
  if (cardReminderKinds.includes(row.kind) && row.status === 'active') {
    const card = cards.find(item => String(item._id) === String(row.linkId) && !item.deletedAt)
    const start = row.cardCycle ?? currentDay
    if (!card) dueOn = null
    else if (row.kind === 'cardOpen') {
      dueOn = card.invoices.find(invoice => invoice.remaining > 0 && invoice.status !== 'Futura' && invoice.dueOn >= start)?.dueOn ?? null
    } else {
      const dates = nextCardDates(card, start)
      dueOn = row.kind === 'cardClose' ? dates.nextClose : dates.nextDue
    }
  }
  const effectiveDate = dueOn ? reminderDue({ ...row, dueOn }) : null
  const notifyOn = effectiveDate ? offsetDay(effectiveDate, -(row.leadDays ?? 0)) : null
  const time = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date())
  return {
    ...row, dueOn, effectiveDate, notifyOn,
    relevant: row.status === 'active' && Boolean(notifyOn) && (notifyOn < currentDay || (notifyOn === currentDay && (!row.time || row.time <= time))),
    read: Boolean(effectiveDate && row.readOccurrence === effectiveDate),
  }
}

export function createApp({ origin, secureCookies = false, sendReset, allowInitialLogin = false }) {
  const app = express()
  const auth = createAuth({ origin, secureCookies, sendReset, allowInitialLogin })
  app.disable('x-powered-by')
  app.use('/api', (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' })
    const requestOrigin = req.get('origin')
    if (requestOrigin && requestOrigin !== origin) return res.status(403).json({ message: 'Origem não autorizada.' })
    res.vary('Origin')
    if (requestOrigin) res.set({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    })
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  app.get('/api/health', (_req, res) => res.sendStatus(mongoose.connection.readyState === 1 ? 204 : 503))
  app.use('/api/auth', auth.router)
  app.use('/api/ledger', async (req, res, next) => {
    const user = await auth.getUser(req)
    if (!user) return res.status(401).json({ message: 'Entre para acessar seus registros.' })
    if (user.mustChangePassword) return res.status(403).json({ message: 'Altere a senha inicial para acessar seus registros.' })
    if (req.method !== 'GET' && req.method !== 'HEAD') requireOrigin(req, origin)
    req.owner = user.ledgerOwner ?? String(user._id)
    next()
  }, express.json({ limit: '8kb', strict: true }))

  async function snapshot(ownerId, session) {
    const accounts = await Account.find({ owner: ownerId }).sort({ createdAt: 1, _id: 1 }).select(fields).session(session).lean()
    const history = await Entry.find({ owner: ownerId }).sort({ date: -1, createdAt: -1, _id: -1 }).select('-owner -revisions').session(session).lean()
    const entries = history.filter(row => !row.cancelledAt)
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
    const assetRows = await Asset.find({ owner: ownerId, deletedAt: null }).sort({ createdAt: 1, _id: 1 }).select(fields).session(session).lean()
    const valuations = await Valuation.find({ owner: ownerId }).sort({ date: -1, _id: -1 }).select('-owner -updatedAt').session(session).lean()
    const assets = assetRows.map(asset => ({
      ...asset, valuations: valuations.filter(row => String(row.assetId) === String(asset._id)),
    }))
    const goalSummaries = goals.map(goal => goalSummary(goal, goalEvents.filter(event => String(event.goalId) === String(goal._id))))
    return {
      ...accountBalances(accounts, entries), entries, cancelledEntries: history.filter(row => row.cancelledAt),
      cards: cardSummaries,
      budgets: budgetSummaries(budgets, spendingRecords(entries, cardSummaries)),
      goals: goalSummaries.filter(goal => !goal.deletedAt),
      deletedGoals: goalSummaries.filter(goal => goal.deletedAt),
      reminders: reminders.map(row => decorateReminder(row, cardSummaries, currentDay))
        .sort((a, b) => (a.effectiveDate ?? '9999').localeCompare(b.effectiveDate ?? '9999')),
      assets,
      reports: reportSummary(entries, accounts, cardSummaries, assets, currentDay.slice(0, 7)),
    }
  }

  // Serialize changes to the same workspace, including account archival and entry edits.
  async function write(ownerId, operation) {
    return mongoose.connection.transaction(async session => {
      await Workspace.updateOne({ _id: ownerId }, { $inc: { revision: 1 } }, { session })
      const result = await operation(session)
      return { ...await snapshot(ownerId, session), ...(result?.mutation && { mutation: result.mutation }) }
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
        return previous.mutation?.message ? { mutation: previous.mutation } : undefined
      }
      const result = await operation(session)
      await Receipt.create([{ _id: receiptId, fingerprint, ...(result?.mutation && { mutation: result.mutation }) }], { session })
      return result
    })
  }

  async function saveEntry(ownerId, data, existingId, session) {
    const filter = { owner: ownerId, _id: existingId, cancelledAt: null }
    const previous = existingId ? await Entry.findOne(filter).session(session).lean() : null
    if (existingId && !previous) throw new RequestError(404, 'Movimentação não encontrada.')
    if (previous?.type === CARD_PAYMENT) throw new RequestError(409, 'O pagamento está vinculado à fatura do cartão.')
    if (previous?.goalId) throw new RequestError(409, 'A transferência está vinculada ao histórico de uma meta.')
    if (previous?.assetId) throw new RequestError(409, 'O lançamento está vinculado ao histórico de um bem.')
    const linked = [data.accountId, data.destinationId].filter(Boolean)
    const accounts = await Account.find({ owner: ownerId, _id: { $in: linked } }).session(session).lean()
    const previousAccounts = [previous?.accountId, previous?.destinationId].filter(Boolean).map(String)
    if (previousAccounts.length && await Account.exists({ owner: ownerId, _id: { $in: previousAccounts }, deletedAt: { $ne: null } }).session(session)) {
      throw new RequestError(409, 'O lançamento é parte do histórico de uma conta excluída.')
    }
    if (accounts.length !== linked.length || accounts.some(account => account.deletedAt || (account.archived && !previousAccounts.includes(String(account._id))))) {
      throw new RequestError(400, 'Escolha contas ativas para a movimentação.')
    }
    if (!existingId) {
      await Entry.create([{ ...data, owner: ownerId }], { session })
      return
    }
    const unset = Object.fromEntries(['destinationId', 'category', 'expenseKind'].filter(key => !(key in data)).map(key => [key, 1]))
    const { revisions, owner: previousOwner, ...before } = previous
    await Entry.updateOne(filter, { $set: data, $unset: unset, $push: { revisions: { before, at: new Date() } } }, { session })
  }

  app.get('/api/ledger', async (req, res) => res.json(await mongoose.connection.transaction(
    session => snapshot(req.owner, session), { readConcern: { level: 'snapshot' } },
  )))
  app.get('/api/ledger/reports', async (req, res) => {
    const owner = req.owner
    const from = day(req.query.from)
    const through = day(req.query.through)
    const max = new Date(from + 'T00:00:00Z')
    max.setUTCFullYear(max.getUTCFullYear() + 5)
    if (from < '1900-01-01' || through > '2199-12-31' || from > through || through > max.toISOString().slice(0, 10)) {
      throw new RequestError(400, 'Escolha um período de até cinco anos entre 1900 e 2199.')
    }
    const accountId = req.query.account ? id(req.query.account) : undefined
    const category = typeof req.query.category === 'string' ? req.query.category.slice(0, 120) : ''
    const type = typeof req.query.type === 'string' ? req.query.type : ''
    const assetKind = typeof req.query.assetKind === 'string' ? req.query.assetKind : ''
    if (req.query.comparison && !['month', 'consecutive'].includes(req.query.comparison)) {
      throw new RequestError(400, 'Escolha uma comparação válida.')
    }
    const comparison = comparisonPeriod(from, through, req.query.comparison)
    if (type && !['income', 'expense', 'transfer', 'cardPurchase', 'cardPayment', 'assetPurchase', 'assetSale'].includes(type)) {
      throw new RequestError(400, 'Escolha um tipo de movimentação válido.')
    }
    if (assetKind && !['vehicle', 'property', 'equipment', 'investment', 'other'].includes(assetKind)) {
      throw new RequestError(400, 'Escolha uma categoria patrimonial válida.')
    }
    res.json(await mongoose.connection.transaction(async session => {
      const currentDay = today()
      const date = through < currentDay ? through : currentDay
      const accounts = await Account.find({ owner }).select('initialBalance').session(session).lean()
      if (accountId && !accounts.some(row => String(row._id) === accountId)) throw new RequestError(404, 'Conta não encontrada.')
      const entries = await Entry.find({ owner, cancelledAt: null, date: { $lte: through } })
        .select('accountId destinationId amount category date type assetOperation assetId assetReceiptSource').session(session).lean()
      const cards = []
      const group = (rows, key) => {
        const groups = new Map()
        for (const row of rows) {
          const id = String(row[key])
          if (!groups.has(id)) groups.set(id, [])
          groups.get(id).push(row)
        }
        return groups
      }
      const cardRows = await Card.find({ owner }).session(session).lean()
      const events = group(await CardEvent.find({ owner, date: { $lte: date } }).session(session).lean(), 'cardId')
      for (const card of cardRows) cards.push(cardSummary(card, events.get(String(card._id)) ?? [], date))
      const assetRows = await Asset.find({ owner, deletedAt: null }).session(session).lean()
      const values = group(await Valuation.find({ owner, date: { $lte: date } }).sort({ date: -1, _id: -1 }).session(session).lean(), 'assetId')
      const assets = assetRows.map(asset => ({ ...asset, valuations: values.get(String(asset._id)) ?? [] }))
      const input = { entries, accounts, cards, assets, accountId, category, type, assetKind, currentDay }
      const { from: previousFrom, through: previousThrough } = comparison
      const previous = periodReport({ ...input, assets: [], from: previousFrom, through: previousThrough })
      const current = periodReport({ ...input, from, through })
      return { ...current, position: portfolioPosition({ entries, accounts, cards, assets, date }),
        comparison: reportComparison(current, previous),
        previous: { ...comparison, income: previous.income, expenses: previous.expenses, cash: previous.cash } }
    }, { readConcern: { level: 'snapshot' } }))
  })
  app.post('/api/ledger/accounts', async (req, res) => {
    const data = accountInput(req.body)
    const result = await createOnce(req, 'accounts', data, session => Account.create([{ ...data, owner: req.owner }], { session }))
    res.status(201).json(result)
  })
  app.put('/api/ledger/accounts/:id', async (req, res) => {
    const filter = { _id: id(req.params.id), owner: req.owner, deletedAt: null }
    const data = accountInput(req.body, true)
    res.json(await write(req.owner, async session => {
      const result = await Account.updateOne(filter, { $set: data }, { session })
      if (!result.matchedCount) throw new RequestError(404, 'Conta não encontrada.')
    }))
  })
  app.delete('/api/ledger/accounts/:id', async (req, res) => {
    const accountId = id(req.params.id)
    const owner = req.owner
    res.json(await write(owner, async session => {
      const account = await Account.findOne({ _id: accountId, owner, deletedAt: null }).session(session)
      if (!account) throw new RequestError(404, 'Conta não encontrada.')
      const entries = await Entry.find({ owner, cancelledAt: null, $or: [{ accountId }, { destinationId: accountId }] }).session(session).lean()
      let balance = BigInt(account.initialBalance)
      for (const row of entries) balance += BigInt(row.amount) * (row.type === 'income' || String(row.destinationId) === accountId ? 1n : -1n)
      if (balance !== 0n) throw new RequestError(409, 'Regularize o saldo da conta por uma movimentação antes de excluir.')
      if (entries.some(row => row.date > today())) throw new RequestError(409, 'A conta possui movimentações com data futura.')
      if (await Asset.exists({ owner, accountId, endedOn: null, deletedAt: null }).session(session)) {
        throw new RequestError(409, 'Desvincule os bens ativos representados por esta conta.')
      }
      if (await Reminder.exists({ owner, linkId: accountId, kind: { $in: accountReminderKinds }, status: 'active' }).session(session)) {
        throw new RequestError(409, 'Encerre os lembretes ativos vinculados à conta antes de excluir.')
      }
      account.archived = true
      account.deletedAt = new Date()
      await account.save({ session })
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
      const row = await Entry.findOne({ ...filter, cancelledAt: null }).session(session)
      if (!row) throw new RequestError(404, 'Movimentação não encontrada.')
      if (row.type === CARD_PAYMENT || row.goalId || row.assetId) throw new RequestError(409, 'Este lançamento está vinculado a outro histórico financeiro.')
      if (await Account.exists({ owner: req.owner, _id: { $in: [row.accountId, row.destinationId].filter(Boolean) }, deletedAt: { $ne: null } }).session(session)) {
        throw new RequestError(409, 'O lançamento é parte do histórico de uma conta excluída.')
      }
      row.cancelledAt = new Date()
      await row.save({ session })
    }))
  })

  app.post('/api/ledger/cards', async (req, res) => {
    const data = cardInput(req.body)
    res.status(201).json(await createOnce(req, 'cards', data, session => Card.create([{ ...data, owner: req.owner }], { session })))
  })
  app.put('/api/ledger/cards/:id', async (req, res) => {
    const filter = { _id: id(req.params.id), owner: req.owner, deletedAt: null }
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
  app.delete('/api/ledger/cards/:id', async (req, res) => {
    const cardId = id(req.params.id)
    const owner = req.owner
    res.json(await write(owner, async session => {
      const card = await Card.findOne({ _id: cardId, owner, deletedAt: null }).session(session)
      if (!card) throw new RequestError(404, 'Cartão não encontrado.')
      const events = await CardEvent.find({ owner, cardId }).session(session).lean()
      const { used, credit } = cardSummary(card.toObject(), events, today())
      if (used || credit) throw new RequestError(409, 'Para excluir o cartão, liquide as faturas e utilize o crédito restante.')
      if (await Reminder.exists({ owner, linkId: cardId, kind: { $in: cardReminderKinds }, status: 'active' }).session(session)) {
        throw new RequestError(409, 'Encerre os lembretes ativos do cartão antes de excluir.')
      }
      card.deletedAt = new Date()
      await card.save({ session })
    }))
  })
  app.post('/api/ledger/cards/:id/events', async (req, res) => {
    const cardId = id(req.params.id)
    const currentDay = today()
    const data = eventInput(req.body, currentDay)
    res.status(201).json(await createOnce(req, 'cards/' + cardId + '/events', data, async session => {
      const owner = req.owner
      const card = await Card.findOne({ _id: cardId, owner, deletedAt: null }).session(session).lean()
      if (!card) throw new RequestError(404, 'Cartão não encontrado.')
      const events = await CardEvent.find({ owner, cardId }).session(session).lean()
      validateCardEvent(card, events, data, currentDay)
      const [event] = await CardEvent.create([{ ...data, cardId, owner }], { session })
      if (data.type === 'payment') {
        const account = await Account.exists({ _id: data.accountId, owner, archived: false }).session(session)
        if (!account) throw new RequestError(400, 'Escolha uma conta ativa para o pagamento.')
        await Entry.create([{
          _id: event._id, owner, type: CARD_PAYMENT, accountId: data.accountId, amount: data.amount, date: data.date,
          cardId, invoice: data.invoice,
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
  app.put('/api/ledger/budgets/:id', async (req, res) => {
    const budgetId = id(req.params.id)
    const owner = req.owner
    const data = budgetInput(req.body)
    res.json(await write(owner, async session => {
      const filter = { _id: budgetId, owner }
      if (!await Budget.exists(filter).session(session)) throw new RequestError(404, 'Orçamento não encontrado.')
      if (await Budget.exists({ owner, month: data.month, categoryKey: data.categoryKey, _id: { $ne: budgetId } }).session(session)) {
        throw new RequestError(409, 'Já existe um orçamento para essa categoria e mês.')
      }
      await Budget.updateOne(filter, { $set: data }, { session })
    }))
  })
  app.delete('/api/ledger/budgets/:id', async (req, res) => {
    const filter = { _id: id(req.params.id), owner: req.owner }
    res.json(await write(req.owner, async session => {
      const result = await Budget.deleteOne(filter, { session })
      if (!result.deletedCount) throw new RequestError(404, 'Orçamento não encontrado.')
    }))
  })

  app.post('/api/ledger/goals', async (req, res) => {
    const data = goalInput(req.body)
    res.status(201).json(await createOnce(req, 'goals', data, session => Goal.create([{ ...data, owner: req.owner }], { session })))
  })
  app.put('/api/ledger/goals/:id', async (req, res) => {
    const data = goalInput(req.body)
    const filter = { _id: id(req.params.id), owner: req.owner, deletedAt: null }
    res.json(await write(req.owner, async session => {
      const result = await Goal.updateOne(filter, { $set: data }, { session })
      if (!result.matchedCount) throw new RequestError(404, 'Meta não encontrada.')
    }))
  })
  app.delete('/api/ledger/goals/:id', async (req, res) => {
    const filter = { _id: id(req.params.id), owner: req.owner, deletedAt: null }
    res.json(await write(req.owner, async session => {
      const result = await Goal.updateOne(filter, { $set: { deletedAt: new Date() } }, { session })
      if (!result.matchedCount) throw new RequestError(404, 'Meta não encontrada.')
    }))
  })
  app.post('/api/ledger/goals/:id/events', async (req, res) => {
    const goalId = id(req.params.id)
    const data = goalEventInput(req.body)
    res.status(201).json(await createOnce(req, 'goals/' + goalId + '/events', data, async session => {
      const owner = req.owner
      const goal = await Goal.findOne({ _id: goalId, owner, deletedAt: null }).session(session).lean()
      if (!goal) throw new RequestError(404, 'Meta não encontrada.')
      if (goal.status !== 'active') throw new RequestError(409, 'Reative a meta para registrar um aporte ou retirada.')
      const events = await GoalEvent.find({ owner, goalId }).session(session).lean()
      validateGoalWithdrawal(events, data)
      const date = today()
      const [event] = await GoalEvent.create([{ ...data, owner, goalId, date }], { session })
      if (data.accountId) {
        await saveEntry(owner, {
          _id: event._id, goalId, type: 'transfer', date, amount: Math.abs(data.amount),
          accountId: data.accountId, destinationId: data.destinationId,
          description: (data.amount > 0 ? 'Aporte · ' : 'Retirada · ') + goal.name,
        }, null, session)
      }
    }))
  })

  async function validateReminderLink(owner, data, session) {
    if (data.kind === 'assetReceipt') {
      if (!await Asset.exists({ owner, _id: data.linkId, deletedAt: null, status: 'sold',
        'sale.cancelledAt': null, 'sale.entryId': null, 'sale.expectedOn': data.dueOn }).session(session)) {
        throw new RequestError(409, 'O recebimento mudou. Gerencie o lembrete pelo bem vendido.')
      }
      if (await Reminder.exists({ owner, kind: 'assetReceipt', linkId: data.linkId, status: 'active', _id: { $ne: data._id } }).session(session)) {
        throw new RequestError(409, 'Já existe um lembrete ativo para este recebimento.')
      }
      return
    }
    const Model = accountReminderKinds.includes(data.kind) ? Account :
      cardReminderKinds.includes(data.kind) ? Card : assetReminderKinds.includes(data.kind) ? Asset : null
    if (Model && !await Model.exists({ _id: data.linkId, owner, deletedAt: null, ...(Model === Asset && { endedOn: null }) }).session(session)) {
      throw new RequestError(400, 'Escolha um registro disponível no seu espaço.')
    }
  }

  app.post('/api/ledger/reminders', async (req, res) => {
    const data = reminderInput(req.body)
    res.status(201).json(await createOnce(req, 'reminders', data, async session => {
      await validateReminderLink(req.owner, data, session)
      await Reminder.create([{ ...data, owner: req.owner, status: 'active',
        ...(cardReminderKinds.includes(data.kind) && { cardCycle: data.kind === 'cardOpen' ? '1900-01-01' : today() }) }], { session })
    }))
  })
  app.put('/api/ledger/reminders/:id', async (req, res) => {
    const data = reminderInput(req.body)
    const filter = { _id: id(req.params.id), owner: req.owner, status: 'active' }
    res.json(await write(req.owner, async session => {
      const row = await Reminder.findOne(filter).session(session)
      if (!row) throw new RequestError(404, 'Lembrete ativo não encontrado.')
      if (row.kind === 'assetReceipt') throw new RequestError(409, 'Altere a previsão pelo gerenciamento do recebimento.')
      await validateReminderLink(req.owner, data, session)
      if (data.kind !== row.kind || String(data.linkId) !== String(row.linkId)) {
        row.cardCycle = cardReminderKinds.includes(data.kind) ? data.kind === 'cardOpen' ? '1900-01-01' : today() : undefined
        row.readOccurrence = undefined
        row.snoozedUntil = undefined
      }
      if (data.dueOn === row.dueOn && data.frequency === row.frequency) data.anchor = row.anchor
      else row.snoozedUntil = undefined
      await row.set(data).save({ session })
    }))
  })
  app.delete('/api/ledger/reminders/:id', async (req, res) => {
    const filter = { _id: id(req.params.id), owner: req.owner, deletedAt: null }
    res.json(await write(req.owner, async session => {
      const result = await Reminder.updateOne(filter, { $set: { deletedAt: new Date(), status: 'deleted' } }, { session })
      if (!result.matchedCount) throw new RequestError(404, 'Lembrete não encontrado.')
    }))
  })
  app.post('/api/ledger/reminders/:id/actions', async (req, res) => {
    const reminderId = id(req.params.id)
    const action = req.body?.action
    object(req.body, action === 'snooze' ? ['action', 'occurrence', 'until'] : ['action', 'occurrence'])
    if (!['confirm', 'dismiss', 'read', 'cancel', 'snooze', 'reactivate'].includes(action)) throw new RequestError(400, 'Escolha uma ação válida.')
    const occurrence = req.body.occurrence ? day(req.body.occurrence) : null
    const until = action === 'snooze' ? day(req.body.until) : null
    res.status(201).json(await createOnce(req, 'reminders/' + reminderId + '/actions', { action, occurrence, until }, async session => {
      const owner = req.owner
      const row = await Reminder.findOne({ _id: reminderId, owner, deletedAt: null }).session(session)
      if (!row) throw new RequestError(404, 'Lembrete não encontrado.')
      if (row.kind === 'assetReceipt' && action === 'snooze') throw new RequestError(409, 'Reagende a previsão pelo bem vendido para manter o histórico.')
      if (action === 'reactivate') {
        if (row.status === 'active') throw new RequestError(409, 'O lembrete já está ativo.')
        await validateReminderLink(owner, row, session)
        row.status = 'active'
        row.snoozedUntil = undefined
        row.readOccurrence = undefined
        await row.save({ session })
        return
      }
      const linkedCard = cardReminderKinds.includes(row.kind)
      const card = linkedCard && await Card.findOne({ owner, _id: row.linkId, deletedAt: null }).session(session).lean()
      const events = card ? await CardEvent.find({ owner, cardId: card._id }).session(session).lean() : []
      const summary = card ? [cardSummary(card, events, today())] : []
      const derived = decorateReminder(row.toObject(), summary, today())
      if (row.status !== 'active' || derived.effectiveDate !== occurrence) throw new RequestError(409, 'O lembrete mudou. Atualize seus registros.')
      if (!occurrence && action !== 'cancel') throw new RequestError(409, 'O lembrete ainda não tem ocorrência.')
      if (action === 'cancel') row.status = 'cancelled'
      if (action === 'read') row.readOccurrence = occurrence
      if (action === 'snooze') {
        if (until <= occurrence || until <= today()) throw new RequestError(400, 'Escolha uma data posterior à atual e ao lembrete.')
        row.snoozedUntil = until
      }
      if (action === 'confirm' || action === 'dismiss') {
        row.history.push({ occurrence: derived.dueOn, action, recordedAt: new Date() })
        if (action === 'confirm') row.lastConfirmedOn = today()
        row.snoozedUntil = undefined
        row.readOccurrence = undefined
        if (linkedCard) row.cardCycle = offsetDay(derived.dueOn, 1)
        else {
          const next = nextReminder(row)
          if (next) row.dueOn = next
          else row.status = 'completed'
        }
      }
      await row.save({ session })
    }))
  })

  async function verifyAssetAccount(owner, accountId, session) {
    if (accountId && !await Account.exists({ _id: accountId, owner, deletedAt: null }).session(session)) {
      throw new RequestError(400, 'Escolha uma conta do seu espaço.')
    }
  }
  app.post('/api/ledger/assets', async (req, res) => {
    object(req.body, ['name', 'kind', 'acquired', 'accountId', 'reviewOn', 'value', 'date', 'description', 'notes', 'acquiredOn'])
    const { value, date, ...input } = req.body
    const data = assetInput(input)
    const valuation = value == null ? null : valuationInput({ value, date, reviewOn: data.reviewOn }, today())
    if (data.acquiredOn > today() || (valuation && data.acquiredOn > valuation.date)) throw new RequestError(400, 'A aquisição deve ocorrer até a data da avaliação e até hoje.')
    res.status(201).json(await createOnce(req, 'assets', { data, valuation }, async session => {
      const owner = req.owner
      await verifyAssetAccount(owner, data.accountId, session)
      const [asset] = await Asset.create([{ ...data, owner }], { session })
      if (valuation) await Valuation.create([{ owner, assetId: asset._id, value: valuation.value, date: valuation.date }], { session })
    }))
  })
  app.put('/api/ledger/assets/:id', async (req, res) => {
    const data = assetInput(req.body)
    const filter = { _id: id(req.params.id), owner: req.owner, endedOn: null, deletedAt: null }
    res.json(await write(req.owner, async session => {
      await verifyAssetAccount(req.owner, data.accountId, session)
      const row = await Asset.findOne(filter).session(session)
      if (!row) throw new RequestError(404, 'Bem ativo não encontrado.')
      if (row.purchase?.date && (row.acquired !== data.acquired || (data.acquiredOn !== undefined && row.acquiredOn !== data.acquiredOn))) {
        throw new RequestError(409, 'O custo e a data estão vinculados à compra registrada.')
      }
      if (data.acquiredOn && (data.acquiredOn > today() || await Valuation.exists({ owner: req.owner, assetId: row._id, date: { $lt: data.acquiredOn } }).session(session))) {
        throw new RequestError(400, 'A aquisição deve ocorrer até a primeira avaliação e até hoje.')
      }
      await row.set(data).save({ session })
    }))
  })
  app.post('/api/ledger/assets/:id/valuations', async (req, res) => {
    const assetId = id(req.params.id)
    const data = valuationInput(req.body, today())
    res.status(201).json(await createOnce(req, 'assets/' + assetId + '/valuations', data, async session => {
      const owner = req.owner
      const asset = await Asset.findOne({ _id: assetId, owner, endedOn: null, deletedAt: null }).session(session)
      if (!asset) throw new RequestError(404, 'Bem ativo não encontrado.')
      if (asset.acquiredOn && data.date < asset.acquiredOn) throw new RequestError(400, 'A avaliação deve ocorrer após a aquisição.')
      asset.reviewOn = data.reviewOn
      await asset.save({ session })
      await Valuation.create([{ owner, assetId, value: data.value, date: data.date, notes: data.notes }], { session })
    }))
  })
  app.delete('/api/ledger/assets/:id', async (req, res) => {
    const owner = req.owner
    const assetId = id(req.params.id)
    res.json(await write(owner, async session => {
      const row = await Asset.findOne({ _id: assetId, owner, deletedAt: null }).session(session)
      if (!row) throw new RequestError(404, 'Bem não encontrado.')
      const evaluations = await Valuation.countDocuments({ owner, assetId }).session(session)
      if (row.purchase?.date || row.endedOn || evaluations > 1 ||
        await Reminder.exists({ owner, kind: { $in: assetReminderKinds }, linkId: assetId, status: 'active' }).session(session)) {
        throw new RequestError(409, 'O bem possui histórico ou lembretes vinculados. Use a baixa para preservá-lo.')
      }
      row.deletedAt = new Date()
      await row.save({ session })
    }))
  })
  app.post('/api/ledger/assets/:id/operations', async (req, res) => {
    const owner = req.owner
    const assetId = id(req.params.id)
    const data = assetOperation(req.body, today())
    res.status(201).json(await createOnce(req, 'assets/' + assetId + '/operations', data, async session => {
      const asset = await Asset.findOne({ owner, _id: assetId, endedOn: null, deletedAt: null }).session(session)
      if (!asset) throw new RequestError(404, 'Bem ativo não encontrado.')
      if (asset.kind === 'debt' && data.type !== 'retire') throw new RequestError(409, 'Compras e vendas de bens não se aplicam a obrigações.')
      const purchase = data.type === 'purchase'
      if (purchase && asset.purchase?.date) throw new RequestError(409, 'A compra deste bem já foi registrada.')
      if (!purchase && asset.acquiredOn && data.date < asset.acquiredOn) throw new RequestError(400, 'Informe uma data a partir da aquisição.')
      if (await Valuation.exists({ owner, assetId, date: purchase ? { $lt: data.date } : { $gt: data.date } }).session(session)) {
        throw new RequestError(400, 'A data precisa respeitar o histórico de avaliações do bem.')
      }
      const type = purchase ? 'expense' : 'income'
      const match = { owner, type, amount: data.amount, date: data.date, cancelledAt: null }
      let entryId
      if (data.mode === 'existing') {
        const row = await Entry.findOne({ ...match, _id: data.entryId, assetId: null }).session(session)
        if (!row) throw new RequestError(409, 'Escolha um lançamento disponível com tipo, data e valor correspondentes.')
        row.assetId = assetId
        row.assetOperation = data.type
        if (!purchase) row.assetReceiptSource = 'existing'
        await row.save({ session })
        entryId = row._id
      }
      if (data.mode === 'new') {
        if (await Entry.exists({ ...match, accountId: data.accountId }).session(session)) {
          throw new RequestError(409, 'Já existe um lançamento com esta conta, data e valor. Vincule-o no formulário.')
        }
        entryId = new mongoose.Types.ObjectId()
        await saveEntry(owner, {
          _id: entryId, assetId, assetOperation: data.type, ...(!purchase && { assetReceiptSource: 'new' }), type, date: data.date, amount: data.amount,
          accountId: data.accountId, category: 'Patrimônio', description: (purchase ? 'Compra · ' : 'Venda · ') + asset.name,
          ...(purchase && { expenseKind: 'variable' }),
        }, null, session)
      }
      if (purchase) {
        asset.purchase = { date: data.date, amount: data.amount, entryId }
        asset.acquired = data.amount
        asset.acquiredOn = data.date
      } else {
        asset.status = data.type === 'sale' ? 'sold' : 'retired'
        asset.endedOn = data.date
        if (data.type === 'sale') asset.sale = { date: data.date, amount: data.amount, entryId, cost: asset.acquired ?? null,
          operationId: randomUUID(), history: [{ action: 'sale', mode: data.mode, entryId, recordedAt: new Date() }] }
        await Reminder.updateMany({ owner, kind: { $in: assetReminderKinds }, linkId: assetId, status: 'active' },
          { $set: { status: 'cancelled' } }, { session })
      }
      await asset.save({ session })
    }))
  })

  registerAssetReceiptRoutes(app, { createOnce, saveEntry })

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
