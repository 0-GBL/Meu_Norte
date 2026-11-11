import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Banknote, ChartNoAxesCombined, CircleDollarSign, Landmark, SlidersHorizontal, Wallet } from 'lucide-react'
import { DistributionChart, FlowChart, TrendChart, monthLabel } from '../components/ReportCharts.jsx'
import { Table } from '../components/Details.jsx'
import { DateField } from '../components/FinancialFields.jsx'
import { assetKinds } from './RecordsPages.jsx'
import { useLedger } from '../LedgerContext.jsx'
import { formatDate, localDay, money } from '../ledgerFormat.js'
import './Reports.css'

const presets = [['current', 'Mês atual'], ['previous', 'Mês anterior'], ['3', 'Últimos 3 meses'],
  ['6', 'Últimos 6 meses'], ['12', 'Últimos 12 meses'], ['year', 'Ano atual'], ['custom', 'Personalizado']]
const types = { income: 'Receita', expense: 'Despesa em conta', transfer: 'Transferência', cardPurchase: 'Compras e ajustes de cartão', cardPayment: 'Pagamento de fatura', assetPurchase: 'Compra patrimonial', assetSale: 'Venda patrimonial' }
const metrics = [
  ['income', 'Receitas', ArrowUp, 'Entradas reconhecidas no período.'],
  ['expenses', 'Despesas por competência', ArrowDown, 'Despesas em conta e gastos líquidos de cartão.'],
  ['result', 'Resultado por competência', ChartNoAxesCombined, 'Receitas menos despesas por competência.'],
  ['cash', 'Variação de caixa', ArrowUpDown, 'Movimentos que alteram o saldo das contas.'],
]
const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, signDisplay: 'exceptZero' })
const signedMoney = value => (value > 0 ? '+' : '') + money(value)
const column = (key, label, format = money) => ({ key, label, render: row => format(row[key]) })
const flowColumns = [{ key: 'label', label: 'Período' }, column('receitas', 'Receitas'), column('despesas', 'Despesas líquidas')]

function period(preset) {
  const today = localDay()
  if (preset === 'year') return { from: today.slice(0, 4) + '-01-01', through: today }
  const date = new Date(today.slice(0, 7) + '-01T00:00:00Z')
  if (preset === 'previous') {
    const through = new Date(date)
    through.setUTCDate(0)
    date.setUTCMonth(date.getUTCMonth() - 1)
    return { from: date.toISOString().slice(0, 10), through: through.toISOString().slice(0, 10) }
  }
  date.setUTCMonth(date.getUTCMonth() - (Number(preset) || 1) + 1)
  return { from: date.toISOString().slice(0, 10), through: today }
}

function Metric({ label, value, Icon, description, comparison, expense }) {
  const diff = comparison?.difference
  const tone = !diff ? '' : (expense ? diff < 0 : diff > 0) ? 'report-positive' : 'report-negative'
  return <article className="panel report-metric">
    <h3><Icon size={17} aria-hidden="true" />{label}</h3>
    <strong className={value < 0 ? 'report-negative' : ''}>{money(value)}</strong>
    {comparison && <div className={'report-change ' + tone}>
      {diff !== 0 && (diff > 0 ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />)}
      <span>{diff === 0 ? 'Sem variação' : signedMoney(diff)}{comparison.percent == null ? ' · base anterior zero' : ' · ' + percent.format(comparison.percent) + '%'}</span>
    </div>}
    <p>{description}</p>
  </article>
}

function Position({ position }) {
  return <section className="report-section" aria-labelledby="report-position">
    <div className="report-section-title"><h2 id="report-position">Resumo patrimonial</h2><span className="report-pill">Posição em {formatDate(position.date)} · Todas as contas</span></div>
    <p>Consolidação de todo o espaço financeiro. Os filtros de movimentação e categoria patrimonial não alteram estes cartões.</p>
    <div className="report-metrics">
      <Metric label="Saldo das contas" Icon={Wallet} value={position.balance} description="Inclui contas arquivadas e saldos negativos." />
      <Metric label="Bens avaliados" Icon={Landmark} value={position.evaluatedAssets} description="Últimas avaliações dos bens ativos fora das contas." />
      <Metric label="Obrigações financeiras" Icon={Banknote} value={position.obligations} description={'Dívidas avaliadas: ' + money(position.debts) + ' · Cartões: ' + money(position.cardDebt)} />
      <Metric label="Patrimônio líquido estimado" Icon={CircleDollarSign} value={position.netWorth} description="Saldo das contas + bens avaliados − obrigações não incluídas nas contas." />
    </div>
    {(position.pendingAssets > 0 || position.pendingDebts > 0) && <p className="report-note">
      Avaliações pendentes: {position.pendingAssets} de bens e {position.pendingDebts} de dívidas. Esses valores não entram na estimativa.
    </p>}
  </section>
}

