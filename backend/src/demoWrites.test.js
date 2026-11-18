import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createApplication } from './application.js'
import { demoConfiguration, DEMO_EMAIL, DEMO_PASSWORD } from './demo.js'
import { createDemoStore, demoLimitMessage } from './demoStore.js'
import { today } from './cards.js'
import { saleKey } from '../../shared/assetReceipts.mjs'
import * as models from './models.js'

async function fixture(t, dailyLimit = 50) {
  const origin = 'http://localhost:5173'
  const server = createApplication({ origin, demo: demoConfiguration({ DEMO_MODE: 'true', DEMO_EMAIL,
    DEMO_PASSWORD, DEMO_DAILY_WRITE_LIMIT: String(dailyLimit) }) }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  async function request(path, { cookie, body, method = body ? 'POST' : 'GET', key = randomUUID() } = {}) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/api' + path, {
      method, headers: { Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': key,
        ...(cookie && { Cookie: cookie }) }, ...(body && { body: JSON.stringify(body) }) })
    return { status: response.status, data: await response.json(), cookie: response.headers.getSetCookie()[0]?.split(';')[0] }
  }
  const login = async () => {
    const result = await request('/auth/login', { body: { email: DEMO_EMAIL, password: DEMO_PASSWORD } })
    assert.equal(result.status, 200)
    return result.cookie
  }
  return { request, login }
}
const account = name => ({ name, kind: 'Corrente', initialBalance: 0 })

