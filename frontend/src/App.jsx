import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Bell, Compass, Menu, Moon, Sun, X } from 'lucide-react'
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { modules, overview, settings, sidebarLinks, sidebarGroups } from './navigation.js'
import Dashboard from './pages/Dashboard.jsx'
import ModulePage from './pages/ModulePage.jsx'
import { useLedger } from './LedgerContext.jsx'
import AccessPage, { publicPaths } from './pages/AccessPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'

const notificationClock = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

function SidebarLink({ item }) {
  const Icon = item.icon
  return <NavLink to={item.path} end className="side-link"><Icon size={18} />{item.label}</NavLink>
}

function SidebarGroup({ group, pathname }) {
  const disclosure = useRef(null)
  useEffect(() => {
    if (group.items.some(item => item.path === pathname)) disclosure.current.open = true
  }, [group, pathname])
  return <details className="sidebar-group" ref={disclosure}>
    <summary>{group.label}</summary>
    {group.items.map(item => <SidebarLink key={item.path} item={item} />)}
  </details>
}

export default function App() {
  const { data, user, auth, busy, error, refresh, authenticate } = useLedger()
  const [theme, setTheme] = useState(() => localStorage.getItem('meu-norte-theme') === 'dark' ? 'dark' : 'light')
  const [menuPath, setMenuPath] = useState(null)
  const { pathname, hash } = useLocation()
  const [notificationTime, setNotificationTime] = useState(() => notificationClock.format(new Date()))
  const unread = data?.reminders.filter(row => row.status === 'active' && !row.read && (row.notifyOn
    ? row.notifyOn + ' ' + (row.time || '00:00') <= notificationTime : row.relevant)).length ?? 0
  const menuOpen = menuPath === pathname
  const current = [overview, ...modules, settings].find(item => item.path === pathname)
  const toggleTheme = () => setTheme(value => value === 'light' ? 'dark' : 'light')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('meu-norte-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!data?.reminders.some(row => row.status === 'active')) return
    setNotificationTime(notificationClock.format(new Date()))
    const timer = setInterval(() => setNotificationTime(notificationClock.format(new Date())), 30000)
    return () => clearInterval(timer)
  }, [data?.reminders])

  useEffect(() => {
    document.title = current ? current.label + ' | Meu Norte' : 'Meu Norte'
    const target = hash && document.getElementById(hash.slice(1))
    if (target) target.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [current, pathname, hash, Boolean(data)])

  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        setMenuPath(null)
        document.getElementById('mobile-menu-button')?.focus()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])

  if (publicPaths.includes(pathname)) return <AccessPage key={pathname} path={pathname} />
  if (!auth.ready) return <main className="signin-page"><p role="status">Verificando sessão…</p></main>
  if (!user) return <Navigate replace to="/entrar" />
  if (user.mustChangePassword && pathname !== '/perfil') return <Navigate replace to="/perfil" />

  return (
    <div className="shell">
      <a href="#conteudo" className="skip-link">Ir para o conteúdo</a>
      <aside id="sidebar" className={menuOpen ? 'sidebar mobile-open' : 'sidebar'}>
        <Link to="/" className="brand" onClick={() => setMenuPath(null)}>
          <span className="brand-icon"><Compass size={24} /></span>
          <span>Meu Norte<small>FINANÇAS PESSOAIS</small></span>
        </Link>
        {!user.mustChangePassword && <nav aria-label="Navegação principal" onClick={event => { if (event.target.closest('a')) setMenuPath(null) }}>
          <div className="nav-caption">ESPAÇO FINANCEIRO</div>
          <SidebarLink item={overview} />
          {sidebarLinks.map(item => <SidebarLink key={item.path} item={item} />)}
          {sidebarGroups.map(group => <SidebarGroup key={group.label} group={group} pathname={pathname} />)}
          <div className="nav-caption settings-caption">PREFERÊNCIAS</div>
          <SidebarLink item={settings} />
        </nav>}
        <div className="sidebar-foot sidebar-profile">
          <div className="avatar" aria-hidden="true">{user.name.slice(0, 2).toUpperCase()}</div>
          <div><strong>{user.name}</strong>
            <div className="sidebar-profile-actions">
              <NavLink to="/perfil" onClick={() => setMenuPath(null)}>Minha conta</NavLink>
              <button type="button" disabled={busy} onClick={() => authenticate('logout', {})}>Sair</button>
            </div>
          </div>
        </div>
      </aside>
      {menuOpen && <div className="menu-overlay" aria-hidden="true" onClick={() => setMenuPath(null)} />}
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-start">
            <button id="mobile-menu-button" type="button" className="icon-button mobile-toggle" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuOpen} aria-controls="sidebar" onClick={() => setMenuPath(menuOpen ? null : pathname)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
            <span className="breadcrumb"><span>Meu espaço</span><span aria-hidden="true">/</span><strong>{pathname === '/perfil' ? 'Meu Perfil' : current?.label ?? 'Página indisponível'}</strong></span>
          </div>
          <div className="topbar-actions">
            {!user.mustChangePassword && <Link className="icon-button notification-link" to="/lembretes#notificacoes" aria-label={unread ? 'Notificações internas · ' + unread + ' avisos não lidos' : 'Ver notificações internas'}>
              <Bell size={19} />{unread > 0 && <span className="notification-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
            </Link>}
            <button className="icon-button" type="button" onClick={toggleTheme} aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}>{theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button>
          </div>
        </header>
        <main id="conteudo" tabIndex={-1} className="content">
          {pathname === '/perfil' ? <ProfilePage /> : !data ? <section className="panel detail-panel">
            <h1>Seu espaço financeiro</h1>
            {error ? <><p role="alert">{error}</p><button type="button" className="action-button" disabled={busy} onClick={refresh}>Tentar novamente</button></> : <p role="status">Carregando seus registros…</p>}
          </section> : <Routes>
            <Route path="/" element={<Dashboard />} />
            {[...modules, settings].map(item => <Route key={item.path} path={item.path} element={<ModulePage item={item} theme={theme} toggleTheme={toggleTheme} />} />)}
            <Route path="*" element={<section className="panel detail-panel"><h1>Página não encontrada</h1><Link className="text-link" to="/">Voltar à visão geral <ArrowUpRight size={16} /></Link></section>} />
          </Routes>}
          <footer className="footer"><Link to="/">Meu Norte</Link><span>Sua vida financeira, na direção certa.</span></footer>
        </main>
      </div>
    </div>
  )
}
