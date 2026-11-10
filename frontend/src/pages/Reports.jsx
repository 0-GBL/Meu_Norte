import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Table } from '../components/Details.jsx'
import { history, money } from '../demo/finance.js'
import { useLedger } from '../LedgerContext.jsx'
import { localDay } from '../ledgerFormat.js'

const columns = [
  { key: 'month', label: 'Mês' },
  { key: 'receitas', label: 'Receitas', render: row => money(row.receitas) },
  { key: 'despesas', label: 'Despesas líquidas', render: row => money(row.despesas) },
]
const thousands = value => value === 0 ? '0' : new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL' }).format(value / 100)

function Chart({ rows, fields }) {
  return <div className="chart"><ResponsiveContainer width="100%" height="100%">
    <BarChart data={rows} margin={{ left: 5, top: 16 }}>
      <CartesianGrid vertical={false} stroke="var(--line)" />
      <XAxis dataKey="month" tick={{ fill: 'var(--muted)' }} />
      <YAxis width={74} tickFormatter={thousands} tick={{ fill: 'var(--muted)' }} />
      <Tooltip formatter={money} contentStyle={{ background: 'var(--surface)', borderColor: 'var(--line)', borderRadius: 10 }} itemStyle={{ color: 'var(--text)' }} />
      <Legend />
      {fields.map(([key, name, color]) => <Bar key={key} dataKey={key} name={name} fill={color} radius={[5, 5, 0, 0]} />)}
    </BarChart>
  </ResponsiveContainer></div>
}

const cashSeries = [
  ['receitas', 'Receitas', 'var(--chart-income)'],
  ['despesas', 'Despesas líquidas', 'var(--chart-expense)'],
]

function ConnectedReports({ data }) {
  const current = localDay().slice(0, 7)
  const [from, setFrom] = useState(current.slice(0, 4) + '-01')
  const [through, setThrough] = useState(current)
  const rows = data.reports.filter(row => row.month >= from && row.month <= through).map(row => ({ ...row, id: row.month }))
  const last = rows.at(-1)
  const previous = rows.at(-2)
  const difference = previous?.despesas > 0 ? Math.round((last.despesas - previous.despesas) / previous.despesas * 100) : null
  const budgetRows = data.budgets.filter(row => row.month >= from && row.month <= through)
  const alerts = budgetRows.filter(row => row.status !== 'normal')
  const byCategory = new Map()
  for (const row of rows) {
    for (const item of row.categories) {
      const key = item.name.normalize('NFKC').toLocaleLowerCase('pt-BR')
      const category = byCategory.get(key) ?? { id: key, name: item.name, amount: 0n }
      category.amount += BigInt(item.amount)
      byCategory.set(key, category)
    }
  }
  const categories = [...byCategory.values()].sort((a, b) => a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0)

  return <div className="ledger-stack">
    <section className="panel detail-panel">
      <h2>Período da análise</h2>
      <div className="filters">
        <label>De<input type="month" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label>Até<input type="month" value={through} onChange={event => setThrough(event.target.value)} /></label>
      </div>
      <p>As despesas incluem compras parceladas e estornos no ciclo da fatura. Pagamentos da fatura e transferências ficam fora dos totais de receitas e despesas.</p>
      {from > through && <p role="alert">O mês inicial deve vir antes do mês final ou ser igual a ele.</p>}
    </section>
    {rows.length ? <>
      <section className="panel detail-panel">
        <h2>Receitas e despesas por mês</h2>
        {difference !== null && <p>As despesas líquidas de {last.month} {difference === 0 ? 'ficaram no mesmo patamar' : difference > 0 ? 'subiram ' + difference + '%' : 'caíram ' + Math.abs(difference) + '%'} em relação a {previous.month}, o mês anterior exibido.</p>}
        <Chart rows={rows} fields={cashSeries} />
        <Table label="Receitas e despesas por mês" rows={rows} columns={columns} />
      </section>
      {categories.length > 0 && <section className="panel detail-panel"><h2>Despesas por categoria</h2>
        <Table label="Despesas por categoria" rows={categories} columns={[
          { key: 'name', label: 'Categoria' }, { key: 'amount', label: 'Valor líquido', render: row => money(Number(row.amount)) },
        ]} />
      </section>}
      <section className="panel detail-panel"><h2>Evolução de saldos e patrimônio</h2>
        <p>O histórico parte dos saldos iniciais, usa as datas lançadas nas contas e acrescenta as avaliações manuais. Registros vinculados a contas ficam fora da soma patrimonial.</p>
        <Chart rows={rows} fields={[[ 'balance', 'Saldo', 'var(--chart-income)' ], [ 'netWorth', 'Patrimônio estimado', 'var(--chart-expense)' ]]} />
        <Table label="Evolução de saldos e patrimônio" rows={rows} columns={[
          { key: 'month', label: 'Mês' }, { key: 'balance', label: 'Saldo', render: row => money(row.balance) },
          { key: 'netWorth', label: 'Patrimônio estimado', render: row => money(row.netWorth) },
        ]} />
      </section>
    </> : <section className="panel detail-panel"><p>Nenhum registro no período escolhido.</p></section>}
    {budgetRows.length > 0 && <section className="panel detail-panel"><h2>Acompanhamento dos orçamentos</h2>
      {alerts.length > 0 && <p>{alerts.length} {alerts.length === 1 ? 'orçamento está' : 'orçamentos estão'} perto do limite, no limite ou acima dele.</p>}
      <Table label="Acompanhamento dos orçamentos" rows={budgetRows.map(row => ({ ...row, id: row._id }))} columns={[
        { key: 'month', label: 'Mês' }, { key: 'category', label: 'Categoria', render: row => row.category || 'Geral' },
        { key: 'limit', label: 'Planejado', render: row => money(row.limit) }, { key: 'spent', label: 'Realizado', render: row => money(row.spent) },
      ]} />
    </section>}
    {data.goals.length > 0 && <section className="panel detail-panel"><h2>Acompanhamento das metas</h2><p>Saldo atual de cada meta, considerando todos os aportes e retiradas.</p>
      <Table label="Acompanhamento das metas" rows={data.goals.map(row => ({ ...row, id: row._id }))} columns={[
        { key: 'name', label: 'Meta' }, { key: 'saved', label: 'Reservado', render: row => money(row.saved) },
        { key: 'target', label: 'Alvo', render: row => money(row.target) }, { key: 'remaining', label: 'Restante', render: row => money(row.remaining) },
      ]} />
    </section>}
  </div>
}

export default function Reports() {
  const { data } = useLedger()
  if (data) return <ConnectedReports data={data} />
  return <section className="panel detail-panel">
    <h2>Receitas e despesas por mês</h2>
    <p>Totais fictícios de julho a outubro. Transferências entre contas ficam fora desta comparação.</p>
    <Chart rows={history} fields={cashSeries} />
    <Table label="Totais mensais em reais" columns={columns} rows={history.map(row => ({ id: row.month, ...row }))} />
  </section>
}