test('operações financeiras reais em memória, sem acesso aos modelos persistentes', async t => {
  const originals = []
  for (const model of Object.values(models)) for (const method of ['find', 'findOne', 'findById', 'create', 'updateOne', 'updateMany', 'deleteOne', 'exists', 'countDocuments']) {
    originals.push([model, method, model[method]])
    model[method] = () => { throw Error('A demonstração acessou o banco pessoal') }
  }
  t.after(() => { for (const [model, method, value] of originals) model[method] = value })
  const { request, login } = await fixture(t)
  const cookie = await login(), other = await login(), date = today()
  const read = () => request('/ledger', { cookie })
  const send = async (path, body, method = 'POST') => {
    const result = await request('/ledger' + path, { cookie, body, method })
    assert.ok(result.status < 300, JSON.stringify(result))
    return result.data
  }
  const initial = (await read()).data
  let data = await send('/accounts', account('Teste'))
  const a = data.accounts.find(row => row.name === 'Teste')._id
  const b = initial.accounts[0]._id
  data = await send('/accounts/' + a, { name: 'Conta editada', kind: 'Corrente', archived: false }, 'PUT')
  assert.equal(data.accounts.find(row => row._id === a).name, 'Conta editada')
  assert.equal((await request('/ledger', { cookie: other })).data.accounts.length, initial.accounts.length)
  data = await send('/entries', { type: 'income', description: 'Receita teste', amount: 10000, date, accountId: a, category: 'Geral' })
  const income = data.entries.find(row => row.description === 'Receita teste')._id
  assert.equal(data.total, initial.total + 10000)
  data = await send('/entries/' + income, { type: 'income', description: 'Receita editada', amount: 11000, date, accountId: a, category: 'Geral' }, 'PUT')
  assert.equal(data.total, initial.total + 11000)
  data = await send('/entries', { type: 'expense', description: 'Despesa teste', amount: 1000, date, accountId: a, category: 'Geral', expenseKind: 'variable' })
  const expense = data.entries.find(row => row.description === 'Despesa teste')._id
  assert.equal(data.total, initial.total + 10000)
  data = await send('/entries', { type: 'transfer', description: 'Transferência teste', amount: 500, date, accountId: a, destinationId: b })
  assert.equal(data.total, initial.total + 10000)
  data = await send('/entries/' + expense, undefined, 'DELETE')
  assert.equal(data.total, initial.total + 11000)
  assert.ok(data.cancelledEntries.some(row => row._id === expense))
  data = await send('/cards', { name: 'Cartão teste', limit: 50000, close: 5, due: 15 })
  const card = data.cards.find(row => row.name === 'Cartão teste')._id
  data = await send('/cards/' + card + '/events', { type: 'purchase', date, amount: 1000, description: 'Compra teste', category: 'Geral', installments: 1 })
  const invoice = data.cards.find(row => row._id === card).invoices.find(row => row.remaining === 1000)
  assert.ok(invoice)
  data = await send('/cards/' + card + '/events', { type: 'payment', date, amount: 1000, invoice: invoice.month, accountId: a })
  assert.equal(data.total, initial.total + 10000)
  assert.ok(data.entries.some(row => row.type === 'cardPayment' && row.cardId === card))
  data = await send('/budgets', { month: date.slice(0, 7), category: 'Teste', limit: 30000 })
  const budget = data.budgets.find(row => row.category === 'Teste')._id
  data = await send('/budgets/' + budget, { month: date.slice(0, 7), category: 'Teste', limit: 40000 }, 'PUT')
  assert.equal(data.budgets.find(row => row._id === budget).limit, 40000)
  data = await send('/goals', { name: 'Meta teste', target: 20000 })
  const goal = data.goals.find(row => row.name === 'Meta teste')._id
  data = await send('/goals/' + goal, { name: 'Meta editada', target: 30000 }, 'PUT')
  data = await send('/goals/' + goal + '/events', { amount: 500, accountId: a, destinationId: b })
  assert.equal(data.goals.find(row => row._id === goal).saved, 500)
  assert.equal(data.total, initial.total + 10000)
  data = await send('/reminders', { name: 'Lembrete teste', dueOn: date, frequency: 'once' })
  const reminder = data.reminders.find(row => row.name === 'Lembrete teste')._id
  data = await send('/reminders/' + reminder, { name: 'Lembrete editado', dueOn: date, frequency: 'monthly' }, 'PUT')
  assert.equal(data.reminders.find(row => row._id === reminder).frequency, 'monthly')
  data = await send('/assets', { name: 'Bem teste', kind: 'equipment', acquired: 2000, acquiredOn: date, value: 2000, date })
  const asset = data.assets.find(row => row.name === 'Bem teste')._id
  data = await send('/assets/' + asset + '/valuations', { value: 2500, date })
  assert.equal(data.assets.find(row => row._id === asset).valuations.length, 2)
  data = await send('/assets/' + asset + '/operations', { type: 'sale', mode: 'note', date, amount: 2500 })
  const sale = data.assets.find(row => row._id === asset).sale
  data = await send('/assets/' + asset + '/receipt', { action: 'schedule', saleKey: saleKey(sale), expectedOn: date, remind: true })
  assert.ok(data.reminders.some(row => row.kind === 'assetReceipt' && row.linkId === asset))
  data = await send('/assets/' + asset + '/receipt', { action: 'confirm', saleKey: saleKey(sale), confirmed: true, date, accountId: a })
  assert.equal(data.total, initial.total + 12500)
  data = await send('/assets/' + asset + '/receipt', { action: 'reverse', saleKey: saleKey(sale), confirmed: true, reason: 'Teste de estorno' })
  assert.equal(data.total, initial.total + 10000)
  data = await send('/assets/' + asset + '/receipt', { action: 'cancel', saleKey: saleKey(sale), confirmed: true, reason: 'Teste de cancelamento' })
  data = await send('/assets/' + asset + '/receipt', { action: 'correct', saleKey: saleKey(sale), confirmed: true, reason: 'Teste de correção', date, amount: 2600 })
  assert.equal(data.assets.find(row => row._id === asset).saleHistory.length, 1)
  const report = await request('/ledger/reports?from=' + date.slice(0, 7) + '-01&through=' + date, { cookie })
  assert.equal(report.status, 200)
  assert.ok(report.data.income >= 11000)
  const refreshed = (await read()).data
  assert.equal(refreshed.total, data.total)
  assert.equal((await request('/ledger', { cookie: other })).data.total, initial.total)
  data = await send('/accounts', account('Excluir'))
  const disposable = data.accounts.find(row => row.name === 'Excluir')._id
  data = await send('/accounts/' + disposable, undefined, 'DELETE')
  assert.ok(data.accounts.find(row => row._id === disposable).deletedAt)
  await request('/auth/logout', { cookie, body: {} })
  assert.equal((await read()).status, 401)
  assert.equal((await request('/ledger', { cookie: await login() })).data.total, initial.total)
})

test('cota conta somente mudanças concluídas, serializa duplicatas e mantém consultas', async t => {
  const { request, login } = await fixture(t, 2), cookie = await login()
  const key = randomUUID(), body = account('Uma operação')
  assert.equal((await request('/ledger/accounts', { cookie, body: {} })).status, 400)
  const duplicates = await Promise.all(Array.from({ length: 5 }, () => request('/ledger/accounts', { cookie, body, key })))
  assert.ok(duplicates.every(row => row.status === 201))
  assert.equal(duplicates[0].data.accounts.length, 3)
  const id = duplicates[0].data.accounts.find(row => row.name === body.name)._id
  assert.equal((await request('/ledger/accounts/' + id, { cookie, body: { name: body.name, kind: body.kind, archived: false }, method: 'PUT' })).status, 200)
  const parallel = await Promise.all(['Segunda', 'Terceira'].map(name => request('/ledger/accounts', { cookie, body: account(name) })))
  assert.deepEqual(parallel.map(row => row.status).sort(), [201, 429])
  assert.equal(parallel.find(row => row.status === 429).data.message, demoLimitMessage)
  assert.equal((await request('/ledger', { cookie })).data.accounts.length, 4)
  assert.equal((await request('/ledger/accounts', { cookie, body, key })).status, 201)
  assert.equal((await request('/ledger/accounts', { cookie, body: account('Outra'), key })).status, 409)
  assert.equal((await request('/auth/session', { cookie })).data.user.demo, true)
  assert.equal((await request('/ledger/reports?from=2026-11-01&through=2026-11-18', { cookie })).status, 200)
})

