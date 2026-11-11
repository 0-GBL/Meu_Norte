import { safeSum, spendingRecords, categoryKey } from './planning.js'

const activeAt = (asset, date) => !asset.deletedAt && (!asset.acquiredOn || asset.acquiredOn <= date) &&
  (!asset.endedOn || asset.endedOn > date)
const latestAt = (asset, date) => asset.valuations.find(row => row.date <= date)?.value

export function portfolioPosition({ entries, accounts, cards, assets, date }) {
  const accountBalance = accounts.reduce((sum, row) => safeSum(sum, row.initialBalance), 0)
  const balance = entries.reduce((sum, row) => row.cancelledAt || row.date > date || row.type === 'transfer' ? sum :
    safeSum(sum, row.type === 'income' ? row.amount : -row.amount), accountBalance)
  let evaluatedAssets = 0, debts = 0, pendingAssets = 0, pendingDebts = 0
  for (const asset of assets) {
    if (!activeAt(asset, date) || asset.accountId) continue
    const value = latestAt(asset, date)
    if (asset.kind === 'debt') {
      if (value == null) pendingDebts++
      else debts = safeSum(debts, value)
    } else if (value == null) pendingAssets++
    else evaluatedAssets = safeSum(evaluatedAssets, value)
  }
  const cardDebt = cards.reduce((sum, card) => safeSum(sum, card.used), 0)
  const obligations = safeSum(debts, cardDebt)
  return { date, balance, evaluatedAssets, obligations, debts, cardDebt, pendingAssets, pendingDebts,
    netWorth: safeSum(safeSum(balance, evaluatedAssets), -obligations) }
}

export function reportComparison(current, previous) {
  const result = row => safeSum(row.income, -row.expenses)
  return Object.fromEntries(Object.entries({ income: [current.income, previous.income],
    expenses: [current.expenses, previous.expenses], result: [result(current), result(previous)],
    cash: [current.cash, previous.cash] }).map(([key, [value, prior]]) => {
    const difference = safeSum(value, -prior)
    return [key, { value, difference, percent: prior === 0 ? null : difference / Math.abs(prior) * 100 }]
  }))
}

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
      if (asset.endedOn && row.date >= asset.endedOn) continue
      const value = asset.kind === 'debt' ? -row.value : row.value
      assetChanges.push({ month: row.date.slice(0, 7), change: value - previous })
      previous = value
    }
    if (asset.endedOn) assetChanges.push({ month: asset.endedOn.slice(0, 7), change: -previous })
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

