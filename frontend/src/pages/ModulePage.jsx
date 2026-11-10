import { lazy, Suspense, useState } from 'react'
import { ArrowLeft, Info, Moon, Sun } from 'lucide-react'
import { Link } from 'react-router-dom'
import { accounts, assets, budgets, cards, dateLabel, goals, money, progress, reminders, totalBalance, transactions } from '../demo/finance.js'
import { ProgressBar, Table } from '../components/Details.jsx'
import { useLedger } from '../LedgerContext.jsx'
import { LedgerAccess, LiveAccounts, LiveEntries } from './LedgerPages.jsx'
import CardsPage from './CardsPage.jsx'
import { BudgetsPage, GoalsPage } from './PlanningPages.jsx'
import { AssetsPage, RemindersPage } from './RecordsPages.jsx'

const Reports = lazy(() => import('./Reports.jsx'))
const field = (key, label, render) => ({ key, label, render })
const currency = (key, label) => field(key, label, row => money(row[key]))
const date = (key, label) => field(key, label, row => dateLabel(row[key]))

const datasets = {
  '/contas': { rows: accounts, columns: [field('name', 'Conta'), field('detail', 'Tipo'), currency('balance', 'Saldo')] },
  '/cartoes': { rows: cards, columns: [
    field('name', 'Cartão'), currency('limit', 'Limite'), currency('invoice', 'Fatura atual'),
    field('available', 'Limite disponível', row => money(row.limit - row.invoice)),
    field('close', 'Fechamento', row => 'Dia ' + row.close), field('due', 'Vencimento', row => 'Dia ' + row.due), field('status', 'Status'),
  ] },
  '/patrimonio': { rows: assets, columns: [field('name', 'Registro'), field('detail', 'Categoria'), currency('value', 'Valor estimado'), date('date', 'Última avaliação')] },
  '/lembretes': { rows: reminders, columns: [field('name', 'Lembrete'), field('detail', 'Referência'), date('date', 'Data'), field('amount', 'Valor', row => row.amount == null ? '—' : money(row.amount))] },
}

const transactionColumns = [field('name', 'Descrição'), field('type', 'Tipo'), field('category', 'Categoria'), field('account', 'Conta'), date('date', 'Data'), currency('amount', 'Valor')]

function Transactions() {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ type: '', category: '', account: '', month: '' })
  const search = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const rows = transactions.filter(row => search(row.name).includes(search(query.trim()))
    && (!filters.type || row.type === filters.type)
    && (!filters.category || row.category === filters.category)
    && (!filters.account || row.account.split(' → ').includes(filters.account))
    && (!filters.month || row.date.startsWith(filters.month)))

  return <section className="panel detail-panel">
    <h2>Histórico de movimentações</h2>
    <div className="filters">
      <label>Buscar descrição<input type="search" placeholder="Ex. mercado" value={query} onChange={event => setQuery(event.target.value)} /></label>
      {[['type', 'Tipo'], ['category', 'Categoria'], ['account', 'Conta']].map(([key, label]) => {
        const options = key === 'account' ? accounts.map(row => row.name) : [...new Set(transactions.map(row => row[key]))]
        return <label key={key}>{label}<select value={filters[key]} onChange={event => setFilters({ ...filters, [key]: event.target.value })}><option value="">Todas as opções</option>{options.map(option => <option key={option}>{option}</option>)}</select></label>
      })}
      <label>Mês<input type="month" value={filters.month} onChange={event => setFilters({ ...filters, month: event.target.value })} /></label>
    </div>
    <Table label="Movimentações" columns={transactionColumns} rows={rows} />
  </section>
}

function ProgressList({ isBudget }) {
  const rows = isBudget
    ? budgets.map(row => ({ name: row.name, current: row.spent, target: row.limit }))
    : goals.map(row => ({ name: row.name, current: row.saved, target: row.target }))
  return <div className="progress-grid">{rows.map(row => <article key={row.name} className="panel detail-panel">
    <h2>{row.name}</h2>
    <div className="goal-numbers"><span>{money(row.current)} de {money(row.target)}</span><strong>{progress(row.current, row.target)}%</strong></div>
    <ProgressBar {...row} label={row.name} />
    <p>{money(Math.abs(row.target - row.current))} {row.current > row.target ? 'acima do valor previsto' : 'restantes'}</p>
  </article>)}</div>
}

function Preferences({ theme, toggleTheme }) {
  return <div className="progress-grid">
    <section className="panel detail-panel"><h2>Aparência</h2><p>Escolha o tema para este navegador.</p><button type="button" className="action-button" onClick={toggleTheme}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}{theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}</button></section>
    <section className="panel detail-panel"><h2>Primeiros passos</h2><details><summary>Por onde começo?</summary><p>Explore Contas para entender o saldo total. Depois, consulte Movimentações para acompanhar receitas, despesas e transferências.</p></details><details><summary>Como funcionam os lembretes?</summary><p>A seção Lembretes reúne os próximos compromissos da amostra, como vencimentos e revisões de patrimônio.</p></details><details><summary>Quais dados são guardados?</summary><p>O navegador guarda a preferência de tema. Quando os registros estão conectados, as contas e movimentações cadastradas ficam no banco de dados.</p></details></section>
  </div>
}

export default function ModulePage({ item, theme, toggleTheme }) {
  const { data, enabled } = useLedger()
  const dataset = datasets[item.path]
  const liveAccounts = data && item.path === '/contas'
  const liveEntries = data && item.path === '/movimentacoes'
  const liveCards = data && item.path === '/cartoes'
  const liveBudgets = data && item.path === '/orcamentos'
  const liveGoals = data && item.path === '/metas'
  const liveAssets = data && item.path === '/patrimonio'
  const liveReminders = data && item.path === '/lembretes'
  const preferences = item.path === '/configuracoes'
  return <>
    <Link className="text-link back-link" to="/"><ArrowLeft size={16} /> Voltar à visão geral</Link>
    <div className="page-intro"><div><p className="eyebrow">SEU ESPAÇO FINANCEIRO</p><h1>{item.label}</h1><p>{item.description}</p></div></div>
    {!data && !preferences && <p className="demo-notice"><Info size={18} /> Esta seção usa dados fictícios para demonstrar a interface.{enabled && <Link className="text-link" to="/entrar">Entrar para acessar seus registros</Link>}</p>}
    {liveAccounts && <LiveAccounts />}
    {liveEntries && <LiveEntries />}
    {liveCards && <CardsPage />}
    {liveBudgets && <BudgetsPage />}
    {liveGoals && <GoalsPage />}
    {liveAssets && <AssetsPage />}
    {liveReminders && <RemindersPage />}
    {item.path === '/movimentacoes' && !liveEntries && <Transactions />}
    {item.path === '/orcamentos' && !liveBudgets && <ProgressList isBudget />}
    {item.path === '/metas' && !liveGoals && <ProgressList />}
    {item.path === '/relatorios' && <Suspense fallback={<p role="status">Carregando relatório…</p>}><Reports /></Suspense>}
    {preferences && <div className="ledger-stack"><LedgerAccess /><Preferences theme={theme} toggleTheme={toggleTheme} /></div>}
    {dataset && !data && <section className="panel detail-panel">
      <h2>{item.path === '/contas' ? 'Saldo consolidado · ' + money(totalBalance(accounts)) : item.label}</h2>
      <Table label={item.label} {...dataset} />
    </section>}
  </>
}
