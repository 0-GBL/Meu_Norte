import express from 'express'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import { limiter, checkPassword, emailInput, requireOrigin, sessionCookieName } from './auth.js'
import { object, RequestError } from './ledger.js'
import { createApp } from './app.js'
import { createDemoStore, demoLimitMessage } from './demoStore.js'
import { DEMO_EMAIL, DEMO_PASSWORD } from '../../shared/demoAccess.mjs'

export { DEMO_EMAIL, DEMO_PASSWORD }

export function demoConfiguration(env) {
  if (!env.DEMO_MODE || env.DEMO_MODE === 'false') return { enabled: false, email: DEMO_EMAIL }
  if (env.DEMO_MODE !== 'true' || !env.DEMO_EMAIL || typeof env.DEMO_PASSWORD !== 'string' ||
      env.DEMO_PASSWORD.length < 12 || Buffer.byteLength(env.DEMO_PASSWORD) > 72) {
    throw new RequestError(400, 'Confira DEMO_MODE, DEMO_EMAIL e DEMO_PASSWORD no ambiente do backend.')
  }
  const dailyWriteLimit = Number(env.DEMO_DAILY_WRITE_LIMIT ?? 50)
  if (!Number.isSafeInteger(dailyWriteLimit) || dailyWriteLimit < 1 || dailyWriteLimit > 1000) {
    throw new RequestError(400, 'DEMO_DAILY_WRITE_LIMIT deve ser um inteiro entre 1 e 1000.')
  }
  return { enabled: true, email: emailInput(env.DEMO_EMAIL), password: env.DEMO_PASSWORD, dailyWriteLimit }
}

// No database: bounded in-process sessions are renewed by normal login.
export function createDemoRouter({ config, origin, secureCookies = false }) {
  const router = express.Router()
  const sessions = new Map()
  const addresses = new Map()
  const store = createDemoStore()
  const financial = createApp({ origin, models: store.models, connection: store.connection,
    ledgerAuth: { router: express.Router(), getUser: async req => ({ ...user, ledgerOwner: key(req) }) } })
  const dailyLimit = config.dailyWriteLimit ?? 50
  let checkingPasswords = 0
  const calendarDay = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now()))
  function address(req) {
    const date = calendarDay()
    for (const [ip, bucket] of addresses) if (bucket.date !== date) addresses.delete(ip)
    const ip = digest(req.ip)
    if (!addresses.has(ip)) {
      if (addresses.size >= 20000) throw new RequestError(429, 'Demonstração ocupada. Tente novamente mais tarde.')
      addresses.set(ip, { date, logins: 0, writes: 0 })
    }
    return addresses.get(ip)
  }
  function discard(id, session) {
    if (session) { session.closed = true; session.data = null }
    sessions.delete(id)
  }
  function sweep() {
    for (const [id, session] of sessions) if (session.until <= Date.now()) discard(id, session)
    const date = calendarDay()
    for (const [ip, bucket] of addresses) if (bucket.date !== date) addresses.delete(ip)
  }
  // unref avoids keeping tests/process alive; expired copies are reclaimed even without traffic.
  const cleanup = setInterval(sweep, 60000)
  cleanup.unref()
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
    sweep()
    return config.enabled && sessions.has(key(req))
  }

  router.use((req, res, next) => {
    if (req.get('origin') && req.get('origin') !== origin) throw new RequestError(403, 'Origem não autorizada.')
    if (!['GET', 'HEAD'].includes(req.method)) requireOrigin(req, origin)
    limit('all:' + req.ip, 900)
    limit('global:requests', 6000)
    next()
  })
  router.get('/api/auth/session', (req, res) => res.json({ user: authenticated(req) ? user : null, recovery: false }))
  router.post('/api/auth/login', express.json({ limit: '4kb', strict: true }), async (req, res) => {
    object(req.body, ['email', 'password'])
    limit('login:' + req.ip, 8)
    limit('global:login', 60)
    let email
    try { email = emailInput(req.body.email) }
    catch { throw new RequestError(401, 'E-mail ou senha incorretos.') }
    if (!config.enabled || email !== config.email || typeof req.body.password !== 'string' ||
        Buffer.byteLength(req.body.password) > 256) {
      throw new RequestError(401, 'E-mail ou senha incorretos.')
    }
    if (checkingPasswords >= 4) throw new RequestError(429, 'Demonstração ocupada. Tente novamente em instantes.')
    let matches
    checkingPasswords++
    try { matches = await checkPassword(req.body.password, hash) }
    finally { checkingPasswords-- }
    if (!matches) throw new RequestError(401, 'E-mail ou senha incorretos.')
    authenticated(req) // Remove expired sessions before checking capacity.
    if (sessions.size >= 200) throw new RequestError(429, 'Demonstração ocupada. Tente novamente mais tarde.')
    const bucket = address(req)
    if (bucket.logins >= 20) throw new RequestError(429, 'Muitas sessões de demonstração. Tente novamente amanhã.')
    bucket.logins++
    const token = randomBytes(32).toString('hex')
    discard(key(req), sessions.get(key(req)))
    sessions.set(digest(token), { until: Date.now() + ttl, data: store.seed(digest(token)),
      queue: Promise.resolve(), pending: 0, date: calendarDay(), writes: 0, closed: false })
    res.cookie(name, token, { ...options, maxAge: ttl })
    res.clearCookie(other, options)
    res.json({ user })
  })
  router.post('/api/auth/logout', (req, res) => {
    discard(key(req), sessions.get(key(req)))
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
    limit('request:' + req.ip, 600)
    if (!['GET', 'HEAD'].includes(req.method)) limit('write:' + req.ip, 120)
    const session = sessions.get(key(req))
    store.run({ session, commit() {
      const bucket = address(req), date = calendarDay()
      if (session.closed || session.until <= Date.now()) throw new RequestError(401, 'Entre para acessar seus registros.')
      if (session.date !== date) { session.date = date; session.writes = 0 }
      if (session.writes >= dailyLimit) throw new RequestError(429, demoLimitMessage)
      if (bucket.writes >= dailyLimit * 4) throw new RequestError(429, demoLimitMessage)
      session.writes++; bucket.writes++
    } }, next)
  })
  router.use('/api/ledger', (req, res, next) => {
    // Restore the mount prefix before dispatching to the shared application.
    req.url = '/api/ledger' + req.url
    financial(req, res, next)
  })
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
