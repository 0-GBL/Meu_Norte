import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { setTimeout as pause } from 'node:timers/promises'
import mongoose from 'mongoose'
import * as models from './models.js'
import { createApplication } from './application.js'
import { hashPassword } from './auth.js'
import { demoConfiguration, DEMO_EMAIL, DEMO_PASSWORD } from './demo.js'
import { today } from './cards.js'

const uri = process.env.MONGODB_TEST_URI
test('administrador MongoDB e demo interativa mantêm acessos e sessões independentes', { skip: !uri }, async t => {
  assert.match(uri, /^mongodb:\/\/(127\.0\.0\.1|localhost):/)
  const servers = [], mail = []
  t.after(async () => {
    for (const http of servers) await new Promise(resolve => http.close(resolve))
    await mongoose.connection.dropDatabase(); await mongoose.disconnect()
  })
  await mongoose.connect(uri,{dbName:'private_access_'+randomUUID().replaceAll('-','')})
  await Promise.all(Object.values(models).map(model => model.init()))
  const password = 'Admin-ficticio-separado-123', origin = 'http://localhost:5173'
  const admin = await models.User.create({ name: 'Administrador fictício', email: 'admin@example.test', role: 'admin', passwordHash: await hashPassword(password) })
  const owner = String(admin._id)
  await models.Workspace.create({ _id: owner })
  const account = await models.Account.create({ owner, name: 'Conta privada fictícia', kind: 'Corrente', initialBalance: 12345 })
  const original = await models.User.findById(admin._id).lean()
  async function server(enabled = true) {
    const http = createApplication({ origin, allowInitialLogin: true, demo: demoConfiguration({DEMO_MODE:String(enabled),DEMO_EMAIL,DEMO_PASSWORD}),
      sendReset: async (email, link) => mail.push({ email, link }) }).listen(0, '127.0.0.1')
    await once(http, 'listening'); servers.push(http)
    return async (path, { body, cookie, method = body ? 'POST' : 'GET', source = origin } = {}) => {
      const response = await fetch('http://127.0.0.1:' + http.address().port + '/api' + path, { method,
        headers: { Origin: source, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), ...(cookie && { Cookie: cookie }) },
        ...(body && { body: JSON.stringify(body) }) })
      return { status: response.status, cookies: response.headers.getSetCookie(), data: await response.json().catch(() => null) }
    }
  }
  const request = await server()
  let adminCookie, demoCookie
  await t.test('login manual demo e login administrativo preservam sessões em paralelo', async () => {
    const [personal, demo] = await Promise.all([
      request('/auth/login', { body: { email: admin.email, password } }), request('/auth/login', { body: { email: DEMO_EMAIL, password: DEMO_PASSWORD } }),
    ])
    assert.equal(personal.status, 200); assert.equal(demo.status, 200)
    assert.equal(personal.data.user.role, 'admin'); assert.equal(demo.data.user.role, 'user')
    assert.equal(demo.data.user.mustChangePassword, false)
    adminCookie = personal.cookies.find(value => value.startsWith('meunorte=')).split(';')[0]
    demoCookie = demo.cookies.find(value => value.startsWith('meunorte-demo=')).split(';')[0]
    const [a, d] = await Promise.all([request('/ledger', { cookie: adminCookie }), request('/ledger', { cookie: demoCookie })])
    assert.equal(a.data.total, 12345); assert.equal(d.data.total, 1126000)
    assert.equal(a.data.accounts[0].name, account.name)
    assert.equal(d.data.accounts.some(row => row.name === account.name), false)
    assert.equal((await request('/auth/session', { cookie: adminCookie })).data.recovery, true)
    assert.equal((await request('/auth/session', { cookie: demoCookie })).data.recovery, false)
    assert.equal(await models.Session.countDocuments(),1,'A sessão demo não é persistida no banco pessoal')
  })
  await t.test('credenciais manuais demo e troca de acesso limpam somente o cookie oposto', async () => {
    const manual = await request('/auth/login', { body: { email: ' DEMO@example.com ', password: DEMO_PASSWORD }, cookie: adminCookie })
    assert.equal(manual.status, 200); assert.equal(manual.data.user.demo, true)
    assert.ok(manual.cookies.some(value => value.startsWith('meunorte=;')))
    const back = await request('/auth/login', { body: { email: admin.email, password }, cookie: demoCookie })
    assert.equal(back.status, 200); assert.ok(back.cookies.some(value => value.startsWith('meunorte-demo=;')))
    assert.equal((await request('/ledger', { cookie: demoCookie })).status, 200)
    assert.equal((await request('/ledger', { cookie: adminCookie })).status, 200)
  })
  await t.test('tokens e IDs demo não autorizam consultas aos dados pessoais', async () => {
    assert.equal((await request('/ledger', { cookie: demoCookie.replace('meunorte-demo=', 'meunorte=') })).status, 401)
    assert.equal((await request('/ledger', { cookie: adminCookie.replace('meunorte=', 'meunorte-demo=') })).status, 401)
    const month = today().slice(0, 7), query = '?from=' + month + '-01&through=' + month + '-28&account='
    assert.equal((await request('/ledger/reports' + query + account._id, { cookie: demoCookie })).status, 404)
    const demoAccount = { _id: '000000000000000000000101' }
    assert.equal((await request('/ledger/reports' + query + demoAccount._id, { cookie: adminCookie })).status, 404)
    assert.equal((await request('/auth/session?demo=false', { cookie: demoCookie })).data.user.role, 'user')
  })
  await t.test('admin e demo gravam em armazenamentos separados', async () => {
    const body = { name: 'Nova conta fictícia', kind: 'Corrente', initialBalance: 100 }
    const [a, d] = await Promise.all([
      request('/ledger/accounts', { cookie: adminCookie, body }), request('/ledger/accounts', { cookie: demoCookie, body }),
    ])
    assert.equal(a.status, 201); assert.equal(d.status, 201)
    assert.equal(await models.Account.countDocuments(), 2)
    assert.equal((await request('/ledger',{cookie:demoCookie})).data.accounts.length,3)
    assert.equal((await request('/ledger/accounts/' + account._id, { cookie: demoCookie, body: { name: body.name, kind: body.kind, archived: false }, method: 'PUT' })).status, 404)
  })
  await t.test('credenciais demo, recuperação e elevação de papel permanecem bloqueadas', async () => {
    const sessions = await models.Session.countDocuments()
    assert.equal((await request('/auth/password', { cookie: demoCookie, body: { currentPassword: DEMO_PASSWORD, newPassword: 'Nunca-salvar-12345' } })).status, 403)
    assert.equal((await request('/auth/forgot', { cookie: demoCookie, body: { email: DEMO_EMAIL } })).status, 403)
    assert.notEqual((await request('/auth/reset', { cookie: demoCookie, body: { token: '0'.repeat(64), password: 'Nunca-salvar-12345' } })).status, 200)
    assert.equal((await request('/auth/login', { body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, role: 'admin', owner } })).status, 400)
    assert.equal(await models.Session.countDocuments(),sessions)
    assert.equal(await models.ResetToken.countDocuments(),0)
    assert.equal(await models.User.countDocuments(),1)
    assert.equal(await models.User.countDocuments({email:DEMO_EMAIL}),0)
  })
  await t.test('recuperação e senha inicial administrativas continuam disponíveis e independentes', async () => {
    assert.equal((await request('/auth/forgot', { cookie: demoCookie, body: { email: admin.email } })).status, 200)
    for (let i = 0; i < 20 && !mail.length; i++) await pause(20)
    assert.equal(mail.length, 1); assert.equal(mail[0].email, admin.email)
    assert.equal(await models.ResetToken.countDocuments(), 1)
    await models.User.updateOne({ _id: admin._id }, { $set: { mustChangePassword: true } })
    const login = await request('/auth/login', { body: { email: admin.email, password } })
    assert.equal(login.data.user.mustChangePassword, true)
    assert.equal((await request('/ledger', { cookie: login.cookies[0].split(';')[0] })).status, 403)
    await models.User.updateOne({ _id: admin._id }, { $set: { mustChangePassword: false } })
    assert.equal((await models.User.findById(admin._id)).passwordHash, original.passwordHash)
    assert.equal((await models.Account.findById(account._id)).initialBalance, 12345)
  })
  await t.test('sem habilitação explícita não há autenticação demo, nem rota de entrada sem senha', async () => {
    const off = await server(false)
    assert.equal(Boolean((await off('/auth/session')).data.demo), false)
    assert.equal((await off('/auth/demo', { body: {} })).status, 404)
    assert.equal((await request('/auth/demo', { body: {} })).status, 404)
    assert.equal((await off('/auth/login', { body: { email: DEMO_EMAIL, password: DEMO_PASSWORD } })).status, 401)
    assert.equal((await off('/auth/login', { body: { email: admin.email, password } })).status, 200)
  })
})