function DataDetails({ rows, label, columns }) {
  return <details className="report-data"><summary>Ver dados em tabela</summary>
    <Table compact label={label} rows={rows} columns={columns} />
  </details>
}

function TrendDetails({ rows, name, field }) {
  return <DataDetails label={name} rows={rows.map(row => ({ ...row, id: row.date }))}
    columns={[column('date', 'Data', formatDate), column(field, name)]} />
}

function Valuations({ series }) {
  const [asset, setAsset] = useState('')
  const selected = series.find(row => row.id === asset) ?? series[0]
  return <section className="panel detail-panel report-panel">
    <h2>Evolução do valor estimado dos bens</h2>
    <p>Avaliações registradas de bens fora das contas. A linha liga somente as datas com registro.</p>
    {!selected ? <p className="report-empty">Nenhuma avaliação foi registrada no período e na categoria selecionada.</p> : <>
      <label>Bem avaliado<select value={selected.id} onChange={event => setAsset(event.target.value)}>
        {series.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>
      <TrendChart rows={selected.points} field="value" name="Valor estimado" cost={selected.acquired} />
      {selected.points.length < 2 ? <p>Há apenas uma avaliação. Ainda não é possível comparar a evolução.</p> :
        <p>Variação no intervalo: {signedMoney(selected.points.at(-1).value - selected.points[0].value)}.</p>}
      {selected.acquired != null && <p>Linha tracejada: custo de aquisição de {money(selected.acquired)}.</p>}
      <TrendDetails rows={selected.points} name="Valor estimado" field="value" />
    </>}
  </section>
}

function Filters({ data, preset, setPreset, filters, setFilters }) {
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 760px)').matches)
  const categories = [...new Set([...data.entries.map(row => row.category), ...data.cards.flatMap(card => card.spending.map(row => row.category))].filter(Boolean))].sort()
  const fields = [
    ['account', 'Conta', 'Todas', data.accounts.map(row => [row._id, row.name + (row.deletedAt ? ' (excluída)' : row.archived ? ' (arquivada)' : '')])],
    ['category', 'Categoria de movimentação', 'Todas', categories.map(value => [value, value])],
    ['type', 'Tipo de movimentação', 'Todos', Object.entries(types)],
    ['assetKind', 'Categoria patrimonial', 'Todas', Object.entries(assetKinds).filter(([key]) => key !== 'debt')],
  ]
  const active = fields.filter(([key]) => filters[key])
  return <section className="panel detail-panel">
    <div className="report-section-title">
      <button type="button" className="report-filter-toggle" aria-expanded={open} aria-controls="report-filter-fields" onClick={() => setOpen(!open)}>
        <SlidersHorizontal size={18} aria-hidden="true" /> Período e filtros {active.length > 0 && <span className="report-pill">{active.length} em uso</span>}
      </button>
      <button type="button" className="report-link" onClick={() => { setPreset('current'); setFilters(period('current')) }}>Limpar filtros</button>
    </div>
    <div id="report-filter-fields" hidden={!open}>
      <div className="filters report-filter-grid">
        <label>Período<select value={preset} onChange={event => {
          const value = event.target.value
          setPreset(value)
          if (value !== 'custom') setFilters(previous => ({ ...previous, ...period(value) }))
        }}>{presets.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {fields.map(([key, label, all, options]) => <label key={key}>{label}<select value={filters[key] ?? ''}
          onChange={event => setFilters({ ...filters, [key]: event.target.value })}>
          <option value="">{all}</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select></label>)}
      </div>
      {preset === 'custom' && <form className="ledger-form report-dates" onSubmit={event => {
        event.preventDefault()
        const fields = new FormData(event.currentTarget)
        setFilters({ ...filters, from: fields.get('from'), through: fields.get('through') })
      }}>
        <DateField name="from" label="De" defaultValue={filters.from} required />
        <DateField name="through" label="Até" defaultValue={filters.through} required />
        <button className="action-button">Aplicar período</button>
      </form>}
    </div>
    {active.length > 0 && <ul className="report-active-filters" aria-label="Filtros em uso">
      {active.map(([key, label, , options]) => <li className="report-pill" key={key}>
        {label}: {options.find(([value]) => value === filters[key])?.[1] ?? filters[key]}
      </li>)}
    </ul>}
  </section>
}

function Complement({ report, data, filters }) {
  const budgets = data.budgets.filter(row => row.month >= filters.from.slice(0, 7) && row.month <= filters.through.slice(0, 7))
  const alerts = budgets.filter(row => row.status !== 'normal')
  return <details className="panel detail-panel report-method">
    <summary>Informações complementares e regras de cálculo</summary>
    <p>Transferências próprias não são receitas nem despesas. Pagamentos de fatura reduzem o caixa sem repetir a despesa da compra. Transferências afetam a variação de caixa apenas quando uma conta é selecionada.</p>
    <p>Parcelas, estornos e encargos seguem o mês da fatura, inclusive em intervalos parciais. O período anterior tem a mesma duração em dias; recortes parciais podem compartilhar um mês de fatura. Compras de cartão não pertencem ao filtro de conta. Datas futuras podem ter valores por competência; o caixa considera lançamentos até hoje.</p>
    <p>O saldo histórico usa o saldo inicial cadastrado e os lançamentos válidos por data. A data efetiva do saldo inicial e mudanças históricas de vínculo patrimonial não são registradas. Contas excluídas com saldo zerado preservam seu histórico.</p>
    <p>As obrigações incluem parcelas futuras de compras registradas e abatimentos de pagamentos e estornos. Saldos negativos e bens ou dívidas vinculados a contas entram uma única vez pelo saldo da conta. Obrigações não registradas ficam fora da estimativa.</p>
    {report.sales.length > 0 && <Table compact label="Bens vendidos no período" rows={report.sales} columns={[
      { key: 'name', label: 'Bem' }, column('date', 'Data', formatDate), column('amount', 'Valor recebido'),
      { key: 'result', label: 'Resultado sobre custo', render: row => row.cost == null ? 'Custo desconhecido' : money(row.amount - row.cost) },
    ]} />}
    {budgets.length > 0 && <><h2>Acompanhamento dos orçamentos</h2>
      {alerts.length > 0 && <p>{alerts.length} {alerts.length === 1 ? 'orçamento está' : 'orçamentos estão'} perto do limite, no limite ou acima dele.</p>}
      <Table compact label="Acompanhamento dos orçamentos" rows={budgets.map(row => ({ ...row, id: row._id }))} columns={[
        column('month', 'Mês', monthLabel), column('category', 'Categoria', value => value || 'Geral'), column('limit', 'Planejado'), column('spent', 'Realizado'),
      ]} /></>}
    {data.goals.length > 0 && <><h2>Acompanhamento das metas</h2><p>Saldo atual de cada meta.</p>
      <Table compact label="Acompanhamento das metas" rows={data.goals.map(row => ({ ...row, id: row._id }))} columns={[
        { key: 'name', label: 'Meta' }, column('saved', 'Reservado'), column('target', 'Alvo'), column('remaining', 'Restante'),
      ]} /></>}
  </details>
}

export default function Reports() {
  const { data, readLedger } = useLedger()
  const [preset, setPreset] = useState('current')
  const [filters, setFilters] = useState(() => period('current'))
  const [request, setRequest] = useState(null)
  const [retry, setRetry] = useState(0)
  const [mode, setMode] = useState('monthly')
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString()
  const key = JSON.stringify([query, retry])
  useEffect(() => {
    const controller = new AbortController()
    readLedger('/reports?' + query, controller.signal).then(report => {
      if (!controller.signal.aborted) setRequest({ key, data, report })
    }).catch(error => {
      if (!controller.signal.aborted) setRequest({ key, data, error: error.message })
    })
    return () => controller.abort()
  }, [readLedger, query, key, data])
  const { report, error } = request?.key === key && request.data === data ? request : {}
  const balances = report?.rows.filter(row => row.date && row.balance != null) ?? []
  const flowRows = report && (mode === 'monthly'
    ? report.rows.map(row => ({ ...row, label: monthLabel(row.month) }))
    : [{ label: 'Anterior', receitas: report.previous.income, despesas: report.previous.expenses },
      { label: 'Selecionado', receitas: report.income, despesas: report.expenses }])
  return <div className="reports-page">
    <header className="report-header">
      <span className="report-eyebrow">MEU NORTE / VISÃO FINANCEIRA</span>
      <h1>Relatórios</h1>
      <p>Acompanhe suas movimentações, a evolução dos saldos e a posição do seu patrimônio.</p>
      <span className="report-period">{formatDate(filters.from)} a {formatDate(filters.through)}</span>
    </header>
    <Filters {...{ data, preset, setPreset, filters, setFilters }} />
    {error ? <div className="panel detail-panel" role="alert"><h2>Não foi possível carregar o relatório</h2><p>{error}</p>
      <button className="action-button" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></div>
      : !report && <div className="panel detail-panel report-loading" role="status">Carregando indicadores…</div>}
    {report && <>
      <section className="report-section" aria-labelledby="report-flow">
        <div className="report-section-title"><h2 id="report-flow">Indicadores do período</h2>
          <span className="report-pill">Comparação: {formatDate(report.previous.from)} a {formatDate(report.previous.through)}</span></div>
        <div className="report-metrics">
          {metrics.map(([key, label, Icon, description]) => <Metric key={key} label={label} Icon={Icon}
            value={report.comparison[key].value} comparison={report.comparison[key]} expense={key === 'expenses'} description={description} />)}
        </div>
      </section>
      <Position position={report.position} />
      <section className="panel detail-panel report-panel">
        <div className="report-section-title"><h2>Receitas e despesas</h2>
          <label className="report-view">Exibição<select value={mode} onChange={event => setMode(event.target.value)}>
            <option value="monthly">Evolução mensal</option><option value="comparison">Comparar períodos</option>
          </select></label></div>
        <p>Receitas e despesas líquidas por competência.</p>
        {flowRows.some(row => row.receitas || row.despesas) ? <>
          <FlowChart rows={flowRows} />
          <DataDetails label="Receitas e despesas" rows={flowRows.map(row => ({ ...row, id: row.label }))} columns={flowColumns} />
        </> : <p className="report-empty">Sem receitas ou despesas para os filtros escolhidos.</p>}
      </section>
      <div className="report-chart-grid">
        <section className="panel detail-panel report-panel"><h2>Despesas por categoria</h2>
          <DistributionChart rows={report.categories} group empty="Não há despesas por categoria para os filtros escolhidos." />
        </section>
        <section className="panel detail-panel report-panel"><h2>Evolução dos saldos</h2>
          <p>Saldo inicial e lançamentos até cada data. Apenas o filtro de conta altera este saldo.</p>
          {data.accounts.length > 0 && balances.length > 0 ? <><TrendChart rows={balances} field="balance" name="Saldo das contas" zero />
            <TrendDetails rows={balances} name="Saldo das contas" field="balance" /></> :
            <p className="report-empty">Ainda não há saldos de contas neste intervalo.</p>}
        </section>
      </div>
      <div className="report-chart-grid">
        <Valuations series={report.valuationSeries} />
        <section className="panel detail-panel report-panel"><h2>Bens ativos por categoria</h2>
          <p>Posição em {formatDate(report.position.date)} · {assetKinds[filters.assetKind] ?? 'Todas as categorias patrimoniais'}. Inclui bens avaliados fora das contas.</p>
          <DistributionChart rows={report.assetCategories} empty="Não há bens ativos avaliados neste recorte." />
        </section>
      </div>
      <Complement {...{ report, data, filters }} />
    </>}
  </div>
}
