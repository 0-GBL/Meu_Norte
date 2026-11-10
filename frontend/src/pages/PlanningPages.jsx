import { useState } from 'react'
import { ProgressBar, Table } from '../components/Details.jsx'
import { money, progress } from '../demo/finance.js'
import { useLedger } from '../LedgerContext.jsx'
import { localDay, toCents } from '../ledgerFormat.js'

const budgetLabels = { normal: 'Dentro do orçamento', near: 'Perto do limite', full: 'Limite atingido', over: 'Limite ultrapassado' }
const goalLabels = { active: 'Em andamento', complete: 'Concluída', archived: 'Arquivada' }
const inputAmount = amount => (amount / 100).toFixed(2).replace('.', ',')

export function BudgetsPage() {
  const { data, busy, error, mutate } = useLedger()
  const [month, setMonth] = useState(localDay().slice(0, 7))
  const [message, setMessage] = useState('')
  const rows = data.budgets.filter(row => row.month === month)
  const submit = async event => {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const limit = toCents(fields.get('limit'))
    if (!limit || limit < 0) return setMessage('Informe um limite positivo com até duas casas decimais.')
    setMessage('')
    if (await mutate('/budgets', 'POST', { month, category: fields.get('category').trim(), limit })) form.reset()
  }

  return <div className="ledger-stack">
    <section className="panel detail-panel">
      <h2>Planejamento mensal</h2>
      <div className="filters"><label>Mês de referência<input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label></div>
      <form className="ledger-form" onSubmit={submit}>
        <fieldset disabled={busy || !month}>
          <label>Categoria<input name="category" placeholder="Em branco para orçamento geral" maxLength={120} /></label>
          <label>Limite (R$)<input name="limit" inputMode="decimal" required /></label>
          <div className="ledger-actions"><button className="action-button">Salvar limite do mês</button></div>
        </fieldset>
      </form>
      <p>O orçamento geral inclui todas as categorias. Salvar a mesma categoria no mesmo mês atualiza seu limite.</p>
      {(message || error) && <p role="alert">{message || error}</p>}
    </section>
    {rows.length ? <div className="progress-grid">{rows.map(row => {
      const title = row.category || 'Orçamento geral'
      return <article key={row._id} className="panel detail-panel">
        <h2>{title}</h2><p>{money(row.spent)} realizados de {money(row.limit)} planejados</p>
        <ProgressBar current={row.spent} target={row.limit} label={title} />
        <p><strong>{budgetLabels[row.status]}</strong> · {money(Math.abs(row.remaining))} {row.remaining < 0 ? 'acima do limite' : 'restantes'}</p>
      </article>
    })}</div> : <section className="panel detail-panel"><p>Defina um limite para acompanhar os gastos deste mês.</p></section>}
    {data.budgets.length > 0 && <section className="panel detail-panel"><h2>Histórico de orçamentos</h2>
      <Table label="Histórico de orçamentos" rows={data.budgets.map(row => ({ ...row, id: row._id }))} columns={[
        { key: 'month', label: 'Mês' }, { key: 'category', label: 'Categoria', render: row => row.category || 'Geral' },
        { key: 'limit', label: 'Planejado', render: row => money(row.limit) }, { key: 'spent', label: 'Realizado', render: row => money(row.spent) },
        { key: 'status', label: 'Situação', render: row => budgetLabels[row.status] },
      ]} />
    </section>}
  </div>
}