export function periodReport({ entries, accounts, cards, assets, from, through, accountId, category, type, assetKind, currentDay }) {
  const selected = row => !accountId || [row.accountId, row.destinationId].some(value => String(value) === accountId)
  const categoryMatches = value => !category || categoryKey(value ?? '') === categoryKey(category)
  const typeMatches = value => !type || value === type
  const categories = new Map()
  const assetsByCategory = new Map()
  const matchingAssets = assets.filter(row => row.kind !== 'debt' && !row.accountId && (!assetKind || row.kind === assetKind))
  let balance = accounts.filter(row => !accountId || String(row._id) === accountId).reduce((sum, row) => safeSum(sum, row.initialBalance), 0)
  const rows = []
  const receipts = []
  const start = new Date(from + 'T00:00:00Z')
  start.setUTCDate(1)
  const months = []
  for (const cursor = start; cursor.toISOString().slice(0, 7) <= through.slice(0, 7); cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    months.push(cursor.toISOString().slice(0, 7))
  }
  const byMonth = new Map(months.map(month => [month, { month, receitas: 0, despesas: 0, assetIncome: 0, cash: 0, balanceDelta: 0 }]))
  for (const row of entries) {
    if (row.cancelledAt || !selected(row)) continue
    const delta = row.type === 'transfer'
      ? !accountId ? 0 : String(row.destinationId) === accountId ? row.amount : -row.amount
      : row.type === 'income' ? row.amount : -row.amount
    if (row.date < from && row.date <= currentDay) balance = safeSum(balance, delta)
    if (row.date < from || row.date > through) continue
    const month = byMonth.get(row.date.slice(0, 7))
    if (row.date <= currentDay) month.balanceDelta = safeSum(month.balanceDelta, delta)
    const assetType = row.assetOperation === 'purchase' ? 'assetPurchase' : row.assetOperation === 'sale' ? 'assetSale' : null
    if ((!typeMatches(row.type) && !typeMatches(assetType)) || !categoryMatches(row.category)) continue
    if (row.date <= currentDay) month.cash = safeSum(month.cash, delta)
    if (row.type === 'income' && assetType === 'assetSale') {
      if (row.date <= currentDay) {
        month.assetIncome = safeSum(month.assetIncome, row.amount)
        receipts.push({ id: row._id, assetId: row.assetId, date: row.date, amount: row.amount, accountId: row.accountId,
          source: row.assetReceiptSource ?? 'original' })
      }
    } else if (row.type === 'income') month.receitas = safeSum(month.receitas, row.amount)
    if (row.type === 'expense') recordExpense(month, row.category, row.amount)
  }
  if (!accountId && typeMatches('cardPurchase')) {
    for (const item of cards.flatMap(card => card.spending)) {
      const month = byMonth.get(item.month)
      if (month && categoryMatches(item.category)) recordExpense(month, item.category, item.amount)
    }
  }

  function recordExpense(month, name, amount) {
    month.despesas = safeSum(month.despesas, amount)
    const key = categoryKey(name)
    const row = categories.get(key) ?? { name, amount: 0 }
    row.amount = safeSum(row.amount, amount)
    categories.set(key, row)
  }

  for (const month of months) {
    const row = byMonth.get(month)
    const end = new Date(month + '-01T00:00:00Z')
    end.setUTCMonth(end.getUTCMonth() + 1, 0)
    const cutoff = [end.toISOString().slice(0, 10), through, currentDay].sort()[0]
    let estimated = null
    if (cutoff >= month + '-01') for (const asset of matchingAssets) {
      if (asset.deletedAt || asset.acquiredOn > cutoff) continue
      const value = latestAt(asset, cutoff)
      if (value == null) continue
      if (asset.endedOn && asset.endedOn <= cutoff) { estimated ??= 0; continue }
      estimated = safeSum(estimated ?? 0, value)
    }
    balance = safeSum(balance, row.balanceDelta)
    const { balanceDelta, ...visible } = row
    const hasPosition = cutoff >= from && cutoff >= month + '-01'
    rows.push({ ...visible, date: hasPosition ? cutoff : null, balance: hasPosition ? balance : null, estimated })
  }
  const referenceDate = through < currentDay ? through : currentDay
  for (const asset of matchingAssets) {
    const value = latestAt(asset, referenceDate)
    if (activeAt(asset, referenceDate) && value != null) {
      assetsByCategory.set(asset.kind, safeSum(assetsByCategory.get(asset.kind) ?? 0, value))
    }
  }
  const valuationSeries = matchingAssets.filter(asset => !asset.deletedAt).flatMap(asset => {
    const byDate = new Map()
    for (const row of asset.valuations) {
      if (row.date >= from && row.date <= referenceDate && activeAt(asset, row.date) && !byDate.has(row.date)) {
        byDate.set(row.date, { date: row.date, value: row.value })
      }
    }
    return byDate.size ? [{ id: asset._id, name: asset.name, acquired: asset.purchase?.amount ?? asset.acquired ?? null,
      points: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) }] : []
  })
  return {
    rows, receipts, valuationSeries, categories: [...categories.values()], assetCategories: [...assetsByCategory].map(([name, amount]) => ({ name, amount })),
    sales: assets.filter(row => {
      if (row.deletedAt || !row.sale || row.sale.cancelledAt || row.sale.date < from || row.sale.date > through || (assetKind && row.kind !== assetKind)) return false
      if (type && !['assetSale', 'income'].includes(type)) return false
      // Informative operations have no account/category; financial filters must match the linked receipt.
      if (accountId || category || type === 'income') return entries.some(entry =>
        !entry.cancelledAt && String(entry._id) === String(row.sale.entryId) && selected(entry) && categoryMatches(entry.category))
      return true
    })
      .map(row => ({ id: row._id, name: row.name, ...row.sale })),
    ...rows.reduce((totals, row) => ({
      income: safeSum(totals.income, row.receitas), expenses: safeSum(totals.expenses, row.despesas), cash: safeSum(totals.cash, row.cash),
      assetIncome: safeSum(totals.assetIncome, row.assetIncome),
    }), { income: 0, expenses: 0, cash: 0, assetIncome: 0 }),
  }
}
