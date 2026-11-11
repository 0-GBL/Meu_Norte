import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import mongoose from 'mongoose'
import { createApp } from './app.js'
import { hashPassword } from './auth.js'
import * as models from './models.js'
import { receiptInput } from './assetReceipts.js'
import { receiptState, saleKey } from '../../shared/assetReceipts.mjs'

test('recebimento rejeita edição do preço, custo e confirmação implícita', () => {
  for (const action of ['schedule', 'confirm', 'link', 'reverse', 'cancel']) {
    assert.throws(() => receiptInput({ action, saleKey: 'original', amount: 1, cost: 1 }), /campos/)
  }
  assert.throws(() => receiptInput({ action: 'confirm', saleKey: 'original', accountId: 'a'.repeat(24), date: '2025-02-02' }), /explicitamente/)
  assert.throws(() => receiptInput({ action: 'cancel', saleKey: 'original', confirmed: true, reason: '' }), /justificativa/)
})

test('situações derivadas usam datas civis e não confirmam automaticamente', () => {
  const asset = { sale: { date: '2025-01-01', amount: 1800000 } }
  assert.equal(receiptState(asset, [], '2026-11-11').status, 'pending')
  asset.sale.expectedOn = '2026-11-11'
  assert.equal(receiptState(asset, [], '2026-11-11').status, 'scheduled')
  assert.equal(receiptState(asset, [], '2026-11-12').status, 'overdue')
  asset.sale.entryId = 'receipt'
  assert.equal(receiptState(asset, [{ _id: 'receipt', type: 'income', date: '2026-11-11', amount: 1800000 }], '2026-11-11').status, 'received')
  asset.sale.cancelledAt = new Date()
  assert.equal(receiptState(asset, [], '2026-11-11').status, 'cancelled')
})