test('limite por endereço permanece entre logins e renova no próximo dia', async t => {
  const { request, login } = await fixture(t, 1)
  for (let i = 0; i < 4; i++) {
    const cookie = await login()
    assert.equal((await request('/ledger/accounts', { cookie, body: account('Conta ' + i) })).status, 201)
    await request('/auth/logout', { cookie, body: {} })
  }
  const cookie = await login()
  assert.equal((await request('/ledger/accounts', { cookie, body: account('Bloqueada') })).status, 429)
  const now = Date.now
  Date.now = () => now() + 86400000
  try {
    const fresh = await login()
    assert.equal((await request('/ledger/accounts', { cookie: fresh, body: account('Novo dia') })).status, 201)
    assert.equal((await request('/ledger', { cookie })).status, 401)
  } finally { Date.now = now }
})

test('cota da mesma sessão renova na virada do dia civil em São Paulo', async t => {
  const { request, login } = await fixture(t, 1)
  const now = Date.now
  let clock = Date.parse('2026-11-19T02:59:00Z')
  Date.now = () => clock
  try {
    const cookie = await login()
    assert.equal((await request('/ledger/accounts', { cookie, body: account('Antes da meia-noite') })).status, 201)
    assert.equal((await request('/ledger/accounts', { cookie, body: account('Ainda no mesmo dia') })).status, 429)
    clock += 120000
    assert.equal((await request('/ledger/accounts', { cookie, body: account('Depois da meia-noite') })).status, 201)
    assert.equal((await request('/ledger', { cookie })).data.accounts.length, 4)
  } finally { Date.now = now }
})

test('armazenamento descarta transações inválidas, limita memória e fila e verifica revogação', async () => {
  const store = createDemoStore()
  const session = { data: store.seed('test'), until: Date.now() + 3600000, queue: Promise.resolve(), pending: 0 }
  let commits = 0
  const run = operation => store.run({ session, commit: () => commits++ }, () => store.connection.transaction(operation))
  const before = JSON.stringify(session.data)
  await assert.rejects(run(async () => {
    await store.models.Account.create([account('Incompleta')]) // No owner: schema validation must fail.
  }))
  assert.equal(JSON.stringify(session.data), before)
  await assert.rejects(run(async () => {
    await store.models.Receipt.create([{ _id: 'large', fingerprint: 'x'.repeat(512 * 1024) }])
  }), /capacidade/)
  assert.equal(JSON.stringify(session.data), before)
  assert.equal(commits, 0)
  let unblock
  const gate = new Promise(resolve => { unblock = resolve })
  const pending = Array.from({ length: 8 }, () => run(() => gate))
  await assert.rejects(run(async () => {}), /simultâneas/)
  unblock()
  await Promise.all(pending)
  session.closed = true
  session.data = null
  await assert.rejects(run(async () => {}), /Entre para acessar/)
  assert.equal(session.pending, 0)
})

test('limita verificações de senha simultâneas e criação de sessões entre janelas de frequência', async t => {
  const { request, login } = await fixture(t)
  const attempts = await Promise.all(Array.from({ length: 6 }, () => request('/auth/login', { body: { email: DEMO_EMAIL, password: DEMO_PASSWORD } })))
  assert.equal(attempts.filter(row => row.status === 200).length, 4)
  assert.equal(attempts.filter(row => row.status === 429).length, 2)
  const now = Date.now
  let elapsed = 0
  Date.now = () => now() + elapsed
  try {
    for (let window = 0; window < 3; window++) {
      elapsed += 16 * 60 * 1000
      for (let i = 0; i < (window === 2 ? 4 : 6); i++) await login()
    }
    const blocked = await request('/auth/login', { body: { email: DEMO_EMAIL, password: DEMO_PASSWORD } })
    assert.equal(blocked.status, 429)
    assert.match(blocked.data.message, /sessões/)
  } finally { Date.now = now }
})
