import { safeSum, spendingRecords, categoryKey } from './planning.js'

export function reportSummary(entries, accounts, cards, assets, currentMonth) {
  const months = new Map()
  const get = month => {
    if (!months.has(month)) months.set(month, { month, receitas: 0, despesas: 0, cash: 0, categories: new Map() })
    return months.get(month)
  }
  get(currentMonth)
  for (const row of entries) {
    const month = get(row.date.slice(0, 7))
    if (row.type === 'income') month.receitas = safeSum(month.receitas, row.amount)
    if (row.type !== 'transfer') month.cash = safeSum(month.cash, row.type === 'income' ? row.amount : -row.amount)
  }
  for (const row of spendingRecords(entries, cards)) {
    const month = get(row.month)
    const key = categoryKey(row.category)
    month.despesas = safeSum(month.despesas, row.amount)
    const category = month.categories.get(key) ?? { name: row.category, amount: 0 }
    category.amount = safeSum(category.amount, row.amount)
    month.categories.set(key, category)
  }

  const assetChanges = []
  for (const asset of assets) {
    if (asset.accountId) continue
    let previous = 0
    for (const row of asset.valuations.slice().reverse()) {
      const value = asset.kind === 'debt' ? -row.value : row.value
      assetChanges.push({ month: row.date.slice(0, 7), change: value - previous })
      previous = value
    }
  }
  const changes = new Map()
  for (const row of assetChanges) {
    get(row.month)
    changes.set(row.month, safeSum(changes.get(row.month) ?? 0, row.change))
  }

  let balance = accounts.reduce((total, row) => safeSum(total, row.initialBalance), 0)
  let netAssets = 0
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map(row => {
    balance = safeSum(balance, row.cash)
    netAssets = safeSum(netAssets, changes.get(row.month) ?? 0)
    return {
      month: row.month, receitas: row.receitas, despesas: row.despesas, balance,
      netWorth: safeSum(balance, netAssets),
      categories: [...row.categories.values()].sort((a, b) => b.amount - a.amount),
    }
  })
}
