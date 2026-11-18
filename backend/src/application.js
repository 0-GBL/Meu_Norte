import express from 'express'
import { createApp } from './app.js'
import { sessionCookieName } from './auth.js'
import { createDemoRouter } from './demo.js'
import { DEMO_EMAIL } from '../../shared/demoAccess.mjs'

export function createApplication({ demo = { enabled: false, email: DEMO_EMAIL }, ...options }) {
  const app = express()
  const personal = createApp(options)
  const readOnly = createDemoRouter({ config: demo, ...options })
  const cookie = sessionCookieName(options.secureCookies, true)
  app.disable('x-powered-by')
  app.use('/api', (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' })
    const origin = req.get('origin')
    if (origin && origin !== options.origin) return res.status(403).json({ message: 'Origem não autorizada.' })
    res.vary('Origin')
    if (origin) res.set({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    })
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })
  app.post(['/api/auth/login', '/api/auth/forgot'], express.json({ limit: '4kb', strict: true }))
  app.use((req, res, next) => {
    // Even an expired/forged demo cookie must never fall through to personal data.
    let isDemo = Boolean(req.get('cookie')?.split(';').some(value => value.trim().startsWith(cookie + '=')))
    if (['/api/auth/login', '/api/auth/forgot'].includes(req.path) && req.method === 'POST') {
      isDemo = typeof req.body?.email === 'string' && req.body.email.trim().toLowerCase() === demo.email
    }
    return (isDemo ? readOnly : personal)(req, res, next)
  })
  app.use((error, _req, res, _next) => {
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500
    res.status(status).json({ message: status === 500 ? 'Não foi possível concluir a solicitação.' : 'Formato de dados inválido.' })
  })
  return app
}