test('previsões usam somente datas de calendário, independentemente do fuso', () => {
  const module = new URL('./assetReceipts.js', import.meta.url).href
  const script = `import { receiptInput } from ${JSON.stringify(module)}; console.log(JSON.stringify(receiptInput({action:'schedule',saleKey:'original',expectedOn:'2026-11-11',remind:true})))`
  const results = ['UTC', 'America/Sao_Paulo', 'America/New_York', 'Pacific/Kiritimati'].map(TZ =>
    execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' }))
  results.forEach(result => assert.equal(result, results[0]))
  for (const expectedOn of ['2026-11-11T00:00:00Z', '2026-11-11T00:00:00-03:00', '2026-02-29']) {
    assert.throws(() => receiptInput({ action: 'schedule', saleKey: 'original', expectedOn, remind: false }), /data válida/)
  }
})

const uri = process.env.MONGODB_TEST_URI
test('recebimentos patrimoniais: API transacional em MongoDB local isolado', { skip: !uri }, async t => {
  assert.match(uri, /^mongodb:\/\/(127\.0\.0\.1|localhost):/, 'Esta suíte só aceita MongoDB local; use npm run test:isolated.')
  await mongoose.connect(uri, { dbName: 'meu_norte_receipts_' + randomUUID().replaceAll('-', ''), serverSelectionTimeoutMS: 10000 })
  t.after(async () => { try { await mongoose.connection.dropDatabase() } finally { await mongoose.disconnect() } })
  await Promise.all(Object.values(models).map(model => model.init()))
  const password = 'senha-ficticia-recebimentos-123'
  const user = await models.User.create({ name: 'Administrador teste', email: 'receipts@example.test', role: 'admin', passwordHash: await hashPassword(password) })
  const owner = String(user._id)
  await models.Workspace.create({ _id: owner })
  const origin = 'http://localhost:5173'
  const server = createApp({ origin }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = 'http://127.0.0.1:' + server.address().port + '/api'
  const login = await fetch(base + '/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie').split(';')[0]
  async function request(method, path = '', body, key = randomUUID(), credentials = cookie) {
    const response = await fetch(base + '/ledger' + path, { method, headers: { Cookie: credentials, Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: body && JSON.stringify(body) })
    return { status: response.status, data: await response.json() }
  }
  const created = await request('POST', '/accounts', { name: 'Conta de teste', kind: 'Corrente', initialBalance: 0 })
  const accountId = created.data.accounts[0]._id
  async function legacySale(extra = {}) {
    const asset = await models.Asset.create({ owner, name: 'Veículo Teste Venda', kind: 'vehicle', acquired: 2000000,
      acquiredOn: '2025-01-01', endedOn: '2025-01-10', status: 'sold',
      sale: { date: '2025-01-10', amount: 1800000, cost: 2000000 }, ...extra })
    return { asset, path: '/assets/' + asset._id + '/receipt', key: saleKey(asset.sale) }
  }
  const act = (fixture, action, extra = {}, key) => request('POST', fixture.path, { action, saleKey: fixture.key, ...extra }, key)

  await t.test('mesma previsão não altera histórico, leitura, notificações ou timestamps', async () => {
    const fixture = await legacySale()
    await act(fixture, 'schedule', { expectedOn: '2026-11-11', remind: true })
    await models.Reminder.updateOne({ owner, linkId: fixture.asset._id }, { $set: { readOccurrence: '2026-11-11' } })
    const beforeAsset = await models.Asset.findById(fixture.asset._id).lean()
    const beforeReminders = await models.Reminder.find({ owner, linkId: fixture.asset._id }).lean()
    const key = randomUUID()
    for (const sendKey of [key, key, randomUUID()]) {
      const response = await act(fixture, 'schedule', { expectedOn: '2026-11-11', remind: true }, sendKey)
      assert.equal(response.status, 200)
      assert.deepEqual(response.data.mutation, { changed: false, dateChanged: false, reminderChanged: false,
        message: 'Nenhuma alteração: a previsão e o lembrete permanecem iguais.' })
    }
    const concurrent = await Promise.all([act(fixture, 'schedule', { expectedOn: '2026-11-11', remind: true }),
      act(fixture, 'schedule', { expectedOn: '2026-11-11', remind: true })])
    concurrent.forEach(response => assert.equal(response.status, 200))
    assert.deepEqual(await models.Asset.findById(fixture.asset._id).lean(), beforeAsset)
    assert.deepEqual(await models.Reminder.find({ owner, linkId: fixture.asset._id }).lean(), beforeReminders)
  })

  await t.test('previsão ausente e nula são equivalentes e não criam eventos vazios', async () => {
    const fixture = await legacySale()
    const before = await models.Asset.findById(fixture.asset._id).lean()
    const response = await act(fixture, 'schedule', { expectedOn: null, remind: false })
    assert.equal(response.status, 200)
    assert.equal(response.data.mutation.changed, false)
    assert.deepEqual(await models.Asset.findById(fixture.asset._id).lean(), before)
    assert.equal(await models.Reminder.countDocuments({ owner, linkId: fixture.asset._id }), 0)
  })

  await t.test('mudanças reais entre meses preservam registros antigos e atualizam um único lembrete', async () => {
    const fixture = await legacySale()
    fixture.asset.sale.history = [{ action: 'schedule', previousDate: '2026-11-11', nextDate: '2026-11-11', recordedAt: new Date('2026-11-11T15:00:00Z') }]
    await fixture.asset.save()
    const original = (await models.Asset.findById(fixture.asset._id).lean()).sale.history[0]
    for (const expectedOn of ['2026-11-11', '2026-12-11', '2027-02-28']) {
      const response = await act(fixture, 'schedule', { expectedOn, remind: true })
      assert.equal(response.status, 201)
      assert.equal(response.data.mutation.dateChanged, true)
    }
    const saved = await models.Asset.findById(fixture.asset._id).lean()
    assert.deepEqual(saved.sale.history[0], original, 'Eventos antigos, inclusive redundantes, não são apagados')
    assert.deepEqual(saved.sale.history.slice(1).map(row => [row.previousDate, row.nextDate]), [[null, '2026-11-11'], ['2026-11-11', '2026-12-11'], ['2026-12-11', '2027-02-28']])
    assert.equal(await models.Reminder.countDocuments({ owner, linkId: fixture.asset._id }), 1)
    assert.equal((await models.Reminder.findOne({ owner, linkId: fixture.asset._id })).dueOn, '2027-02-28')
    assert.equal(saved.sale.amount, 1800000)
    assert.equal(saved.sale.cost, 2000000)
  })

  await t.test('alterar somente o lembrete não é registrado como reagendamento', async () => {
    const fixture = await legacySale()
    await act(fixture, 'schedule', { expectedOn: '2026-11-11', remind: false })
    const enabled = await act(fixture, 'schedule', { expectedOn: '2026-11-11', remind: true })
    assert.equal(enabled.data.mutation.dateChanged, false)
    assert.equal(enabled.data.mutation.reminderChanged, true)
    const disabled = await act(fixture, 'schedule', { expectedOn: '2026-11-11', remind: false })
    assert.equal(disabled.data.mutation.message, 'Lembrete atualizado.')
    const count = (await models.Asset.findById(fixture.asset._id)).sale.history.length
    assert.equal((await act(fixture, 'schedule', { expectedOn: '2026-11-11', remind: false })).status, 200)
    const asset = await models.Asset.findById(fixture.asset._id).lean()
    assert.equal(asset.sale.history.length, count)
    assert.deepEqual(asset.sale.history.map(row => row.action), ['schedule', 'reminder', 'reminder'])
    assert.equal(await models.Reminder.countDocuments({ owner, linkId: fixture.asset._id, status: 'active' }), 0)
  })

  await t.test('compatibilidade legada, previsão, reagendamento e lembrete sem caixa', async () => {
    const fixture = await legacySale()
    const before = (await request('GET')).data
    const first = await act(fixture, 'schedule', { expectedOn: '2025-03-01', remind: true })
    assert.equal(first.status, 201)
    assert.equal(first.data.total, before.total)
    assert.deepEqual(first.data.entries, before.entries)
    const next = await act(fixture, 'schedule', { expectedOn: '2099-03-01', remind: true })
    assert.equal(next.status, 201)
    const asset = next.data.assets.find(row => row._id === String(fixture.asset._id))
    assert.equal(asset.sale.amount, 1800000)
    assert.equal(asset.sale.cost, 2000000)
    assert.equal(asset.sale.history[1].previousDate, '2025-03-01')
    assert.equal(asset.sale.history[1].nextDate, '2099-03-01')
    const reminders = next.data.reminders.filter(row => row.linkId === String(fixture.asset._id) && row.status === 'active')
    assert.equal(reminders.length, 1)
    assert.equal(reminders[0].dueOn, '2099-03-01')
    assert.equal(reminders[0].history[0].action, 'reschedule')
    const snooze = await request('POST', '/reminders/' + reminders[0]._id + '/actions', { action: 'snooze', occurrence: '2099-03-01', until: '2099-04-01' })
    assert.equal(snooze.status, 409)
    const dismissed = await request('POST', '/reminders/' + reminders[0]._id + '/actions', { action: 'confirm', occurrence: '2099-03-01' })
    assert.equal(dismissed.status, 201)
    assert.equal(dismissed.data.total, before.total)
    assert.ok(!dismissed.data.assets.find(row => row._id === String(fixture.asset._id)).sale.entryId)
    const rescheduled = await act(fixture, 'schedule', { expectedOn: '2099-04-01', remind: true })
    assert.equal(rescheduled.data.reminders.filter(row => row.linkId === String(fixture.asset._id) && row.status === 'active').length, 1)
    assert.equal((await act(fixture, 'schedule', { expectedOn: '2025-03-01', remind: false, amount: 1 })).status, 400)
    assert.equal((await request('PUT', '/assets/' + fixture.asset._id, { name: 'alterado', kind: 'vehicle', acquired: 1 })).status, 404)
    assert.equal((await request('POST', fixture.path, { action: 'schedule', saleKey: fixture.key, expectedOn: null, remind: false }, randomUUID(), 'meunorte=invalid')).status, 401)
  })

  await t.test('confirmação integral, idempotência, saldos, referências, relatórios e lembretes', async () => {
    const fixture = await legacySale()
    await models.Valuation.create({ owner, assetId: fixture.asset._id, value: 1900000, date: '2025-01-05', notes: 'Histórico preservado' })
    await act(fixture, 'schedule', { expectedOn: '2099-01-01', remind: true })
    const before = (await request('GET')).data
    const key = randomUUID()
    const payload = { accountId, date: '2025-02-02', confirmed: true }
    const responses = await Promise.all([act(fixture, 'confirm', payload, key), act(fixture, 'confirm', payload, key)])
    responses.forEach(result => assert.equal(result.status, 201))
    const after = (await request('GET')).data
    assert.equal(after.total, before.total + 1800000)
    const asset = after.assets.find(row => row._id === String(fixture.asset._id))
    const entry = after.entries.find(row => row._id === asset.sale.entryId)
    assert.equal(entry.assetId, String(fixture.asset._id))
    assert.equal(entry.amount, 1800000)
    assert.equal(entry.date, '2025-02-02')
    assert.equal(entry.accountId, accountId)
    assert.equal(asset.valuations.length, 1)
    assert.equal(asset.sale.amount - asset.sale.cost, -200000)
    assert.equal(after.reminders.find(row => row.linkId === String(fixture.asset._id)).status, 'completed')
    assert.equal((await request('POST', '/reminders/' + after.reminders.find(row => row.linkId === String(fixture.asset._id))._id + '/actions', { action: 'reactivate' })).status, 409)
    assert.equal((await act(fixture, 'confirm', payload)).status, 409)
    assert.equal((await request('DELETE', '/entries/' + entry._id)).status, 409)
    assert.equal((await act(fixture, 'cancel', { confirmed: true, reason: 'Erro de valor' })).status, 409)
    const report = await request('GET', '/reports?from=2025-02-01&through=2025-02-28')
    assert.equal(report.data.assetIncome, 1800000)
    assert.equal(report.data.cash, 1800000)
    assert.equal(report.data.income, 0)
    assert.equal(report.data.comparison.result.value, 0)
    assert.equal(report.data.position.evaluatedAssets, 0)
    assert.equal(report.data.receipts[0].assetId, String(fixture.asset._id))
  })

  await t.test('vínculo existente não duplica saldo e rejeita valor, data ou situação inválidos', async () => {
    const fixture = await legacySale()
    const receipt = await request('POST', '/entries', { type: 'income', amount: 1800000, date: '2025-03-02', accountId, category: 'Venda', description: 'Recebimento existente' })
    const entry = receipt.data.entries.find(row => row.description === 'Recebimento existente')
    const linked = await act(fixture, 'link', { entryId: entry._id, confirmed: true })
    assert.equal(linked.status, 201)
    assert.equal(linked.data.total, receipt.data.total)
    assert.equal(linked.data.entries.length, receipt.data.entries.length)
    assert.equal(linked.data.assets.find(row => row._id === String(fixture.asset._id)).sale.entryId, entry._id)
    assert.equal(linked.data.entries.find(row => row._id === entry._id).assetReceiptSource, 'existing')
    const other = await legacySale()
    assert.equal((await act(other, 'link', { entryId: entry._id, confirmed: true })).status, 409)
    for (const extra of [{ amount: 1 }, { cancelledAt: new Date() }, { goalId: new mongoose.Types.ObjectId() }, { date: '2024-12-01' }, { date: '2099-01-01' }]) {
      const invalid = await models.Entry.create({ owner, type: 'income', amount: 1800000, date: '2025-03-02', accountId, ...extra })
      assert.equal((await act(other, 'link', { entryId: String(invalid._id), confirmed: true })).status, 409)
      await models.Entry.deleteOne({ _id: invalid._id })
    }
    // A matching receipt already in the account must be linked, never silently duplicated.
    const available = await models.Entry.create({ owner, type: 'income', amount: 1800000, date: '2025-04-02', accountId })
    assert.equal((await act(other, 'confirm', { accountId, date: available.date, confirmed: true })).status, 409)
  })

  await t.test('contas arquivadas, excluídas e de outro proprietário são bloqueadas', async () => {
    const fixture = await legacySale()
    for (const attributes of [{ archived: true }, { deletedAt: new Date() }, { owner: 'outro-proprietario' }]) {
      const account = await models.Account.create({ owner, name: 'Indisponível', initialBalance: 0, ...attributes })
      assert.equal((await act(fixture, 'confirm', { accountId: String(account._id), date: '2025-02-03', confirmed: true })).status, 409)
      const entry = await models.Entry.create({ owner, type: 'income', amount: 1800000, accountId: account._id, date: '2025-02-03' })
      assert.equal((await act(fixture, 'link', { entryId: String(entry._id), confirmed: true })).status, 409)
      await models.Entry.deleteOne({ _id: entry._id })
      await models.Account.deleteOne({ _id: account._id })
    }
  })

  await t.test('cancelamento e nova operação preservam originais, custo e exclusão do total ativo', async () => {
    const fixture = await legacySale()
    await act(fixture, 'schedule', { expectedOn: '2025-03-01', remind: true })
    const cancelled = await act(fixture, 'cancel', { confirmed: true, reason: 'Preço da venda incorreto' })
    assert.equal(cancelled.status, 201)
    const old = cancelled.data.assets.find(row => row._id === String(fixture.asset._id))
    assert.equal(old.sale.amount, 1800000)
    assert.ok(old.sale.cancelledAt)
    assert.equal(old.status, 'sold')
    assert.equal(cancelled.data.reminders.find(row => row.linkId === String(fixture.asset._id)).status, 'cancelled')
    assert.equal((await act(fixture, 'confirm', { accountId, date: '2025-04-03', confirmed: true })).status, 409)
    assert.equal((await request('POST', '/assets/' + fixture.asset._id + '/operations', { type: 'sale', mode: 'note', amount: 1, date: '2025-04-03' })).status, 404)
    const corrected = await act(fixture, 'correct', { confirmed: true, reason: 'Registrar preço correto', amount: 1850000, date: '2025-01-10' })
    assert.equal(corrected.status, 201)
    const next = corrected.data.assets.find(row => row._id === String(fixture.asset._id))
    assert.equal(next.saleHistory[0].amount, 1800000)
    assert.ok(next.saleHistory[0].cancelledAt)
    assert.equal(next.sale.amount, 1850000)
    assert.equal(next.sale.cost, 2000000)
    assert.ok(!next.sale.entryId)
    assert.equal(next.status, 'sold')
    assert.equal((await act(fixture, 'schedule', { expectedOn: null, remind: false })).status, 409)
  })

  await t.test('cancelamento financeiro exige confirmação e mantém lançamento auditável', async () => {
    const fixture = await legacySale()
    const before = (await request('GET')).data
    const paid = await act(fixture, 'confirm', { accountId, date: '2025-05-01', confirmed: true })
    assert.equal(paid.status, 201)
    const entryId = paid.data.assets.find(row => row._id === String(fixture.asset._id)).sale.entryId
    assert.equal((await act(fixture, 'reverse', { reason: 'Recebimento incorreto' })).status, 400)
    const reversed = await act(fixture, 'reverse', { reason: 'Recebimento incorreto', confirmed: true })
    assert.equal(reversed.status, 201)
    assert.equal(reversed.data.total, before.total)
    assert.ok(reversed.data.cancelledEntries.find(row => row._id === entryId))
    assert.equal(reversed.data.cancelledEntries.find(row => row._id === entryId).assetId, String(fixture.asset._id))
    assert.ok((await models.Entry.findById(entryId)).revisions.some(row => row.reason === 'Recebimento incorreto'))
    assert.equal((await act(fixture, 'cancel', { reason: 'Corrigir venda', confirmed: true })).status, 201)
  })

  await t.test('requisições concorrentes com chaves diferentes geram apenas um recebimento', async () => {
    const fixture = await legacySale()
    const before = (await request('GET')).data.total
    const payload = { accountId, date: '2025-06-01', confirmed: true }
    const responses = await Promise.all([act(fixture, 'confirm', payload), act(fixture, 'confirm', payload), act(fixture, 'confirm', payload)])
    assert.deepEqual(responses.map(row => row.status).sort(), [201, 409, 409])
    assert.equal(await models.Entry.countDocuments({ owner, assetId: fixture.asset._id, cancelledAt: null }), 1)
    assert.equal((await request('GET')).data.total, before + 1800000)
  })

  await t.test('duas vendas concorrentes não podem reutilizar a mesma receita', async () => {
    const first = await legacySale(), second = await legacySale()
    const receipt = await request('POST', '/entries', { type: 'income', description: 'Receita única para vínculo',
      amount: 1800000, date: '2025-07-01', accountId, category: 'Patrimônio' })
    const entryId = receipt.data.entries.find(row => row.description === 'Receita única para vínculo')._id
    const responses = await Promise.all([act(first, 'link', { entryId, confirmed: true }), act(second, 'link', { entryId, confirmed: true })])
    assert.deepEqual(responses.map(row => row.status).sort(), [201, 409])
    assert.equal(await models.Asset.countDocuments({ owner, 'sale.entryId': entryId }), 1)
    assert.equal((await request('GET')).data.total, receipt.data.total)
  })
})
