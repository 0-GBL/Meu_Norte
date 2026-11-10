import { progress } from '../demo/finance.js'

export function ProgressBar({ current, target, label }) {
  return <progress className="progress-bar" value={Math.max(0, Math.min(100, progress(current, target)))} max={100} aria-label={label} />
}

export function Table({ label, columns, rows }) {
  if (!rows.length) return <p className="empty-state">Nenhum registro encontrado. Experimente alterar os filtros.</p>
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={label}>
    <table aria-label={label}><thead><tr>{columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id ?? row.name}>{columns.map(column => <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>)}</tr>)}</tbody>
    </table>
  </div>
}
