export function distribution(rows, group) {
  const positive = rows.filter(row => row.amount > 0).sort((a, b) => b.amount - a.amount)
  const total = positive.reduce((sum, row) => sum + row.amount, 0)
  const small = group ? positive.filter((row, index) => index >= 5 || (index > 0 && row.amount / total < 0.04)) : []
  const slices = positive.filter(row => !small.includes(row)).map(row => ({ ...row, key: 'category:' + row.name }))
  if (small.length) slices.push({ key: 'group', name: 'Outros', amount: small.reduce((sum, row) => sum + row.amount, 0), children: small })
  return { slices, total, adjustments: rows.filter(row => row.amount <= 0) }
}
