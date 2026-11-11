import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import mongoose from 'mongoose'
import { createApp } from './app.js'
import { hashPassword } from './auth.js'
import * as models from './models.js'

const uri = process.env.MONGODB_TEST_URI
test('segurança: sessão, origem, isolamento, validação e limite de login', { skip: !uri }, async t => {
  assert.match(uri, /^mongodb:\/\/(127\.0\.0\.1|localhost):/, 'Use o runner de MongoDB local isolado.')
  await mongoose.connect(uri, { dbName: 'meu_norte_security_' + randomUUID().replaceAll('-', '') })
  t.after(async () => { try { await mongoose.connection.dropDatabase() } finally { await mongoose.disconnect() } })
  await Promise.all(Object.values(models).map(model => model.init()))
  const password = 'senha-ficticia-seguranca-123', origin = 'http://localhost:5173'
  const user = await models.User.create({ email: 'security@example.test', name: 'Teste segurança', role: 'admin', passwordHash: await hashPassword(password) })
  await models.Workspace.create({ _id: String(user._id) })
  async function server() {
    const app = createApp({ origin })
    const http = app.listen(0, '127.0.0.1'); await once(http, 'listening')
    t.after(() => new Promise(resolve => http.close(resolve)))
    const base = 'http://127.0.0.1:' + http.address().port + '/api'
    return async (path, { body, cookie, source = origin, method = body ? 'POST' : 'GET' } = {}) => {
      const response = await fetch(base + path, { method, headers: { ...(source && { Origin: source }), ...(cookie && { Cookie: cookie }), 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: body && JSON.stringify(body) })
      return { status: response.status, headers: response.headers, data: await response.json().catch(() => null) }
    }
  }
  const request = await server()
  const login = () => request('/auth/login', { body: { email: user.email, password } })
  let cookie
  await t.test('rotas privadas exigem sessão e cookies persistentes são protegidos', async () => {
    assert.equal((await request('/ledger')).status, 401)
    const result = await login()
    assert.equal(result.status, 200)
    assert.match(result.headers.get('set-cookie'), /HttpOnly.*SameSite=Strict/i)
    assert.match(result.headers.get('set-cookie'), /Max-Age=604800/i)
    cookie = result.headers.get('set-cookie').split(';')[0]
    assert.equal((await request('/ledger', { cookie })).status, 200)
    assert.equal((await request('/auth/session', { cookie })).data.user.role, 'admin')
  })
  await t.test('escritas sem origem autorizada e campos injetados são bloqueados', async () => {
    const body = { name: 'Conta', kind: 'Corrente', initialBalance: 0 }
    for (const source of ['', 'https://hostile.example']) assert.equal((await request('/ledger/accounts', { cookie, source, body })).status, 403)
    assert.equal((await request('/ledger/accounts', { cookie, body: { ...body, owner: 'outro' } })).status, 400)
    assert.equal((await request('/auth/login', { body: { email: { $ne: null }, password } })).status, 401)
    assert.equal(await models.Account.countDocuments(), 0)
    assert.ok(!(await request('/auth/session', { cookie })).data.user.passwordHash)
  })
  await t.test('identificadores de outro proprietário não autorizam leitura ou escrita', async () => {
    const other = await models.Account.create({ owner: 'outro-espaco', name: 'Conta privada', kind: 'Corrente', initialBalance: 12345 })
    const ledger = await request('/ledger', { cookie })
    assert.deepEqual(ledger.data.accounts, [])
    assert.equal((await request('/ledger/accounts/' + other._id, { method: 'PUT', cookie, body: { name: 'alterada', kind: 'Corrente', archived: false } })).status, 404)
    assert.equal((await request('/ledger/reports?from=2026-11-01&through=2026-11-11&account=' + other._id, { cookie })).status, 404)
    assert.equal((await models.Account.findById(other._id)).name, 'Conta privada')
  })
  await t.test('expiração e revogação de sessão são verificadas no servidor', async () => {
    const token = cookie.split('=')[1], key = createHash('sha256').update(token).digest('hex')
    await models.Session.updateOne({ _id: key }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    assert.equal((await request('/ledger', { cookie })).status, 401)
    const valid = await login(); cookie = valid.headers.get('set-cookie').split(';')[0]
    await models.User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } })
    assert.equal((await request('/ledger', { cookie })).status, 401)
    const next = await login(); cookie = next.headers.get('set-cookie').split(';')[0]
    assert.equal((await request('/auth/logout', { cookie, body: {} })).status, 200)
    assert.equal((await request('/ledger', { cookie })).status, 401)
  })
  await t.test('tentativas repetidas de senha incorreta recebem HTTP 429', async () => {
    const fresh = await server()
    for (let i = 0; i < 8; i++) assert.equal((await fresh('/auth/login', { body: { email: user.email, password: 'senha-incorreta' } })).status, 401)
    assert.equal((await fresh('/auth/login', { body: { email: user.email, password: 'senha-incorreta' } })).status, 429)
  })
})
