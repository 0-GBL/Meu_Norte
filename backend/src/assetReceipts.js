import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import { Account, Asset, Entry, Reminder, Valuation } from './models.js'
import { cents, day, id, label, object, RequestError } from './ledger.js'
import { today } from './cards.js'
import { saleKey } from '../../shared/assetReceipts.mjs'

export function receiptInput(input) {
  const fields = {
    schedule: ['expectedOn', 'remind'], confirm: ['accountId', 'date', 'confirmed'], link: ['entryId', 'confirmed'],
    reverse: ['reason', 'confirmed'], cancel: ['reason', 'confirmed'], correct: ['reason', 'confirmed', 'date', 'amount'],
  }
  const action = input?.action
  if (!Object.hasOwn(fields, action)) throw new RequestError(400, 'Escolha uma ação de recebimento válida.')
  object(input, ['action', 'saleKey', ...fields[action]])
  const data = { action, saleKey: label(input.saleKey, 'a referência da venda') }
  if (action === 'schedule') {
    if (typeof input.remind !== 'boolean') throw new RequestError(400, 'Informe se deseja um lembrete.')
    return { ...data, expectedOn: input.expectedOn == null ? null : day(input.expectedOn), remind: input.remind }
  }
  if (input.confirmed !== true) throw new RequestError(400, 'Confirme explicitamente a operação.')
  if (action === 'confirm') return { ...data, confirmed: true, accountId: id(input.accountId), date: day(input.date) }
  if (action === 'link') return { ...data, confirmed: true, entryId: id(input.entryId) }
  const reason = label(input.reason, 'uma justificativa')
  return { ...data, confirmed: true, reason, ...(action === 'correct' && { amount: cents(input.amount), date: day(input.date) }) }
}

const audit = (asset, event) => {
  asset.sale.history ??= []
  asset.sale.history.push({ ...event, recordedAt: new Date() })
}

async function closeReminders(owner, assetId, session, action) {
  const rows = await Reminder.find({ owner, kind: 'assetReceipt', linkId: assetId, status: 'active' }).session(session)
  for (const row of rows) {
    row.history.push({ occurrence: row.dueOn, action, recordedAt: new Date() })
    row.status = action === 'received' ? 'completed' : 'cancelled'
    await row.save({ session })
  }
  return rows.length > 0
}

async function scheduleReminder(owner, asset, data, session) {
  if (!data.remind || !data.expectedOn) return closeReminders(owner, asset._id, session, 'cancel')
  // This query and all writes run behind the existing workspace transaction lock.
  const rows = await Reminder.find({ owner, kind: 'assetReceipt', linkId: asset._id, deletedAt: null }).sort({ createdAt: -1 }).session(session)
  const row = rows.find(item => item.status === 'active') ?? rows[0]
  const duplicates = rows.filter(item => item !== row && item.status === 'active')
  for (const duplicate of duplicates) {
    duplicate.status = 'cancelled'
    duplicate.history.push({ occurrence: duplicate.dueOn, action: 'cancel', recordedAt: new Date() })
    await duplicate.save({ session })
  }
  if (row?.status === 'active' && row.dueOn === data.expectedOn) return duplicates.length > 0
  const values = { name: ('Receber venda · ' + asset.name).slice(0, 120), dueOn: data.expectedOn, anchor: Number(data.expectedOn.slice(-2)),
    amount: asset.sale.amount, frequency: 'once', status: 'active', description: 'Lembrete informativo. Confirme o pagamento no bem vendido.',
    time: '', leadDays: 0, snoozedUntil: undefined, readOccurrence: undefined }
  if (row) {
    row.history.push({ occurrence: row.dueOn, action: row.dueOn === data.expectedOn ? 'activate' : 'reschedule', recordedAt: new Date() })
    row.set(values)
    await row.save({ session })
  } else await Reminder.create([{ ...values, owner, kind: 'assetReceipt', linkId: asset._id }], { session })
  return true
}

