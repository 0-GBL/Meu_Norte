import { ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, CalendarDays, Compass, Flag, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { modules } from '../navigation.js'
import { money, dateLabel, localDay, progress } from '../ledgerFormat.js'
import { ProgressBar } from '../components/Details.jsx'
import { useLedger } from '../LedgerContext.jsx'
import { reminderItems } from './RecordsPages.jsx'

function QuickLink({ item }) {
  const Icon = item.icon
  return <Link to={item.path} className="panel quick-card">
    <span className={'tile-icon ' + item.tone}><Icon size={21} /></span>
    <ArrowUpRight size={17} className="quick-arrow" aria-hidden="true" />
    <strong>{item.label}</strong>
    <span className="quick-description">{item.description}</span>
  </Link>
}

export default function Dashboard() {
  const { data } = useLedger()
  const goal = data.goals.find(row => row.status === 'active' && !row.completed)
  const upcoming = reminderItems(data)
  const latest = data.entries.slice(0, 2).map(entry => ({
    id: entry._id, name: entry.description, date: entry.date,
    category: entry.category ?? (entry.type === 'cardPayment' ? 'Pagamento de fatura' : 'Transferência'),
    amount: ['expense', 'cardPayment'].includes(entry.type) ? -entry.amount : entry.amount,
    isIncome: entry.type === 'income',
  }))
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(localDay()))
  return <>
    <div className="page-intro">
      <div><p className="eyebrow">SEU PANORAMA FINANCEIRO</p><h1>Visão geral</h1><p>Acompanhe suas finanças e planeje seus próximos passos.</p></div>
      <span className="date-chip"><CalendarDays size={17} /> {month}</span>
    </div>

    <section className="balance" aria-labelledby="balance-title">
      <Compass className="balance-compass" aria-hidden="true" strokeWidth={0.36} />
      <div className="balance-content">
        <div className="balance-label" id="balance-title"><span><Wallet size={19} /></span> Saldo total</div>
        <p className="balance-value">{money(data.total)}</p>
        <p className="balance-note">Soma dos saldos das suas contas financeiras</p>
      </div>
      <Link to="/contas" className="balance-link">Ver contas <ArrowRight size={16} /></Link>
    </section>

    <section className="dashboard-section" aria-labelledby="quick-title">
      <div className="section-heading"><h2 id="quick-title">O que você deseja fazer?</h2><p>Acesse as principais áreas do Meu Norte.</p></div>
      <div className="quick-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{modules.map(item => <QuickLink key={item.path} item={item} />)}</div>
    </section>

    {(latest.length > 0 || goal || upcoming.length > 0) && <section className="dashboard-section" aria-labelledby="activity-title">
      <div className="section-heading"><h2 id="activity-title">Acompanhe de perto</h2></div>
      <div className="summary-grid">
        {latest.length > 0 && <article className="panel summary-card">
          <h3><span className="tile-icon blue"><ArrowDownLeft size={17} /></span> Últimas movimentações</h3>
          <ul className="summary-list">{latest.map(row => <li key={row.id}><div><strong>{row.name}</strong><small>{row.category} · {dateLabel(row.date)}</small></div><strong className={row.isIncome ? 'positive' : ''}>{money(row.amount)}</strong></li>)}</ul>
          <Link className="text-link" to="/movimentacoes">Ver histórico <ArrowRight size={15} /></Link>
        </article>}
        {goal && <article className="panel summary-card">
          <h3><span className="tile-icon green"><Flag size={17} /></span> Meta em destaque</h3>
          <div className="goal-summary"><strong>{goal.name}</strong><ProgressBar current={goal.saved} target={goal.target} label={goal.name} /><div className="goal-numbers"><small>{money(goal.saved)} de {money(goal.target)}</small><strong>{progress(goal.saved, goal.target)}%</strong></div></div>
          <Link className="text-link" to="/metas">Ver metas <ArrowRight size={15} /></Link>
        </article>}
        {upcoming.length > 0 && <article className="panel summary-card">
          <h3><span className="tile-icon amber"><Bell size={17} /></span> Próximos lembretes</h3>
          <ul className="summary-list">{upcoming.slice(0, 2).map(row => <li key={row.id ?? row.name}><div><strong>{row.name}</strong><small>{row.detail}</small></div><small className="reminder-date">{dateLabel(row.date)}</small></li>)}</ul>
          <Link className="text-link" to="/lembretes">Ver lembretes <ArrowRight size={15} /></Link>
        </article>}
      </div>
    </section>}
  </>
}
