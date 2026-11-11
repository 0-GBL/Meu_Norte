import 'dotenv/config'
import mongoose from 'mongoose'
import nodemailer from 'nodemailer'
import { createApp } from './app.js'
import { bootstrapAdmin } from './bootstrapAdmin.js'
import { RequestError } from './ledger.js'
import * as models from './models.js'

const {
  MONGODB_URI, CLIENT_ORIGIN = 'http://localhost:5173',
  PORT = '3001', NODE_ENV, SMTP_HOST, SMTP_PORT = '587', SMTP_USER, SMTP_PASS, SMTP_FROM,
  INITIAL_ADMIN_NAME, INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD, INITIAL_ADMIN_LEGACY_OWNER,
} = process.env
const configurationError = 'Confira a configuração em backend/.env.'

function mailer() {
  if (!SMTP_HOST) return undefined
  if (!SMTP_FROM || !/^\d+$/.test(SMTP_PORT) || Number(SMTP_PORT) < 1 || Number(SMTP_PORT) > 65535 ||
    Boolean(SMTP_USER) !== Boolean(SMTP_PASS)) throw new Error(configurationError)
  const secure = SMTP_PORT === '465'
  const transport = nodemailer.createTransport({
    host: SMTP_HOST, port: Number(SMTP_PORT), secure, requireTLS: !secure,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true,
  })
  return (to, link) => transport.sendMail({
    from: SMTP_FROM, to: { name: '', address: to }, subject: 'Recuperação de acesso ao Meu Norte',
    text: 'Abra este link para escolher uma nova senha. O link expira em 30 minutos.\n\n' + link +
      '\n\nSe você não pediu a recuperação, ignore esta mensagem.',
  })
}

async function start() {
  const production = NODE_ENV === 'production'
  let origin
  try { origin = new URL(CLIENT_ORIGIN) }
  catch { throw new Error(configurationError) }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
  const allowInitialLogin = local && (!NODE_ENV || NODE_ENV === 'development')
  const initialAdmin = { name: INITIAL_ADMIN_NAME, email: INITIAL_ADMIN_EMAIL, password: INITIAL_ADMIN_PASSWORD, legacyOwner: INITIAL_ADMIN_LEGACY_OWNER }
  if (!MONGODB_URI || origin.origin !== CLIENT_ORIGIN ||
    (origin.protocol !== 'https:' && (production || !local || origin.protocol !== 'http:')) ||
    (!allowInitialLogin && Object.values(initialAdmin).some(Boolean)) ||
    !/^\d+$/.test(PORT) || Number(PORT) < 1 || Number(PORT) > 65535) {
    throw new Error(configurationError)
  }

  const sendReset = mailer()
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
  await Promise.all(Object.values(models).map(model => model.init()))
  if (allowInitialLogin) await bootstrapAdmin(initialAdmin)
  const app = createApp({
    origin: CLIENT_ORIGIN, secureCookies: origin.protocol === 'https:', sendReset, allowInitialLogin,
  })
  app.listen(Number(PORT), '127.0.0.1', error => {
    if (error) {
      console.error('Não foi possível abrir a porta da API:', error.code)
      process.exit(1)
    }
    console.log('API Meu Norte em http://localhost:' + PORT)
  })
}

start().catch(error => {
  console.error(error instanceof RequestError || error.message === configurationError
    ? error.message : 'Não foi possível iniciar a API: ' + error.name)
  process.exit(1)
})