export function registerAssetReceiptRoutes(app, { createOnce, saveEntry }) {
  app.post('/api/ledger/assets/:id/receipt', async (req, res) => {
    const assetId = id(req.params.id), owner = req.owner
    const data = receiptInput(req.body)
    const result = await createOnce(req, 'assets/' + assetId + '/receipt', data, async session => {
      const asset = await Asset.findOne({ _id: assetId, owner, deletedAt: null, status: 'sold' }).session(session)
      if (!asset?.sale?.date) throw new RequestError(404, 'Venda não encontrada.')
      if (data.saleKey !== saleKey(asset.sale)) throw new RequestError(409, 'A operação mudou. Atualize o bem vendido.')
      const sale = asset.sale
      if (data.action === 'correct') {
        if (!sale.cancelledAt || sale.entryId) throw new RequestError(409, 'Cancele a venda sem recebimento ativo antes de registrar a correção.')
        if (data.date > today() || data.date < (asset.acquiredOn ?? '0001-01-01') ||
          await Valuation.exists({ owner, assetId, date: { $gt: data.date } }).session(session)) {
          throw new RequestError(400, 'A nova venda precisa respeitar a aquisição, as avaliações e a data de hoje.')
        }
        asset.saleHistory ??= []
        asset.saleHistory.push(sale.toObject())
        asset.sale = { date: data.date, amount: data.amount, cost: sale.cost, operationId: randomUUID(),
          history: [{ action: 'correct', reason: data.reason, previousOperation: saleKey(sale), recordedAt: new Date() }] }
        asset.endedOn = data.date
        await asset.save({ session })
        return
      }
      if (sale.cancelledAt) throw new RequestError(409, 'A venda está cancelada e não pode receber pagamentos.')
      if (data.action === 'reverse') {
        if (!sale.entryId) throw new RequestError(409, 'Não há recebimento para cancelar.')
        const entry = await Entry.findOne({ owner, _id: sale.entryId, assetId, assetOperation: 'sale', cancelledAt: null }).session(session)
        if (!entry || entry.type !== 'income' || entry.amount !== sale.amount || entry.goalId ||
          !await Account.exists({ owner, _id: entry.accountId, deletedAt: null, archived: { $ne: true } }).session(session)) {
          throw new RequestError(409, 'O vínculo financeiro precisa ser revisado antes do cancelamento.')
        }
        const at = new Date()
        entry.cancelledAt = at
        entry.revisions ??= []
        entry.revisions.push({ action: 'cancelAssetReceipt', reason: data.reason, recordedAt: at, assetId })
        await entry.save({ session })
        audit(asset, { action: 'reverse', entryId: entry._id, accountId: entry.accountId, date: entry.date, amount: entry.amount, reason: data.reason })
        sale.entryId = undefined
        await asset.save({ session })
        return
      }
      if (sale.entryId) throw new RequestError(409, 'A venda já possui recebimento vinculado. Nenhum lançamento foi duplicado.')
      if (data.action === 'cancel') {
        sale.cancelledAt = new Date()
        sale.cancellationReason = data.reason
        audit(asset, { action: 'cancel', reason: data.reason })
        await closeReminders(owner, assetId, session, 'cancel')
      } else if (data.action === 'schedule') {
        if (data.expectedOn && data.expectedOn < sale.date) throw new RequestError(400, 'A previsão deve ser a partir da data da venda.')
        // Both values are validated calendar dates (YYYY-MM-DD), without time or timezone conversion.
        const dateChanged = (sale.expectedOn ?? null) !== data.expectedOn
        const reminderChanged = await scheduleReminder(owner, asset, data, session)
        if (dateChanged) {
          audit(asset, { action: 'schedule', previousDate: sale.expectedOn ?? null, nextDate: data.expectedOn, remind: data.remind })
          sale.expectedOn = data.expectedOn
        } else if (reminderChanged) audit(asset, { action: 'reminder', enabled: Boolean(data.remind && data.expectedOn) })
        if (dateChanged || reminderChanged) await asset.save({ session })
        return { mutation: { changed: dateChanged || reminderChanged, dateChanged, reminderChanged,
          message: dateChanged ? 'Previsão atualizada.' : reminderChanged ? 'Lembrete atualizado.' : 'Nenhuma alteração: a previsão e o lembrete permanecem iguais.' } }
      } else {
        let entry
        if (data.action === 'link') {
          entry = await Entry.findOne({ owner, _id: data.entryId, type: 'income', amount: sale.amount,
            date: { $gte: sale.date, $lte: today() }, cancelledAt: null, assetId: null, assetOperation: null, goalId: null }).session(session)
          if (!entry) throw new RequestError(409, 'Escolha um recebimento integral disponível, a partir da data da venda e até hoje.')
          if (await Asset.exists({ owner, 'sale.entryId': entry._id }).session(session)) throw new RequestError(409, 'O recebimento já está referenciado por outra venda.')
        }
        const accountId = entry?.accountId ?? data.accountId
        if (!await Account.exists({ owner, _id: accountId, deletedAt: null, archived: { $ne: true } }).session(session)) {
          throw new RequestError(409, 'Escolha uma conta ativa para o recebimento.')
        }
        if (data.action === 'confirm') {
          if (data.date < sale.date || data.date > today()) throw new RequestError(400, 'Informe uma data efetiva entre a venda e hoje.')
          if (await Entry.exists({ owner, type: 'income', amount: sale.amount, date: data.date, accountId, cancelledAt: null }).session(session)) {
            throw new RequestError(409, 'Já existe um recebimento com esta conta, data e valor. Vincule o lançamento existente.')
          }
          const entryId = new mongoose.Types.ObjectId()
          await saveEntry(owner, { _id: entryId, type: 'income', description: ('Recebimento de venda · ' + asset.name).slice(0, 120),
            amount: sale.amount, date: data.date, accountId, category: 'Patrimônio', assetId, assetOperation: 'sale', assetReceiptSource: 'new' }, null, session)
          sale.entryId = entryId
        } else {
          entry.assetId = assetId
          entry.assetOperation = 'sale'
          entry.assetReceiptSource = 'existing'
          await entry.save({ session })
          sale.entryId = entry._id
        }
        audit(asset, { action: data.action, entryId: sale.entryId, date: entry?.date ?? data.date, accountId, amount: sale.amount })
        await closeReminders(owner, assetId, session, 'received')
      }
      await asset.save({ session })
    })
    res.status(result.mutation?.changed === false ? 200 : 201).json(result)
  })
}
