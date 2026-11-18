import express from 'express'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import { limiter, checkPassword, emailInput, requireOrigin, sessionCookieName } from './auth.js'
import { object, RequestError } from './ledger.js'
import { demoLedger, demoReport } from './demoData.js'
import { DEMO_EMAIL, DEMO_PASSWORD } from '../../shared/demoAccess.mjs'

export { DEMO_EMAIL, DEMO_PASSWORD }

export function demoConfiguration(env) {
  if (!env.DEMO_MODE || env.DEMO_MODE === 'false') return { enabled: false, email: DEMO_EMAIL }
  if (env.DEMO_MODE !== 'true' || !env.DEMO_EMAIL || typeof env.DEMO_PASSWORD !== 'string' ||
      env.DEMO_PASSWORD.length < 12 || Buffer.byteLength(env.DEMO_PASSWORD) > 72) {
    throw new RequestError(400, 'Confira DEMO_MODE, DEMO_EMAIL e DEMO_PASSWORD no ambiente do backend.')
  }
  return { enabled: true, email: emailInput(env.DEMO_EMAIL), password: env.DEMO_PASSWORD }
}

// No database: bounded in-process sessions are renewed by normal login.
export function createDemoRouter({ config, origin, secureCookies = false }) {
  const router = express.Router()
  const sessions = new Map()
  const limit = limiter()
  const name = sessionCookieName(secureCookies, true)
  const other = sessionCookieName(secureCookies)
  const options = { httpOnly: true, secure: secureCookies, sameSite: 'strict', path: '/' }
  const hash = config.enabled ? bcrypt.hashSync(config.password, 12) : null
  const ttl = 60 * 60 * 1000
  const digest = value => createHash('sha256').update(value).digest('hex')
  const user = { name: 'Visitante', email: config.email, role: 'user', demo: true, mustChangePassword: false }

  function key(req) {
    const value = req.get('cookie')?.split(';').map(value => value.trim())
      .find(value => value.startsWith(name + '='))?.slice(name.length + 1)
    return /^[a-f0-9]{64}$/.test(value ?? '') ? digest(value) : null
  }

  function authenticated(req) {
    const now = Date.now()
    for (const [key, until] of sessions) if (until <= now) sessions.delete(key)
    return config.enabled && sessions.has(key(req))
  }

  router.use((req, res, next) => {
    if (req.get('origin') && req.get('origin') !== origin) throw new RequestError(403, 'Origem não autorizada.')
    if (!['GET', 'HEAD'].includes(req.method)) requireOrigin(req, origin)
    next()
  })
  router.get('/api/auth/session', (req, res) => res.json({ user: authenticated(req) ? user : null, recovery: false }))
  router.post('/api/auth/login', express.json({ limit: '4kb', strict: true }), async (req, res) => {
    object(req.body, ['email', 'password'])
    limit('login:' + req.ip, 8)
    let email
    try { email = emailInput(req.body.email) }
    catch { throw new RequestError(401, 'E-mail ou senha incorretos.') }
    if (!config.enabled || email !== config.email || typeof req.body.password !== 'string' ||
        Buffer.byteLength(req.body.password) > 256 || !await checkPassword(req.body.password, hash)) {
      throw new RequestError(401, 'E-mail ou senha incorretos.')
    }
    authenticated(req) // Remove expired sessions before checking capacity.
    if (sessions.size >= 200) throw new RequestError(429, 'Demonstração ocupada. Tente novamente mais tarde.')
    const token = randomBytes(32).toString('hex')
    sessions.delete(key(req))
    sessions.set(digest(token), Date.now() + ttl)
    res.cookie(name, token, { ...options, maxAge: ttl })
    res.clearCookie(other, options)
    res.json({ user })
  })
  router.post('/api/auth/logout', (req, res) => {
    sessions.delete(key(req))
    res.clearCookie(name, options)
    res.clearCookie(other, options)
    res.json({ user: null })
  })
  router.use('/api/auth', (req, _res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      throw new RequestError(403, 'As credenciais de demonstração não podem ser alteradas ou recuperadas.')
    }
    next()
  })
  router.use('/api/ledger', (req, _res, next) => {
    if (!authenticated(req)) throw new RequestError(401, 'Entre para acessar seus registros.')
    if (!['GET', 'HEAD'].includes(req.method)) {
      throw new RequestError(403, 'Demonstração somente de consulta. Os dados fictícios não podem ser alterados.')
    }
    next()
  })
  router.get('/api/ledger', (_req, res) => res.json(demoLedger()))
  router.get('/api/ledger/reports', (req, res) => res.json(demoReport(req.query)))
  router.use((_req, res) => res.status(404).json({ message: 'Endereço não encontrado.' }))
  router.use((error, _req, res, _next) => {
    const status = error instanceof RequestError ? error.status :
      error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500
    const message = error instanceof RequestError ? error.message :
      status === 500 ? 'Não foi possível concluir a solicitação.' : 'Formato de dados inválido.'
    res.status(status).json({ message })
  })
  return router
}
