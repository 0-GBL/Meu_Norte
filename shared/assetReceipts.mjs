export const saleKey = sale => sale?.operationId ?? `${sale?.date}:${sale?.amount}`

export function receiptState(asset, entries, today) {
  const sale = asset.sale
  if (!sale?.date) return null
  if (sale.cancelledAt) return { status: 'cancelled', label: 'Cancelado' }
  const entry = sale.entryId && entries.find(row => String(row._id) === String(sale.entryId))
  const valid = entry && !entry.cancelledAt && entry.type === 'income' && entry.amount === sale.amount && entry.date >= sale.date && entry.date <= today
  if (valid) return { status: 'received', label: 'Recebido', entry }
  if (sale.entryId) return { status: 'pending', label: 'Pendente', inconsistent: true }
  if (!sale.expectedOn) return { status: 'pending', label: 'Pendente' }
  return sale.expectedOn < today ? { status: 'overdue', label: 'Atrasado' } : { status: 'scheduled', label: 'Agendado' }
}
