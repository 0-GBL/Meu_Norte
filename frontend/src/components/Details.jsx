import { useState } from 'react'
import { progress } from '../ledgerFormat.js'

export function RemoveRecord({ label, message, busy, onRemove }) {
  const [confirming, setConfirming] = useState(false)
  if (!confirming) return <button className="action-button" type="button" disabled={busy} onClick={() => setConfirming(true)}>{label}</button>
  return <div className="ledger-actions">
    <span>{message}</span>
    <button className="action-button" type="button" disabled={busy} onClick={onRemove}>Confirmar exclusão</button>
    <button className="action-button" type="button" disabled={busy} onClick={() => setConfirming(false)}>Cancelar</button>
  </div>
}

export function ProgressBar({ current, target, label }) {
  return <progress className="progress-bar" value={Math.max(0, Math.min(100, progress(current, target)))} max={100} aria-label={label} />
}

export function Table({ label, columns, rows, compact = false }) {
  if (!rows.length) return <p className="empty-state">Nenhum registro encontrado. Experimente alterar os filtros.</p>
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={label}>
    <table className={compact ? 'compact-table' : undefined} aria-label={label} role="table">
      <thead role="rowgroup"><tr role="row">{columns.map(column => <th key={column.key} scope="col" role="columnheader">{column.label}</th>)}</tr></thead>
      <tbody role="rowgroup">{rows.map(row => <tr key={row.id ?? row.name} role="row">{columns.map(column => <td key={column.key} role="cell">
        {compact && <span className="compact-table-label" aria-hidden="true">{column.label}</span>}
        <div>{column.render ? column.render(row) : row[column.key]}</div>
      </td>)}</tr>)}</tbody>
    </table>
  </div>
}
