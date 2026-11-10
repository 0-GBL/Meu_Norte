import { useEffect, useState } from 'react'
import { ArrowUpRight, Bell, Compass, Menu, Moon, Sun, X } from 'lucide-react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { modules, overview, settings } from './navigation.js'
import Dashboard from './pages/Dashboard.jsx'
import ModulePage from './pages/ModulePage.jsx'
import { useLedger } from './LedgerContext.jsx'
import AccessPage, { publicPaths } from './pages/AccessPage.jsx'

function SidebarLink({ item }) {
  const Icon = item.icon
  return <NavLink to={item.path} end className="side-link"><Icon size={18} />{item.label}</NavLink>
}

export default function App() {
  const { data, enabled, user, auth, busy, error, refresh } = useLedger()
  const [theme, setTheme] = useState(() => localStorage.getItem('meu-norte-theme') === 'dark' ? 'dark' : 'light')
  const [menuPath, setMenuPath] = useState(null)
  const { pathname } = useLocation()
  const menuOpen = menuPath === pathname
  const current = [overview, ...modules, settings].find(item => item.path === pathname)
  const toggleTheme = () => setTheme(value => value === 'light' ? 'dark' : 'light')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('meu-norte-theme', theme)
  }, [theme])

  useEffect(() => {
    document.title = current ? current.label + ' | Meu Norte' : 'Meu Norte'
    window.scrollTo(0, 0)
  }, [current, pathname])

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

  if (publicPaths.includes(pathname)) return <AccessPage path={pathname} />

  return (
    <div className="shell">
      <a href="#conteudo" className="skip-link">Ir para o conteúdo</a>
      <aside id="sidebar" className={menuOpen ? 'sidebar mobile-open' : 'sidebar'}>
        <Link to="/" className="brand" onClick={() => setMenuPath(null)}>
          <span className="brand-icon"><Compass size={24} /></span>
          <span>Meu Norte<small>FINANÇAS PESSOAIS</small></span>
        </Link>
        <nav aria-label="Navegação principal" onClick={() => setMenuPath(null)}>
          <div className="nav-caption">ESPAÇO FINANCEIRO</div>
          <SidebarLink item={overview} />
          {modules.map(item => <SidebarLink key={item.path} item={item} />)}
          <div className="nav-caption settings-caption">PREFERÊNCIAS</div>
          <SidebarLink item={settings} />
        </nav>
        <div className="sidebar-foot"><div className="avatar" aria-hidden="true">MN</div><div>{user?.name ?? 'Espaço pessoal'}<small>{data ? 'Registros conectados' : user ? 'Conta conectada' : 'Modo demonstração'}</small></div></div>
      </aside>
      {menuOpen && <div className="menu-overlay" aria-hidden="true" onClick={() => setMenuPath(null)} />}
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-start">
            <button id="mobile-menu-button" type="button" className="icon-button mobile-toggle" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuOpen} aria-controls="sidebar" onClick={() => setMenuPath(menuOpen ? null : pathname)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
            <span className="breadcrumb"><span>Meu espaço</span><span aria-hidden="true">/</span><strong>{current?.label ?? 'Página indisponível'}</strong></span>
          </div>
          <div className="topbar-actions">
            <span className="demo-pill"><span /> {data ? 'Registros conectados' : 'Demonstração'}</span>
            {enabled && !user && <Link className="action-button header-access" to="/entrar">Entrar</Link>}
            <Link className="icon-button" to="/lembretes" aria-label="Ver lembretes"><Bell size={19} /></Link>
            <button className="icon-button" type="button" onClick={toggleTheme} aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}>{theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button>
          </div>
        </header>
        <main id="conteudo" tabIndex={-1} className="content">
          {enabled && (!auth.ready || (user && !data)) ? <section className="panel detail-panel">
            <h1>Seu espaço financeiro</h1>
            {error ? <><p role="alert">{error}</p><button type="button" className="action-button" disabled={busy} onClick={refresh}>Tentar novamente</button></> : <p role="status">Carregando seus registros…</p>}
          </section> : <Routes>
            <Route path="/" element={<Dashboard />} />
            {[...modules, settings].map(item => <Route key={item.path} path={item.path} element={<ModulePage item={item} theme={theme} toggleTheme={toggleTheme} />} />)}
            <Route path="*" element={<section className="panel detail-panel"><h1>Página não encontrada</h1><Link className="text-link" to="/">Voltar à visão geral <ArrowUpRight size={16} /></Link></section>} />
          </Routes>}
          <footer className="footer"><Link to="/inicio">Meu Norte</Link><span>Sua vida financeira, na direção certa.</span></footer>
        </main>
      </div>
    </div>
  )
}
