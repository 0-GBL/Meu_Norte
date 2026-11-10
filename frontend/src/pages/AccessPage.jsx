import { useEffect, useState } from 'react'
import { ArrowRight, Compass } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useLedger } from '../LedgerContext.jsx'

const screens = {
  '/entrar': { title: 'Entrar no Meu Norte', action: 'login', button: 'Entrar' },
  '/cadastro': { title: 'Crie seu espaço financeiro', action: 'register', button: 'Criar conta' },
  '/recuperar-acesso': { title: 'Recuperar acesso', action: 'forgot', button: 'Enviar link' },
  '/redefinir-acesso': { title: 'Escolha uma nova senha', action: 'reset', button: 'Redefinir senha' },
}

export const publicPaths = ['/inicio', '/configuracao-inicial', ...Object.keys(screens)]

function AccessShell({ children }) {
  return <main className="access-shell">
    <Link to="/inicio" className="access-brand"><span className="brand-icon"><Compass size={24} /></span> Meu Norte</Link>
    {children}
  </main>
}

function AccessForm({ screen }) {
  const { auth, busy, error, user, authenticate } = useLedger()
  const location = useLocation()
  const navigate = useNavigate()
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') ?? '')
  const [message, setMessage] = useState('')
  const [completed, setCompleted] = useState(false)
  const { action } = screen

  useEffect(() => {
    if (action === 'reset' && location.hash) navigate(location.pathname, { replace: true })
  }, [action, location.hash, location.pathname, navigate])

  if (user && !busy && ['login', 'register'].includes(action)) return <Navigate replace to="/" />

  const submit = async event => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const payload = Object.fromEntries(fields)
    if (action === 'reset') payload.token = token
    setMessage('')
    const result = await authenticate(action, payload)
    if (!result) return
    if (action === 'forgot') {
      setMessage(result)
      setCompleted(true)
    } else if (action === 'reset') {
      setMessage('Senha atualizada. Entre com a nova senha.')
      setCompleted(true)
    } else {
      navigate(action === 'register' ? '/configuracao-inicial' : '/', { replace: true })
    }
  }

  const resetAvailable = action !== 'reset' || /^[a-f0-9]{64}$/.test(token)
  return <AccessShell><section className="panel detail-panel access-panel">
    <h1>{screen.title}</h1>
    {!resetAvailable && <p>Este link está incompleto. Solicite um novo link de recuperação.</p>}
    {action === 'forgot' && auth.ready && !auth.recovery && <p>O envio de e-mails de recuperação está indisponível.</p>}
    {resetAvailable && !completed && <form className="ledger-form access-form" onSubmit={submit}><fieldset disabled={busy || !auth.ready || (action === 'forgot' && !auth.recovery)}>
      {action === 'register' && <label>Nome<input name="name" maxLength={120} autoComplete="name" required /></label>}
      {action !== 'reset' && <label>E-mail<input name="email" type="email" maxLength={254} autoComplete="email" required /></label>}
      {action !== 'forgot' && <label>{action === 'reset' ? 'Nova senha' : 'Senha'}
        <input name="password" type="password" minLength={12} maxLength={256} autoComplete={action === 'login' ? 'current-password' : 'new-password'} required />
      </label>}
      {['register', 'reset'].includes(action) && <p>Use pelo menos 12 caracteres.</p>}
      <div className="ledger-actions"><button className="action-button">{busy ? 'Aguarde…' : screen.button}</button></div>
    </fieldset></form>}
    {error && !completed && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <div className="ledger-actions">
      {action !== 'login' && <Link className="text-link" to="/entrar">Entrar</Link>}
      {action === 'login' && <Link className="text-link" to="/cadastro">Criar conta</Link>}
      {['login', 'reset'].includes(action) && <Link className="text-link" to="/recuperar-acesso">Recuperar acesso</Link>}
      <Link className="text-link" to="/">Ver demonstração</Link>
    </div>
  </section></AccessShell>
}

export default function AccessPage({ path }) {
  const { enabled, auth, user } = useLedger()
  if (path === '/inicio') return <AccessShell>
    <section className="balance access-hero">
      <Compass className="balance-compass" aria-hidden="true" strokeWidth={0.36} />
      <div><p>CONTROLE FINANCEIRO PESSOAL</p><h1>Sua vida financeira,<br />na direção certa.</h1>
        <p className="balance-note">Organize contas, acompanhe faturas e reserve dinheiro para suas metas em um só espaço.</p>
      </div>
    </section>
    <div className="ledger-actions">
      <Link className="action-button" to={enabled && !user ? '/cadastro' : '/'}>{user ? 'Abrir meu espaço' : enabled ? 'Criar conta' : 'Explorar demonstração'} <ArrowRight size={16} /></Link>
      {enabled && !user && <><Link className="action-button" to="/entrar">Entrar</Link><Link className="text-link" to="/">Ver demonstração</Link></>}
    </div>
  </AccessShell>

  if (!enabled) return <Navigate replace to="/inicio" />
  if (path === '/configuracao-inicial') {
    if (!auth.ready) return <AccessShell><p role="status">Carregando seu espaço…</p></AccessShell>
    if (!user) return <Navigate replace to="/entrar" />
    return <AccessShell><section className="panel detail-panel access-panel">
      <h1>Seu espaço está pronto, {user.name}</h1>
      <p>Adicione uma conta para começar a acompanhar seu saldo ou explore os módulos no seu ritmo.</p>
      <div className="ledger-actions"><Link className="action-button" to="/contas">Adicionar primeira conta</Link>
        <Link className="text-link" to="/">Ir para a visão geral <ArrowRight size={16} /></Link></div>
    </section></AccessShell>
  }
  return <AccessForm key={path} screen={screens[path]} />
}
