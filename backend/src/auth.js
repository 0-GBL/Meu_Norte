import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import express from 'express'
import mongoose from 'mongoose'
import { ResetToken, Session, User, Workspace } from './models.js'
import { label, object, RequestError } from './ledger.js'

const derive = promisify(scrypt)
const scryptOptions = { N: 65536, r: 8, p: 1, maxmem: 96 * 1024 * 1024 }
const fallbackHash = '0'.repeat(32) + ':' + '0'.repeat(128)
const sessionLifetime = 7 * 24 * 60 * 60 * 1000
const resetLifetime = 30 * 60 * 1000
const tokenFormat = /^[a-f0-9]{64}$/
const token = () => randomBytes(32).toString('hex')
const hashToken = raw => createHash('sha256').update(raw).digest('hex')

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 256) {
    throw new RequestError(400, 'Use uma senha de pelo menos 12 caracteres e até 256 bytes.')
  }
  return password
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const key = await derive(password, salt, 64, scryptOptions)
  return salt + ':' + key.toString('hex')
}

export async function checkPassword(password, hash = fallbackHash) {
  const [salt, expected] = hash.split(':')
  const actual = await derive(password, salt, 64, scryptOptions)
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'))
}

function emailInput(value) {
  if (typeof value !== 'string') throw new RequestError(400, 'Informe um e-mail válido.')
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(email)) {
    throw new RequestError(400, 'Informe um e-mail válido.')
  }
  return email
}

export function requireOrigin(req, origin) {
  if (req.get('origin') !== origin) throw new RequestError(403, 'Origem não autorizada.')
}

function limiter() {
  const buckets = new Map()
  const interval = 15 * 60 * 1000
  let sweep = 0
  return (key, limit) => {
    const now = Date.now()
    if (now >= sweep) {
      for (const [id, bucket] of buckets) if (bucket.until <= now) buckets.delete(id)
      sweep = now + 60 * 1000
    }
    const previous = buckets.get(key)
    const bucket = previous?.until > now ? previous : { count: 0, until: now + interval }
    if (bucket.count >= limit || (!previous && buckets.size >= 20000)) {
      throw new RequestError(429, 'Muitas tentativas. Tente novamente em alguns minutos.')
    }
    bucket.count++
    buckets.set(key, bucket)
  }
}

export function createAuth({ origin, secureCookies, sendReset, localAccess = false }) {
  const router = express.Router()
  const limit = limiter()
  const cookieName = secureCookies ? '__Host-meunorte' : 'meunorte'
  const cookieOptions = { httpOnly: true, secure: secureCookies, sameSite: 'strict', path: '/' }
  const visibleUser = user => ({ name: user.name, email: user.email })
  const rawCookie = req => req.get('cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1)
  const cookieId = req => {
    const raw = rawCookie(req)
    return raw && tokenFormat.test(raw) ? hashToken(raw) : null
  }

  async function getUser(req) {
    const key = cookieId(req)
    if (!key) return null
    const session = await Session.findOne({ _id: key, expiresAt: { $gt: new Date() } }).lean()
    if (!session) return null
    return User.findOne({ _id: session.owner, sessionVersion: session.version }).select('name email').lean()
  }

  async function issue(req, res, user) {
    const raw = token()
    await Session.create({
      _id: hashToken(raw), owner: user._id, version: user.sessionVersion,
      expiresAt: new Date(Date.now() + sessionLifetime),
    })
    const previous = cookieId(req)
    if (previous) await Session.deleteOne({ _id: previous })
    res.cookie(cookieName, raw, { ...cookieOptions, maxAge: sessionLifetime })
    res.json({ user: visibleUser(user) })
  }

  router.use((req, _res, next) => {
    if (req.method === 'POST') {
      requireOrigin(req, origin)
      limit('ip:' + req.ip, 30)
    }
    next()
  }, express.json({ limit: '4kb', strict: true }))

  router.get('/session', async (req, res) => {
    const user = await getUser(req)
    res.json({ user: user && visibleUser(user), recovery: Boolean(sendReset), localAccess })
  })

  router.post('/register', async (req, res) => {
    object(req.body, ['name', 'email', 'password'])
    const email = emailInput(req.body.email)
    limit('register:' + hashToken(email), 5)
    const name = label(req.body.name, 'um nome')
    const passwordHash = await hashPassword(validatePassword(req.body.password))
    let user
    try {
      user = await mongoose.connection.transaction(async session => {
        const [created] = await User.create([{ email, name, passwordHash }], { session })
        await Workspace.create([{ _id: String(created._id), revision: 0 }], { session })
        return created
      })
    } catch (error) {
      if (error.code === 11000) throw new RequestError(409, 'Não foi possível cadastrar este e-mail. Tente entrar ou recuperar o acesso.')
      throw error
    }
    await issue(req, res, user)
  })

  router.post('/login', async (req, res) => {
    object(req.body, ['email', 'password'])
    const email = emailInput(req.body.email)
    const password = validatePassword(req.body.password)
    limit('login:' + hashToken(email), 8)
    const user = await User.findOne({ email }).lean()
    const matches = await checkPassword(password, user?.passwordHash)
    if (!user || !matches) throw new RequestError(401, 'E-mail ou senha incorretos.')
    await issue(req, res, user)
  })

  router.post('/logout', async (req, res) => {
    const key = cookieId(req)
    if (key) await Session.deleteOne({ _id: key })
    res.clearCookie(cookieName, cookieOptions).json({ user: null })
  })

  router.post('/forgot', async (req, res) => {
    if (!sendReset) throw new RequestError(503, 'A recuperação de acesso está indisponível no momento.')
    object(req.body, ['email'])
    const email = emailInput(req.body.email)
    limit('reset:' + hashToken(email), 4)
    const user = await User.findOne({ email }).lean()
    res.json({ message: 'Se houver uma conta com esse e-mail, você receberá um link de recuperação.' })
    if (!user) return
    try {
      const raw = token()
      await ResetToken.create({
        _id: hashToken(raw), owner: user._id, version: user.sessionVersion,
        expiresAt: new Date(Date.now() + resetLifetime),
      })
      await sendReset(email, origin + '/redefinir-acesso#token=' + raw)
    } catch (error) {
      console.error('Falha no envio da recuperação:', error.name)
    }
  })

  router.post('/reset', async (req, res) => {
    object(req.body, ['token', 'password'])
    const raw = req.body.token
    if (typeof raw !== 'string' || !tokenFormat.test(raw)) throw new RequestError(400, 'O link de recuperação é inválido ou expirou.')
    const password = validatePassword(req.body.password)
    const filter = { _id: hashToken(raw), expiresAt: { $gt: new Date() } }
    const existing = await ResetToken.exists(filter)
    if (!existing) throw new RequestError(400, 'O link de recuperação é inválido ou expirou.')
    const passwordHash = await hashPassword(password)
    await mongoose.connection.transaction(async session => {
      const reset = await ResetToken.findOneAndDelete(filter).session(session)
      if (!reset || reset.expiresAt <= new Date()) throw new RequestError(400, 'O link de recuperação é inválido ou expirou.')
      const result = await User.updateOne({ _id: reset.owner, sessionVersion: reset.version },
        { $set: { passwordHash }, $inc: { sessionVersion: 1 } }, { session })
      if (!result.modifiedCount) throw new RequestError(400, 'O link de recuperação é inválido ou expirou.')
    })
    res.clearCookie(cookieName, cookieOptions).json({ user: null })
  })

  return { router, getUser }
}
