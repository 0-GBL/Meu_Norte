import { MAX_MONEY_CENTS, validCents, validDate } from '../../shared/financialRules.mjs'

export class RequestError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function invalid(message) {
  throw new RequestError(400, message)
}

export function object(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some(key => !fields.includes(key))) invalid('Confira os campos informados.')
}

export function label(value, field) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) invalid('Informe ' + field + ' com até 120 caracteres.')
  return value.trim()
}

export function cents(value, allowNegative = false) {
  if (!validCents(value, { negative: allowNegative, zero: allowNegative })) {
    const maximum = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(MAX_MONEY_CENTS / 100)
    invalid('Informe um valor ' + (allowNegative ? 'válido' : 'positivo') + ' em centavos, até ' + maximum + '.')
  }
  return value
}

export function id(value) {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) invalid('Identificador inválido.')
  return value.toLowerCase()
}

export function day(value) {
  if (!validDate(value)) invalid('Informe uma data válida.')
  return value
}

export function accountInput(input, editing = false) {
  object(input, editing ? ['name', 'kind', 'archived'] : ['name', 'kind', 'initialBalance'])
  if (editing && typeof input.archived !== 'boolean') invalid('Informe a situação da conta.')
  return {
    name: label(input.name, 'um nome'),
    kind: label(input.kind, 'o tipo da conta'),
    ...(editing ? { archived: input.archived } : { initialBalance: cents(input.initialBalance, true) }),
  }
}

export function entryInput(input) {
  object(input, ['type', 'description', 'amount', 'date', 'accountId', 'destinationId', 'category', 'expenseKind'])
  const { type } = input
  if (!['income', 'expense', 'transfer'].includes(type)) invalid('Escolha um tipo de movimentação.')
  const entry = {
    type,
    description: label(input.description, 'uma descrição'),
    amount: cents(input.amount),
    date: day(input.date),
    accountId: id(input.accountId),
  }
  if (type === 'transfer') {
    entry.destinationId = id(input.destinationId)
    if (entry.destinationId === entry.accountId) invalid('Escolha duas contas diferentes para a transferência.')
  } else {
    entry.category = label(input.category, 'uma categoria')
  }
  if (type === 'expense') {
    if (!['fixed', 'variable'].includes(input.expenseKind)) invalid('Classifique a despesa como fixa ou variável.')
    entry.expenseKind = input.expenseKind
  }
  return entry
}

export function accountBalances(accounts, entries) {
  const balances = new Map(accounts.map(account => [String(account._id), BigInt(account.initialBalance)]))
  for (const entry of entries) {
    const origin = String(entry.accountId)
    const amount = BigInt(entry.amount)
    balances.set(origin, balances.get(origin) + (entry.type === 'income' ? amount : -amount))
    if (entry.type === 'transfer') {
      const destination = String(entry.destinationId)
      balances.set(destination, balances.get(destination) + amount)
    }
  }
  const safeNumber = value => {
    const result = Number(value)
    if (!Number.isSafeInteger(result)) throw new RequestError(409, 'O saldo excede o limite suportado.')
    return result
  }
  return {
    accounts: accounts.map(account => ({ ...account, balance: safeNumber(balances.get(String(account._id))) })),
    total: safeNumber([...balances.values()].reduce((total, balance) => total + balance, 0n)),
  }
}
