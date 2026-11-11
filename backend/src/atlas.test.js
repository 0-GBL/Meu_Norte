import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { test } from 'node:test'
import mongoose from 'mongoose'
import { createApp } from './app.js'
import { today } from './cards.js'
import { hashPassword } from './auth.js'
import { bootstrapAdmin } from './bootstrapAdmin.js'
import * as models from './models.js'

const uri = process.env.MONGODB_TEST_URI

test('MongoDB: persistência, concorrência, módulos financeiros e autenticação', { skip: !uri }, async t => {
  assert.match(uri, /^mongodb:\/\/(127\.0\.0\.1|localhost):/, 'Use npm run test:isolated; esta suíte não aceita Atlas ou outros servidores remotos.')
  const dbName = 'meu_norte_test_' + randomUUID().replaceAll('-', '')
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 5000 })
  t.after(async () => {
    try { await mongoose.connection.dropDatabase() }
    finally { await mongoose.disconnect() }
  })

  await Promise.all(Object.values(models).map(model => model.init()))
  const originUrl = 'http://localhost:5173'
  const seededPassword = 'senha-ficticia-do-teste'
  const passwordHash = await hashPassword(seededPassword)

  async function client(name) {
    const user = await models.User.create({ name, email: name + '@example.test', passwordHash })
    await models.Workspace.create({ _id: String(user._id) })
    const app = createApp({ origin: originUrl })
    const server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')
    t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
    const login = await fetch('http://127.0.0.1:' + server.address().port + '/api/auth/login', {
      method: 'POST', headers: { Origin: originUrl, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: seededPassword }),
    })
    assert.equal(login.status, 200)
    const cookie = login.headers.get('set-cookie').split(';')[0]

    return async (method, path = '', payload, options = {}) => {
      const headers = { Origin: originUrl, Cookie: options.cookie ?? cookie }
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
  assert.equal((await first('GET', '', undefined, { cookie: 'meunorte=invalid' })).status, 401)
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
  assert.equal(deleted.data.cancelledEntries[0]._id, ledger.entries[0]._id)
  assert.equal(deleted.data.cancelledEntries[0].amount, 2000)
  assert.deepEqual((await first('POST', '/entries', transfer, { key })).data.entries, [])

  const cardResult = await first('POST', '/cards', { name: 'Cartão', limit: 50000, close: 20, due: 10 })
  assert.equal(cardResult.status, 201)
  const card = cardResult.data.cards[0]
  const purchase = await first('POST', '/cards/' + card._id + '/events', {
    type: 'purchase', date: '2025-01-10', amount: 12000, description: 'Compra', category: 'Casa', installments: 3,
  })
  assert.equal(purchase.status, 201)
  assert.equal(purchase.data.total, 20000)
  assert.deepEqual(purchase.data.cards[0].invoices.map(row => row.charges), [4000, 4000, 4000])
  const payment = { type: 'payment', date: '2025-02-01', amount: 1000, invoice: '2025-01', accountId: origin._id }
  const paymentKey = randomUUID()
  const payments = await Promise.all(Array.from({ length: 2 }, () => first('POST', '/cards/' + card._id + '/events', payment, { key: paymentKey })))
  for (const result of payments) assert.equal(result.status, 201)
  const afterPayment = (await first('GET')).data
  assert.equal(afterPayment.total, 19000)
  assert.equal(afterPayment.cards[0].invoices[0].remaining, 3000)
  assert.equal(afterPayment.entries.length, 1)
  assert.equal(afterPayment.cards[0].available, purchase.data.cards[0].available + 1000)
  assert.equal((await first('POST', '/cards/' + card._id + '/events', payment)).status, 409)
  assert.equal((await first('DELETE', '/cards/' + card._id)).status, 409)
  assert.equal((await second('DELETE', '/cards/' + card._id)).status, 404)
  assert.equal((await first('DELETE', '/entries/' + afterPayment.entries[0]._id)).status, 409)
  assert.deepEqual((await second('GET')).data.cards, [])
  assert.equal((await second('POST', '/cards/' + card._id + '/events', payment)).status, 404)
  const spare = await first('POST', '/cards', { name: 'Cartão reserva', institution: 'Instituição de teste', limit: 20000, close: 15, due: 25 })
  const spareId = spare.data.cards.find(row => row.name === 'Cartão reserva')._id
  const editedCard = await first('PUT', '/cards/' + spareId, { name: 'Reserva', institution: 'Nova instituição', limit: 22000, close: 15, due: 25 })
  assert.equal(editedCard.data.cards.find(row => row._id === spareId).institution, 'Nova instituição')
  const removedCard = await first('DELETE', '/cards/' + spareId)
  assert.equal(removedCard.status, 200)
  assert.ok(removedCard.data.cards.find(row => row._id === spareId).deletedAt)
  assert.equal((await first('POST', '/cards/' + spareId + '/events', payment)).status, 404)

  const secondAccount = await second('POST', '/accounts', { name: 'Conta de teste', kind: 'Corrente', initialBalance: 1000 })
  assert.equal(secondAccount.status, 201)
  const secondId = secondAccount.data.accounts[0]._id
  const income = await second('POST', '/entries', { type: 'income', description: 'Receita de teste', date: '2025-02-02',
    amount: 5000, category: 'Receita', accountId: secondId })
  assert.equal(income.status, 201)
  const expense = await second('POST', '/entries', { type: 'expense', description: 'Despesa de teste', date: '2025-02-03',
    amount: 1700, category: 'Casa', expenseKind: 'fixed', accountId: secondId })
  assert.equal(expense.status, 201)
  assert.equal(expense.data.total, 4300)
  const reserve = await second('POST', '/accounts', { name: 'Reserva de teste', kind: 'Poupança', initialBalance: 0 })
  assert.equal(reserve.status, 201)
  const reserveId = reserve.data.accounts.find(row => row.name === 'Reserva de teste')._id
  const move = await second('POST', '/entries', { type: 'transfer', description: 'Transferência de teste',
    date: '2025-02-04', amount: 900, accountId: secondId, destinationId: reserveId })
  assert.equal(move.status, 201)
  assert.equal(move.data.total, 4300)

  const budget = await first('POST', '/budgets', { month: '2025-01', category: 'casa', limit: 4500 })
  assert.equal(budget.data.budgets[0].spent, 4000)
  assert.equal(budget.data.budgets[0].status, 'near')
  const budgetPath = '/budgets/' + budget.data.budgets[0]._id
  assert.equal((await second('DELETE', budgetPath)).status, 404)
  const editedBudget = await first('PUT', budgetPath, { month: '2025-01', category: 'casa', limit: 3500 })
  assert.equal(editedBudget.data.budgets[0].status, 'over')
  const deletedBudget = await first('DELETE', budgetPath)
  assert.deepEqual(deletedBudget.data.budgets, [])
  assert.equal(deletedBudget.data.reports.find(row => row.month === '2025-01').despesas, 4000)
  const goal = (await first('POST', '/goals', { name: 'Reserva', target: 4000, monthly: 500 })).data.goals[0]
  assert.equal((await first('POST', '/goals/' + goal._id + '/events', { amount: -1 })).status, 400)
  const funded = await first('POST', '/goals/' + goal._id + '/events', { amount: 1000 })
  assert.equal(funded.data.goals[0].months, 6)
  assert.equal(funded.data.total, 19000)

  const createdGoal = await second('POST', '/goals', { name: 'Viagem', description: 'Férias', deadline: '2028-05-01', target: 600 })
  const goalPath = '/goals/' + createdGoal.data.goals[0]._id
  const contribution = { amount: 400, accountId: secondId, destinationId: reserveId }
  assert.equal((await first('POST', goalPath + '/events', contribution)).status, 404)
  assert.equal((await second('POST', goalPath + '/events', { ...contribution, destinationId: origin._id })).status, 400)
  const contributionKey = randomUUID()
  const contributed = await Promise.all(Array.from({ length: 2 }, () =>
    second('POST', goalPath + '/events', contribution, { key: contributionKey })))
  for (const result of contributed) {
    assert.equal(result.status, 201)
    assert.equal(result.data.goals[0].saved, 400)
    assert.equal(result.data.total, 4300)
  }
  const informational = await second('POST', goalPath + '/events', { amount: 200 })
  assert.equal(informational.data.goals[0].completed, true)
  assert.equal((await second('POST', goalPath + '/events', { amount: -401, accountId: reserveId, destinationId: secondId })).status, 400)
  const withdrawn = await second('POST', goalPath + '/events', { amount: -150, accountId: reserveId, destinationId: secondId })
  assert.equal(withdrawn.data.goals[0].saved, 450)
  assert.equal(withdrawn.data.goals[0].completed, false)
  const goalTransfers = withdrawn.data.entries.filter(row => row.goalId)
  assert.equal(goalTransfers.length, 2)
  assert.equal((await second('DELETE', '/entries/' + goalTransfers[0]._id)).status, 409)
  assert.equal((await second('PUT', '/entries/' + goalTransfers[0]._id, transfer)).status, 409)
  assert.equal((await first('DELETE', goalPath)).status, 404)
  const removedGoal = await second('DELETE', goalPath)
  assert.deepEqual(removedGoal.data.goals, [])
  assert.equal(removedGoal.data.deletedGoals[0].events.length, 3)
  assert.equal(removedGoal.data.total, 4300)

  const reminder = (await first('POST', '/reminders', { name: 'Revisar', dueOn: '2025-01-31', amount: null, frequency: 'monthly' })).data.reminders[0]
  const confirmed = await first('POST', '/reminders/' + reminder._id + '/actions', { action: 'confirm', occurrence: '2025-01-31' })
  assert.equal(confirmed.data.reminders[0].dueOn, '2025-02-28')
  assert.equal(confirmed.data.entries.length, 1)
  const asset = await first('POST', '/assets', { name: 'Reserva registrada', kind: 'investment', acquired: null,
    accountId: origin._id, reviewOn: null, value: 30000, date: '2025-02-01' })
  assert.equal(asset.status, 201)
  assert.equal(asset.data.reports.find(row => row.month === '2025-02').netWorth, 19000)
  assert.equal(asset.data.reports.find(row => row.month === '2025-02').despesas, 4000)

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
  const existingUser = await models.User.create({ email: credentials.email, name: 'Teste', passwordHash: await hashPassword(credentials.password) })
  await models.Workspace.create({ _id: String(existingUser._id) })
  assert.equal((await authRequest('auth/register', { ...credentials, name: 'Teste' })).status, 404)
  const signedIn = await authRequest('auth/login', credentials)
  assert.equal(signedIn.status, 200)
  const header = signedIn.headers.get('set-cookie')
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

  const bootstrap = { name: 'Admin de teste', email: 'admin@example.test', password: 'seed777', legacyOwner: 'historico-local' }
  await models.Workspace.create({ _id: bootstrap.legacyOwner })
  await models.Account.create({ owner: bootstrap.legacyOwner, name: 'Histórico local', kind: 'Corrente', initialBalance: 9876 })
  await Promise.all([bootstrapAdmin(bootstrap), bootstrapAdmin(bootstrap)])
  assert.equal(await models.User.countDocuments({ role: 'admin' }), 1)
  assert.match((await models.User.findOne({ role: 'admin' })).passwordHash, /^\$2[aby]\$/)
  assert.equal((await authRequest('auth/login', { email: bootstrap.email, password: bootstrap.password })).status, 401)
  const localServer = createApp({ origin: originUrl, allowInitialLogin: true, secureCookies: true }).listen(0, '127.0.0.1')
  await once(localServer, 'listening')
  t.after(() => new Promise(resolve => localServer.close(resolve)))
  const localRequest = (path, body, cookie) => fetch('http://127.0.0.1:' + localServer.address().port + '/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: originUrl, ...(cookie && { Cookie: cookie }), ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
  })
  const initialLogin = await localRequest('auth/login', { email: bootstrap.email, password: bootstrap.password })
  assert.equal(initialLogin.status, 200)
  const initialHeader = initialLogin.headers.get('set-cookie')
  assert.match(initialHeader, /^__Host-meunorte=.*HttpOnly.*Secure.*SameSite=Strict/i)
  const initialCookie = initialHeader.split(';')[0]
  assert.equal((await localRequest('ledger', undefined, initialCookie)).status, 403)
  assert.equal((await (await localRequest('auth/session', undefined, initialCookie)).json()).user.mustChangePassword, true)
  const changed = await localRequest('auth/password', { currentPassword: bootstrap.password, newPassword: 'nova-senha-administrativa-de-teste' }, initialCookie)
  assert.equal(changed.status, 200)
  const activeCookie = changed.headers.get('set-cookie').split(';')[0]
  assert.equal((await localRequest('ledger', undefined, initialCookie)).status, 401)
  assert.equal((await (await localRequest('auth/session', undefined, activeCookie)).json()).user.role, 'admin')
  assert.equal((await (await localRequest('ledger', undefined, activeCookie)).json()).total, 9876)
  await bootstrapAdmin(bootstrap)
  assert.equal((await localRequest('auth/login', { email: bootstrap.email, password: bootstrap.password })).status, 401)
  assert.equal((await localRequest('auth/logout', {}, activeCookie)).status, 200)
  assert.equal((await localRequest('ledger', undefined, activeCookie)).status, 401)

  const savedDatabase = mongoose.connection.name
  await mongoose.disconnect()
  await mongoose.connect(uri, { dbName: savedDatabase, serverSelectionTimeoutMS: 5000 })
  assert.equal((await first('GET')).data.total, 19000)
  const restored = await second('GET')
  assert.equal(restored.status, 200)
  assert.equal(restored.data.accounts.find(row => row._id === secondId).balance, 3150)
  assert.equal(restored.data.accounts.find(row => row._id === reserveId).balance, 1150)
  assert.equal(restored.data.total, 4300)
  assert.deepEqual(restored.data.entries.filter(row => !row.goalId).map(row => [row.type, row.amount]),
    [['transfer', 900], ['expense', 1700], ['income', 5000]])
  assert.equal(restored.data.entries.filter(row => row.goalId).length, 2)
  assert.equal(restored.data.deletedGoals[0].deadline, '2028-05-01')

  assert.equal((await second('DELETE', '/accounts/' + reserveId)).status, 409)
  const zero = await second('POST', '/entries', {
    type: 'transfer', description: 'Regularização', date: today(), amount: 1150, accountId: reserveId, destinationId: secondId,
  })
  assert.equal(zero.status, 201)
  assert.equal((await first('DELETE', '/accounts/' + reserveId)).status, 404)
  const accountReminder = await second('POST', '/reminders', { name: 'Conta', dueOn: '2025-06-01', frequency: 'once', kind: 'account', linkId: reserveId })
  const accountReminderId = accountReminder.data.reminders.find(row => row.name === 'Conta')._id
  assert.equal((await second('DELETE', '/accounts/' + reserveId)).status, 409)
  assert.equal((await second('DELETE', '/reminders/' + accountReminderId)).status, 200)
  const closedAccount = await second('DELETE', '/accounts/' + reserveId)
  assert.ok(closedAccount.data.accounts.find(row => row._id === reserveId).deletedAt)
  const historicTransfer = closedAccount.data.entries.find(row => row.description === 'Regularização')
  assert.equal(historicTransfer.accountId, reserveId)
  assert.equal((await second('DELETE', '/entries/' + historicTransfer._id)).status, 409)
  assert.equal((await second('PUT', '/accounts/' + reserveId, { name: 'Reserva', kind: 'Poupança', archived: false })).status, 404)

  const createdAsset = await second('POST', '/assets', { name: 'Veículo', kind: 'vehicle', acquired: 4000000,
    acquiredOn: '2025-01-01', value: 4000000, date: '2025-01-01', accountId: null, reviewOn: null })
  assert.equal(createdAsset.status, 201)
  const assetPath = '/assets/' + createdAsset.data.assets[0]._id
  const evaluated = await second('POST', assetPath + '/valuations', { value: 3200000, date: '2025-02-01', notes: 'Avaliação manual' })
  assert.equal(evaluated.data.total, 4300)
  assert.equal((evaluated.data.assets[0].valuations[0].value - evaluated.data.assets[0].acquired) / evaluated.data.assets[0].acquired, -.2)
  assert.equal((await first('POST', assetPath + '/operations', { type: 'sale', date: '2025-03-01', amount: 3500000 })).status, 404)
  assert.equal((await second('POST', assetPath + '/operations', { type: 'purchase', date: '2025-01-01', amount: 4000000 })).status, 201)
  const received = await second('POST', '/entries', { type: 'income', category: 'Patrimônio', description: 'Recebimento', date: '2025-03-01',
    amount: 3500000, accountId: secondId })
  const receivingId = received.data.entries.find(row => row.description === 'Recebimento')._id
  assert.equal((await second('POST', assetPath + '/operations', { type: 'sale', mode: 'new', date: '2025-03-01', amount: 3500000, accountId: secondId })).status, 409)
  const sold = await second('POST', assetPath + '/operations', { type: 'sale', mode: 'existing', date: '2025-03-01', amount: 3500000, entryId: receivingId })
  assert.equal(sold.status, 201)
  assert.equal(sold.data.assets[0].status, 'sold')
  assert.equal(sold.data.assets[0].sale.amount - sold.data.assets[0].sale.cost, -500000)
  assert.equal(sold.data.assets[0].valuations.length, 2)
  assert.equal(sold.data.total, received.data.total)
  assert.equal((await second('DELETE', '/entries/' + receivingId)).status, 409)
  const patrimonial = await second('GET', '/reports?from=2025-01-01&through=2025-03-31&assetKind=vehicle')
  assert.equal(patrimonial.status, 200)
  assert.deepEqual(patrimonial.data.rows.map(row => row.estimated), [4000000, 3200000, 0])
  assert.deepEqual(patrimonial.data.valuationSeries[0].points, [
    { date: '2025-01-01', value: 4000000 }, { date: '2025-02-01', value: 3200000 },
  ])
  assert.equal(patrimonial.data.position.evaluatedAssets, 0)
  const beforeSale = await second('GET', '/reports?from=2025-02-01&through=2025-02-28&assetKind=property&account=' + reserveId)
  assert.equal(beforeSale.data.position.evaluatedAssets, 3200000)
  assert.deepEqual(beforeSale.data.assetCategories, [])
  assert.equal(patrimonial.data.sales.length, 1)
  const historyReport = await second('GET', '/reports?from=2025-02-01&through=' + today() + '&account=' + reserveId)
  assert.equal(historyReport.status, 200)
  assert.equal(historyReport.data.income, 0)
  assert.equal(historyReport.data.rows[0].balance, 900)
  assert.equal(historyReport.data.rows.at(-1).balance, 0)
  const creditReport = await first('GET', '/reports?from=2025-01-01&through=2025-03-31')
  assert.equal(creditReport.data.expenses, 12000)
  assert.equal(creditReport.data.cash, -1000)
  const februaryReport = await first('GET', '/reports?from=2025-02-01&through=2025-02-28')
  assert.equal(februaryReport.data.expenses, 4000)
  assert.equal(februaryReport.data.previous.expenses, 4000)
  assert.deepEqual(februaryReport.data.comparison.expenses, { value: 4000, difference: 0, percent: 0 })
  assert.deepEqual([februaryReport.data.previous.from, februaryReport.data.previous.through], ['2025-01-01', '2025-01-31'])
  const consecutive = await first('GET', '/reports?from=2025-02-01&through=2025-02-28&comparison=consecutive')
  assert.deepEqual([consecutive.data.previous.from, consecutive.data.previous.through], ['2025-01-04', '2025-01-31'])
  assert.equal((await first('GET', '/reports?from=2025-02-01&through=2025-02-28&comparison=invalid')).status, 400)

  // Only the isolated test database is used by this opt-in integration suite.
  const priorOperations = (await second('GET')).data
  const priorOperationsReport = await second('GET', '/reports?from=2025-03-01&through=2025-03-31')
  for (const operation of ['sale', 'retire']) {
    const name = 'Informativo ' + operation
    const created = await second('POST', '/assets', { name, kind: 'vehicle', acquired: 2000000,
      acquiredOn: '2025-01-01', value: null, accountId: null, reviewOn: null })
    const asset = created.data.assets.find(row => row.name === name)
    const closed = await second('POST', '/assets/' + asset._id + '/operations', {
      type: operation, mode: 'note', date: '2025-03-01', ...(operation === 'sale' && { amount: 1800000 }),
    })
    assert.equal(closed.status, 201)
    const ended = closed.data.assets.find(row => row._id === asset._id)
    assert.equal(ended.status, operation === 'sale' ? 'sold' : 'retired')
    assert.equal(ended.endedOn, '2025-03-01')
    assert.deepEqual(ended.valuations, [])
    if (operation === 'sale') {
      assert.equal(ended.sale.amount - ended.sale.cost, -200000)
      assert.ok(!ended.sale.entryId)
    }
    assert.equal(closed.data.total, priorOperations.total)
    assert.deepEqual(closed.data.entries, priorOperations.entries)
  }
  const afterOperations = await second('GET', '/reports?from=2025-03-01&through=2025-03-31')
  assert.equal(afterOperations.data.position.evaluatedAssets, 0)
  assert.equal(afterOperations.data.position.pendingAssets, 0)
  assert.equal(afterOperations.data.income, priorOperationsReport.data.income)
  assert.equal(afterOperations.data.cash, priorOperationsReport.data.cash)

  const monthly = await second('POST', '/reminders', { name: 'Recorrente', dueOn: '2025-01-31', frequency: 'monthly', leadDays: 3 })
  const recurringId = monthly.data.reminders.find(row => row.name === 'Recorrente')._id
  const recurrencePath = '/reminders/' + recurringId + '/actions'
  const january = { action: 'confirm', occurrence: '2025-01-31' }
  const february = await second('POST', recurrencePath, january)
  assert.equal(february.data.reminders.find(row => row._id === recurringId).dueOn, '2025-02-28')
  assert.equal((await second('POST', recurrencePath, january)).status, 409)
  const march = await second('POST', recurrencePath, { action: 'dismiss', occurrence: '2025-02-28' })
  assert.equal(march.data.reminders.find(row => row._id === recurringId).dueOn, '2025-03-31')
  assert.equal((await second('POST', '/reminders', { name: 'Cartão externo', kind: 'cardDue', linkId: card._id, frequency: 'monthly' })).status, 400)
  const cardAlert = await first('POST', '/reminders', { name: 'Fatura', kind: 'cardOpen', linkId: card._id, frequency: 'monthly' })
  assert.equal(cardAlert.data.reminders.find(row => row.name === 'Fatura').effectiveDate, '2025-02-10')

  await mongoose.disconnect()
  await mongoose.connect(uri, { dbName: savedDatabase, serverSelectionTimeoutMS: 5000 })
  const persisted = (await second('GET')).data
  assert.equal(persisted.assets[0].sale.entryId, receivingId)
  assert.equal(persisted.reminders.find(row => row._id === recurringId).history.length, 2)
  assert.equal(persisted.reminders.find(row => row._id === recurringId).dueOn, '2025-03-31')
  assert.ok(persisted.accounts.find(row => row._id === reserveId).deletedAt)
})
