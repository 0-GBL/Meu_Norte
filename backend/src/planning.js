import { cents, day, id, label, object, RequestError } from './ledger.js'

export function monthInput(value) {
  if (typeof value !== 'string' || !/^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(value)) {
    throw new RequestError(400, 'Informe um mês válido.')
  }
  return value
}

export const categoryKey = value => value.normalize('NFKC').toLocaleLowerCase('pt-BR')

export function budgetInput(input) {
  object(input, ['month', 'category', 'limit'])
  const category = input.category === '' ? '' : label(input.category, 'uma categoria')
  return { month: monthInput(input.month), category, categoryKey: categoryKey(category), limit: cents(input.limit) }
}

export function spendingRecords(entries, cards) {
  return [
    ...entries.filter(row => row.type === 'expense').map(row => ({ month: row.date.slice(0, 7), category: row.category, amount: row.amount })),
    ...cards.flatMap(card => card.spending),
  ]
}

export function safeSum(total, value) {
  const sum = total + value
  if (!Number.isSafeInteger(sum)) throw new RequestError(409, 'O total excede o limite suportado.')
  return sum
}

export function budgetSummaries(budgets, spending) {
  const byMonth = new Map()
  for (const row of spending) {
    if (!byMonth.has(row.month)) byMonth.set(row.month, { total: 0, categories: new Map() })
    const month = byMonth.get(row.month)
    const key = categoryKey(row.category)
    month.total = safeSum(month.total, row.amount)
    month.categories.set(key, safeSum(month.categories.get(key) ?? 0, row.amount))
  }
  return budgets.map(budget => {
    const month = byMonth.get(budget.month)
    const spent = (budget.categoryKey ? month?.categories.get(budget.categoryKey) : month?.total) ?? 0
    const status = spent > budget.limit ? 'over' : spent === budget.limit ? 'full' :
      BigInt(spent) * 5n >= BigInt(budget.limit) * 4n ? 'near' : 'normal'
    return { ...budget, spent, remaining: safeSum(budget.limit, -spent), status }
  })
}

export function goalInput(input) {
  object(input, ['name', 'description', 'deadline', 'target', 'monthly', 'status'])
  const status = input.status ?? 'active'
  if (!['active', 'complete', 'archived'].includes(status)) throw new RequestError(400, 'Escolha a situação da meta.')
  return {
    name: label(input.name, 'um nome'), target: cents(input.target),
    monthly: input.monthly === undefined || input.monthly === 0 ? 0 : cents(input.monthly), status,
    ...(input.description !== undefined && { description: input.description === '' ? '' : label(input.description, 'uma descrição') }),
    ...(input.deadline !== undefined && { deadline: input.deadline === null ? null : day(input.deadline) }),
  }
}

export function goalEventInput(input) {
  object(input, ['amount', 'accountId', 'destinationId'])
  const amount = cents(input.amount, true)
  if (!amount) throw new RequestError(400, 'Informe um valor diferente de zero.')
  if (input.accountId === undefined && input.destinationId === undefined) return { amount }
  const accountId = id(input.accountId)
  const destinationId = id(input.destinationId)
  if (accountId === destinationId) throw new RequestError(400, 'Escolha duas contas diferentes para a transferência.')
  return { amount, accountId, destinationId }
}

export function validateGoalWithdrawal(events, event) {
  if (event.amount > 0) return
  const reserved = events.reduce((total, row) => {
    const matches = event.accountId
      ? (row.amount > 0 ? String(row.destinationId) : String(row.accountId)) === event.accountId
      : !row.accountId
    return matches ? safeSum(total, row.amount) : total
  }, 0)
  if (-event.amount > reserved) throw new RequestError(400, event.accountId
    ? 'A retirada excede o valor reservado nesta conta para a meta.'
    : 'A retirada excede o total de aportes informativos da meta.')
}

export function goalSummary(goal, events) {
  const saved = events.reduce((total, row) => safeSum(total, row.amount), 0)
  const remaining = Math.max(0, goal.target - saved)
  const months = goal.monthly > 0 && remaining > 0 ? Math.ceil(remaining / goal.monthly) : null
  return { ...goal, saved, remaining, months, completed: remaining === 0 || goal.status === 'complete', events }
}
