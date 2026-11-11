import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDate, money } from '../ledgerFormat.js'
import { distribution } from '../reportFormat.js'

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL', maximumFractionDigits: 1 })
const thousands = value => value === 0 ? '0' : compact.format(value / 100)
export const monthLabel = value => value.split('-').reverse().join('/')
const tick = { fill: 'var(--muted)', fontSize: 11 }
const colors = ['#55bb9c', '#6498ce', '#b391cf', '#d5a666', '#60b6c9', '#c88299']
const moneyAxis = { width: 64, tickFormatter: thousands, tick, axisLine: false, tickLine: false }
const timeLabel = value => formatDate(new Date(value).toISOString().slice(0, 10))

function ChartTooltip({ active, payload, label, formatLabel = value => value }) {
  if (!active || !payload?.length) return null
  return <div className="report-tooltip"><strong>{label != null ? formatLabel(label) : payload[0].name}</strong>
    {payload.map(row => <div key={row.dataKey}>{label != null && row.name + ': '}{money(row.value)}</div>)}
  </div>
}

export function FlowChart({ rows }) {
  return <div className={rows.length === 1 ? 'report-chart report-chart-single' : 'report-chart'} aria-hidden="true"><ResponsiveContainer width="100%" height="100%" minWidth={0}>
    <BarChart data={rows} accessibilityLayer={false} barGap={5} maxBarSize={42} margin={{ top: 10, right: 12 }}>
      <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" />
      <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} minTickGap={16} />
      <YAxis {...moneyAxis} />
      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--line)', opacity: 0.4 }} />
      <Legend />
      <Bar dataKey="receitas" name="Receitas" fill="var(--chart-income)" radius={[5, 5, 0, 0]} isAnimationActive={false} />
      <Bar dataKey="despesas" name="Despesas líquidas" fill="var(--chart-expense)" radius={[5, 5, 0, 0]} isAnimationActive={false} />
      <ReferenceLine y={0} stroke="var(--muted)" />
    </BarChart>
  </ResponsiveContainer></div>
}

export function TrendChart({ rows, field, name, zero = false, cost = null }) {
  const dated = rows.map(row => ({ ...row, time: Date.parse(row.date) }))
  const ticks = dated.length <= 6 ? dated.map(row => row.time) : undefined
  return <div className="report-chart report-chart-secondary" aria-hidden="true"><ResponsiveContainer width="100%" height="100%" minWidth={0}>
    <LineChart data={dated} accessibilityLayer={false} margin={{ top: 12, right: 18 }}>
      <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" />
      <XAxis dataKey="time" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={ticks} tickFormatter={timeLabel}
        tick={tick} tickLine={false} axisLine={false} minTickGap={22} padding={{ left: 10, right: 10 }} />
      <YAxis {...moneyAxis} />
      <Tooltip content={<ChartTooltip formatLabel={timeLabel} />} />
      {zero && <ReferenceLine y={0} ifOverflow="extendDomain" stroke="var(--muted)" strokeDasharray="5 4" />}
      {cost != null && <ReferenceLine y={cost} ifOverflow="extendDomain" stroke="var(--muted)" strokeDasharray="5 4" />}
      <Line type="linear" dataKey={field} name={name} stroke="var(--chart-expense)" strokeWidth={2}
        isAnimationActive={false} activeDot={{ r: 5 }} dot={({ cx, cy, payload, key }) =>
          <circle key={key ?? payload.date} cx={cx} cy={cy} r={3.5} fill={payload[field] < 0 ? 'var(--report-negative)' : 'var(--chart-income)'} />} />
    </LineChart>
  </ResponsiveContainer></div>
}

const percent = value => value.toLocaleString('pt-BR', { style: 'percent', maximumFractionDigits: 1 })
function colorIndex(name) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % colors.length
}

export function DistributionChart({ rows, empty, group = false }) {
  const [active, setActive] = useState(null)
  const { slices, adjustments, total } = distribution(rows, group)
  const used = new Set()
  const palette = new Map([...slices].sort((a, b) => a.key.localeCompare(b.key)).map(({ key }) => {
    let index = colorIndex(key)
    while (used.size < colors.length && used.has(index)) index = (index + 1) % colors.length
    used.add(index)
    return [key, colors[index]]
  }))
  if (!slices.length && !adjustments.length) return <p className="report-empty">{empty}</p>
  return <div className="report-distribution">
    {slices.length > 1 && <div className="report-donut" aria-hidden="true"><ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <PieChart accessibilityLayer={false}><Pie data={slices} dataKey="amount" nameKey="name" innerRadius="56%" outerRadius="83%"
        paddingAngle={2} stroke="none" isAnimationActive={false}
        onMouseEnter={(_, index) => setActive(slices[index].key)} onMouseLeave={() => setActive(null)}
        onClick={(_, index) => setActive(slices[index].key)}>
        {slices.map(row => <Cell key={row.key} fill={palette.get(row.key)} opacity={active && active !== row.key ? 0.35 : 1} />)}
      </Pie><Tooltip content={<ChartTooltip />} /></PieChart>
    </ResponsiveContainer></div>}
    <ul className="report-legend">
      {slices.map(row => <li key={row.key} onMouseEnter={() => setActive(row.key)} onMouseLeave={() => setActive(null)}>
        {row.children ? <details><summary><span><i style={{ background: palette.get(row.key) }} />{row.name} · {percent(row.amount / total)}</span><strong>{money(row.amount)}</strong></summary>
          <ul>{row.children.map(child => <li key={child.name}>{child.name} <strong>{money(child.amount)}</strong></li>)}</ul>
        </details> : <div className="report-legend-row"><span><i style={{ background: palette.get(row.key) }} />{row.name} · {percent(row.amount / total)}</span><strong>{money(row.amount)}</strong></div>}
        {slices.length === 1 && <div className="report-share" style={{ background: palette.get(row.key) }} />}
      </li>)}
      {adjustments.map(row => <li key={row.name} className="report-legend-row"><span>{row.name}</span><strong>{money(row.amount)}</strong></li>)}
    </ul>
    {adjustments.length > 0 && group && <p>Percentuais sobre as categorias com despesa líquida positiva. Créditos e estornos líquidos aparecem na lista.</p>}
  </div>
}