function GoalEditor({ goal, onDone }) {
  const { busy, mutate } = useLedger()
  const [message, setMessage] = useState('')
  const submit = async event => {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const target = toCents(fields.get('target'))
    const monthly = toCents(fields.get('monthly') || '0')
    if (!target || target < 0 || monthly === null || monthly < 0) return setMessage('Confira o valor da meta e o aporte mensal.')
    setMessage('')
    const payload = { name: fields.get('name'), target, monthly, status: fields.get('status') ?? 'active' }
    if (await mutate(goal ? '/goals/' + goal._id : '/goals', goal ? 'PUT' : 'POST', payload)) {
      form.reset()
      onDone()
    }
  }
  return <section className="panel detail-panel">
    <h2>{goal ? 'Editar meta' : 'Nova meta'}</h2>
    <form className="ledger-form" onSubmit={submit}><fieldset disabled={busy}>
      <label>Nome<input name="name" required maxLength={120} defaultValue={goal?.name} /></label>
      <label>Valor desejado (R$)<input name="target" required inputMode="decimal" defaultValue={goal && inputAmount(goal.target)} /></label>
      <label>Aporte mensal planejado (R$)<input name="monthly" inputMode="decimal" defaultValue={goal && inputAmount(goal.monthly)} /></label>
      {goal && <label>Situação<select name="status" defaultValue={goal.status}>{Object.entries(goalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      <div className="ledger-actions"><button className="action-button">Salvar meta</button>{goal && <button className="action-button" type="button" onClick={onDone}>Cancelar</button>}</div>
    </fieldset></form>
    {message && <p role="alert">{message}</p>}
  </section>
}

function GoalDetails({ goal, onEdit }) {
  const { busy, mutate } = useLedger()
  const [message, setMessage] = useState('')
  const submit = async event => {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const amount = toCents(fields.get('amount'))
    if (!amount || amount < 0) return setMessage('Informe um valor positivo com até duas casas decimais.')
    setMessage('')
    if (await mutate('/goals/' + goal._id + '/events', 'POST', { amount: fields.get('operation') === 'withdraw' ? -amount : amount })) form.reset()
  }
  return <article className="panel detail-panel">
    <h2>{goal.name}</h2>
    <p>{goalLabels[goal.status]} · {money(goal.saved)} de {money(goal.target)} · {progress(goal.saved, goal.target)}%</p>
    <ProgressBar current={goal.saved} target={goal.target} label={goal.name} />
    <p>{money(goal.remaining)} para atingir a meta.</p>
    {goal.status === 'active' && goal.months !== null && <p>Estimativa de {goal.months} {goal.months === 1 ? 'mês' : 'meses'} com aportes mensais de {money(goal.monthly)}.</p>}
    <button className="action-button" type="button" onClick={onEdit}>Editar meta</button>
    {goal.status === 'active' && <form className="ledger-form" onSubmit={submit}><fieldset disabled={busy}>
      <label>Operação<select name="operation"><option value="deposit">Aporte</option><option value="withdraw">Retirada</option></select></label>
      <label>Valor (R$)<input name="amount" required inputMode="decimal" /></label>
      <div className="ledger-actions"><button className="action-button">Registrar</button></div>
    </fieldset></form>}
    {message && <p role="alert">{message}</p>}
    {goal.events.length > 0 && <details><summary>Histórico de aportes e retiradas</summary>
      <Table label={'Histórico de ' + goal.name} rows={goal.events.map(row => ({ ...row, id: row._id }))} columns={[
        { key: 'date', label: 'Data' }, { key: 'type', label: 'Operação', render: row => row.amount > 0 ? 'Aporte' : 'Retirada' },
        { key: 'amount', label: 'Valor', render: row => money(Math.abs(row.amount)) },
      ]} />
    </details>}
  </article>
}

export function GoalsPage() {
  const { data, error } = useLedger()
  const [editing, setEditing] = useState('')
  const goal = data.goals.find(row => row._id === editing)
  return <div className="ledger-stack">
    {error && <p className="demo-notice" role="alert">{error}</p>}
    <GoalEditor key={editing || 'new'} goal={goal} onDone={() => setEditing('')} />
    <div className="progress-grid">{data.goals.map(row => <GoalDetails key={row._id} goal={row} onEdit={() => {
      setEditing(row._id)
      document.getElementById('conteudo').scrollIntoView()
    }} />)}</div>
  </div>
}
