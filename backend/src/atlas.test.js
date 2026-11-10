import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { test } from 'node:test'
import mongoose from 'mongoose'
import { createApp } from './app.js'
import * as models from './models.js'

const uri = process.env.MONGODB_TEST_URI

test('MongoDB: persistência, concorrência, módulos financeiros e autenticação', { skip: !uri }, async t => {
  const dbName = 'meu_norte_test_' + randomUUID().replaceAll('-', '')
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 5000 })
  t.after(async () => {
    try { await mongoose.connection.dropDatabase() }
    finally { await mongoose.disconnect() }
  })

  await Promise.all(Object.values(models).map(model => model.init()))
  await models.Workspace.create([{ _id: 'primeiro' }, { _id: 'segundo' }])

  async function client(owner) {
    const token = randomUUID()
    const app = createApp({ token, owner, origin: 'http://localhost:5173' })
    const server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')
    t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())))

    return async (method, path = '', payload, options = {}) => {
      const headers = { Authorization: 'Bearer ' + (options.token ?? token) }
      if (payload) headers['Content-Type'] = 'application/json'
      if (method === 'POST') headers['Idempotency-Key'] = options.key ?? randomUUID()
      const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/ledger' + path, {
        method, headers, body: payload && JSON.stringify(payload),
      })
      return { status: response.status, data: await response.json() }
    }
  }

  const first = await client('primeiro')
  const second = await client('segundo')
  assert.equal((await first('GET', '', undefined, { token: 'incorrect' })).status, 401)
  assert.equal((await first('POST', '/accounts', { name: 'Principal', kind: 'Corrente', initialBalance: 20000 })).status, 201)
  const created = await first('POST', '/accounts', { name: 'Reserva', kind: 'Poupança', initialBalance: 0 })
  assert.equal(created.status, 201)
  const [origin, destination] = created.data.accounts
  const transfer = { type: 'transfer', description: 'Aporte', date: '2026-11-10', amount: 5000, accountId: origin._id, destinationId: destination._id }
  const key = randomUUID()
  const results = await Promise.all([first('POST', '/entries', transfer, { key }), first('POST', '/entries', transfer, { key })])
  for (const result of results) assert.equal(result.status, 201)
  const ledger = (await first('GET')).data
  assert.deepEqual(ledger.accounts.map(account => account.balance), [15000, 5000])
  assert.equal(ledger.total, 20000)
  assert.equal(ledger.entries.length, 1)
  assert.equal((await first('POST', '/entries', { ...transfer, amount: 100 }, { key })).status, 409)

  assert.deepEqual((await second('GET')).data.accounts, [])
  assert.equal((await second('POST', '/entries', transfer)).status, 400)
  assert.equal((await second('PUT', '/accounts/' + destination._id, { name: 'Reserva', kind: 'Poupança', archived: true })).status, 404)
  assert.equal((await first('PUT', '/accounts/' + destination._id, { name: 'Reserva', kind: 'Poupança', archived: true })).status, 200)
  assert.equal((await first('POST', '/entries', transfer)).status, 400)
  const updated = await first('PUT', '/entries/' + ledger.entries[0]._id, { ...transfer, amount: 2000 })
  assert.deepEqual(updated.data.accounts.map(account => account.balance), [18000, 2000])
  const deleted = await first('DELETE', '/entries/' + ledger.entries[0]._id)
  assert.deepEqual(deleted.data.accounts.map(account => account.balance), [20000, 0])
  assert.deepEqual((await first('POST', '/entries', transfer, { key })).data.entries, [])

  const cardResult = await first('POST', '/cards', { name: 'Cartão', limit: 50000, close: 20, due: 10 })
  assert.equal(cardResult.status, 201)
  const card = cardResult.data.cards[0]
  const purchase = await first('POST', '/cards/' + card._id + '/events', {
    type: 'purchase', date: '2025-01-10', amount: 12000, description: 'Compra', category: 'Casa', installments: 3,
  })
  assert.equal(purchase.status, 201)
  assert.deepEqual(purchase.data.cards[0].invoices.map(row => row.charges), [4000, 4000, 4000])
  const payment = { type: 'payment', date: '2025-02-01', amount: 1000, invoice: '2025-01', accountId: origin._id }
  const paymentKey = randomUUID()
  const payments = await Promise.all(Array.from({ length: 2 }, () => first('POST', '/cards/' + card._id + '/events', payment, { key: paymentKey })))
  for (const result of payments) assert.equal(result.status, 201)
  const afterPayment = (await first('GET')).data
  assert.equal(afterPayment.total, 19000)
  assert.equal(afterPayment.cards[0].invoices[0].remaining, 3000)
  assert.equal(afterPayment.entries.length, 1)
  assert.equal((await first('DELETE', '/entries/' + afterPayment.entries[0]._id)).status, 409)
  assert.deepEqual((await second('GET')).data.cards, [])
  assert.equal((await second('POST', '/cards/' + card._id + '/events', payment)).status, 404)

  const budget = await first('POST', '/budgets', { month: '2025-01', category: 'casa', limit: 4500 })
  assert.equal(budget.data.budgets[0].spent, 4000)
  assert.equal(budget.data.budgets[0].status, 'near')
  const goal = (await first('POST', '/goals', { name: 'Reserva', target: 4000, monthly: 500 })).data.goals[0]
  assert.equal((await first('POST', '/goals/' + goal._id + '/events', { amount: -1 })).status, 400)
  const funded = await first('POST', '/goals/' + goal._id + '/events', { amount: 1000 })
  assert.equal(funded.data.goals[0].months, 6)
  assert.equal(funded.data.total, 19000)

  const reminder = (await first('POST', '/reminders', { name: 'Revisar', dueOn: '2025-01-31', amount: null, frequency: 'monthly' })).data.reminders[0]
  const confirmed = await first('POST', '/reminders/' + reminder._id + '/actions', { action: 'confirm', occurrence: '2025-01-31' })
  assert.equal(confirmed.data.reminders[0].dueOn, '2025-02-28')
  assert.equal(confirmed.data.entries.length, 1)
  const asset = await first('POST', '/assets', { name: 'Reserva registrada', kind: 'investment', acquired: null,
    accountId: origin._id, reviewOn: null, value: 30000, date: '2025-02-01' })
  assert.equal(asset.status, 201)
  assert.equal(asset.data.reports.find(row => row.month === '2025-02').netWorth, 19000)
  assert.equal(asset.data.reports.find(row => row.month === '2025-02').despesas, 4000)

  const originUrl = 'http://localhost:5173'
  let deliver
  const emailDelivery = new Promise(resolve => { deliver = resolve })
  const authServer = createApp({ origin: originUrl, sendReset: (email, link) => deliver({ email, link }) }).listen(0, '127.0.0.1')
  await once(authServer, 'listening')
  t.after(() => new Promise(resolve => authServer.close(resolve)))
  const authRequest = (path, body, cookie, origin = originUrl) => fetch('http://127.0.0.1:' + authServer.address().port + '/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: origin, ...(cookie && { Cookie: cookie }), ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body), signal: AbortSignal.timeout(10000),
  })
  const credentials = { email: 'financas@example.test', password: 'senha-de-teste-1234' }
  const registered = await authRequest('auth/register', { ...credentials, name: 'Teste' })
  assert.equal(registered.status, 200)
  const header = registered.headers.get('set-cookie')
  assert.match(header, /HttpOnly/i)
  assert.match(header, /SameSite=Strict/i)
  const cookie = header.split(';')[0]
  assert.equal((await authRequest('ledger', undefined, cookie)).status, 200)
  assert.deepEqual((await (await authRequest('ledger', undefined, cookie)).json()).accounts, [])
  assert.equal((await authRequest('auth/logout', {}, cookie, 'http://example.test')).status, 403)
  assert.equal((await authRequest('auth/forgot', { email: credentials.email })).status, 200)
  const delivery = await Promise.race([emailDelivery, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('E-mail de teste não recebido')), 5000)
    timer.unref()
  })])
  assert.equal(delivery.email, credentials.email)
  const reset = { token: new URL(delivery.link).hash.slice(7), password: 'outra-senha-de-teste-4567' }
  assert.equal((await authRequest('auth/reset', reset)).status, 200)
  assert.equal((await authRequest('auth/reset', reset)).status, 400)
  assert.equal((await authRequest('ledger', undefined, cookie)).status, 401)
  assert.equal((await authRequest('auth/login', credentials)).status, 401)
  assert.equal((await authRequest('auth/login', { ...credentials, password: reset.password })).status, 200)

  const savedDatabase = mongoose.connection.name
  await mongoose.disconnect()
  await mongoose.connect(uri, { dbName: savedDatabase, serverSelectionTimeoutMS: 5000 })
  assert.equal((await first('GET')).data.total, 19000)
})
