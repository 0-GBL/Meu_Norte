import { useEffect, useState } from 'react'
import { Compass } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useLedger } from '../LedgerContext.jsx'

const screens = {
  '/entrar': { title: 'Entre na sua conta', action: 'login', button: 'Entrar' },
  '/recuperar-acesso': { title: 'Recuperar acesso', action: 'forgot', button: 'Enviar link' },
  '/redefinir-acesso': { title: 'Escolha uma nova senha', action: 'reset', button: 'Redefinir senha' },
}

export const publicPaths = Object.keys(screens)

export default function AccessPage({ path }) {
  const { auth, busy, error, user, authenticate } = useLedger()
  const location = useLocation()
  const navigate = useNavigate()
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') ?? '')
  const [message, setMessage] = useState('')
  const screen = screens[path]
  const { action } = screen

  useEffect(() => {
    if (action === 'reset' && location.hash) navigate(location.pathname, { replace: true })
  }, [action, location.hash, location.pathname, navigate])

  if (user && !busy && action === 'login') return <Navigate replace to={user.mustChangePassword ? '/perfil' : '/'} />

  async function submit(event) {
    event.preventDefault()
    const payload = Object.fromEntries(new FormData(event.currentTarget))
    if (action === 'reset') payload.token = token
    const result = await authenticate(action, payload)
    if (result && action !== 'login') setMessage(action === 'reset' ? 'Senha atualizada. Entre com a nova senha.' : result)
  }

  const resetAvailable = action !== 'reset' || /^[a-f0-9]{64}$/.test(token)
  return <main className="signin-page">
    <div className="signin-brand"><span className="brand-icon"><Compass size={27} aria-hidden="true" /></span><strong>Meu Norte</strong></div>
    <p className="signin-slogan">Sua vida financeira, na direção certa.</p>
    <section className="panel detail-panel access-panel">
      <h1>{screen.title}</h1>
      {!resetAvailable && <p>Este link está incompleto. Solicite um novo link de recuperação.</p>}
      {action === 'forgot' && auth.ready && !auth.recovery && <p>O envio de e-mails de recuperação está indisponível.</p>}
      {resetAvailable && !message && <form className="ledger-form access-form" onSubmit={submit}>
        <fieldset disabled={busy || !auth.ready || (action === 'forgot' && !auth.recovery)}>
          {action !== 'reset' && <label>E-mail<input name="email" type="email" maxLength={254} autoComplete="username" required /></label>}
          {action !== 'forgot' && <label>{action === 'reset' ? 'Nova senha' : 'Senha'}
            <input name="password" type="password" minLength={action === 'reset' ? 12 : undefined} maxLength={256}
              autoComplete={action === 'login' ? 'current-password' : 'new-password'} required />
          </label>}
          <button className="action-button signin-submit">{busy ? 'Aguarde…' : screen.button}</button>
        </fieldset>
      </form>}
      {error && !message && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {action !== 'login' && <Link className="text-link" to="/entrar">Voltar ao login</Link>}
      {auth.recovery && action !== 'forgot' && <Link className="text-link" to="/recuperar-acesso">Recuperar acesso</Link>}
    </section>
  </main>
}
