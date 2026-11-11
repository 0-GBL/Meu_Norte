import { lazy, Suspense } from 'react'
import { ArrowLeft, Moon, Sun } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLedger } from '../LedgerContext.jsx'
import { LiveAccounts, LiveEntries } from './LedgerPages.jsx'
import CardsPage from './CardsPage.jsx'
import { BudgetsPage, GoalsPage } from './PlanningPages.jsx'
import { AssetsPage, RemindersPage } from './RecordsPages.jsx'

const Reports = lazy(() => import('./Reports.jsx'))

const pages = {
  '/contas': LiveAccounts,
  '/movimentacoes': LiveEntries,
  '/cartoes': CardsPage,
  '/orcamentos': BudgetsPage,
  '/metas': GoalsPage,
  '/patrimonio': AssetsPage,
  '/lembretes': RemindersPage,
  '/relatorios': Reports,
}

function Preferences({ theme, toggleTheme }) {
  return <div className="progress-grid">
    <section className="panel detail-panel"><h2>Aparência</h2><p>Escolha o tema para este navegador.</p><button type="button" className="action-button" onClick={toggleTheme}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}{theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}</button></section>
    <section className="panel detail-panel"><h2>Primeiros passos</h2><details><summary>Por onde começo?</summary><p>Explore Contas para entender o saldo total. Depois, consulte Movimentações para acompanhar receitas, despesas e transferências.</p></details><details><summary>Como funcionam os lembretes?</summary><p>A seção Lembretes reúne os próximos compromissos, como vencimentos e revisões de patrimônio.</p></details><details><summary>Quais dados são guardados?</summary><p>O navegador guarda a preferência de tema. Quando os registros estão conectados, as contas e movimentações cadastradas ficam no banco de dados.</p></details></section>
  </div>
}

export default function ModulePage({ item, theme, toggleTheme }) {
  const { feedback } = useLedger()
  const Page = pages[item.path]
  return <>
    <Link className="text-link back-link" to="/"><ArrowLeft size={16} /> Voltar à visão geral</Link>
    {Page !== Reports && <div className="page-intro"><div><p className="eyebrow">SEU ESPAÇO FINANCEIRO</p><h1>{item.label}</h1><p>{item.description}</p></div></div>}
    <div className="form-feedback" role="status">{feedback && <span>{feedback}</span>}</div>
    {Page ? <Suspense fallback={<p role="status">Carregando…</p>}><Page /></Suspense> : <Preferences theme={theme} toggleTheme={toggleTheme} />}
  </>
}
