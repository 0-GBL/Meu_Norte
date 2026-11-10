import { cents, day, id, label, object, RequestError } from './ledger.js'

export const CARD_PAYMENT = 'cardPayment'

function safeAmount(value) {
  if (!Number.isSafeInteger(value)) throw new RequestError(409, 'O total do cartão excede o limite suportado.')
  return value
}

export function today() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

function integer(value, max, message) {
  if (!Number.isInteger(value) || value < 1 || value > max) throw new RequestError(400, message)
  return value
}

export function cardInput(input) {
  object(input, ['name', 'limit', 'close', 'due', 'archived'])
  if (input.archived !== undefined && typeof input.archived !== 'boolean') throw new RequestError(400, 'Situação inválida.')
  return {
    name: label(input.name, 'um nome'),
    limit: cents(input.limit),
    close: integer(input.close, 31, 'Informe um dia de fechamento entre 1 e 31.'),
    due: integer(input.due, 31, 'Informe um dia de vencimento entre 1 e 31.'),
    archived: input.archived ?? false,
  }
}

export function eventInput(input, currentDay) {
  const type = input?.type
  const extra = {
    purchase: ['description', 'category', 'installments'],
    fee: ['description'],
    refund: ['purchaseId'],
    payment: ['invoice', 'accountId'],
  }
  if (!Object.hasOwn(extra, type)) throw new RequestError(400, 'Escolha uma operação válida.')
  object(input, ['type', 'date', 'amount', ...extra[type]])
  const event = { type, date: day(input.date), amount: cents(input.amount) }
  if (event.date > currentDay || event.date < '1900-01-01') throw new RequestError(400, 'Informe uma data de registro válida até hoje.')

  switch (type) {
    case 'purchase':
      return { ...event, description: label(input.description, 'uma descrição'), category: label(input.category, 'uma categoria'),
        installments: integer(input.installments, Math.min(60, event.amount), 'Confira a quantidade de parcelas, de 1 a 60 e com pelo menos um centavo cada.') }
    case 'fee':
      return { ...event, description: label(input.description, 'uma descrição'), category: 'Encargos' }
    case 'refund':
      return { ...event, purchaseId: id(input.purchaseId) }
    case 'payment':
      if (typeof input.invoice !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.invoice)) throw new RequestError(400, 'Escolha uma fatura.')
      return { ...event, invoice: input.invoice, accountId: id(input.accountId) }
  }
}

export function shiftMonth(month, offset) {
  const date = new Date(month + '-01T00:00:00Z')
  date.setUTCMonth(date.getUTCMonth() + offset)
  return date.toISOString().slice(0, 7)
}

export function cycleDay(month, dayOfMonth) {
  const next = new Date(shiftMonth(month, 1) + '-01T00:00:00Z')
  next.setUTCDate(0)
  return month + '-' + String(Math.min(dayOfMonth, next.getUTCDate())).padStart(2, '0')
}

export function closingMonth(date, close) {
  const month = date.slice(0, 7)
  return date <= cycleDay(month, close) ? month : shiftMonth(month, 1)
}

function amounts(card, events) {
  const cycles = new Map()
  const purchases = new Map(events.filter(row => row.type === 'purchase').map(row => [String(row._id), row]))
  const spending = []

  for (const event of events) {
    const first = event.invoice ?? closingMonth(event.date, card.close)
    const count = event.installments ?? 1
    const base = Math.floor(event.amount / count)
    for (let index = 0; index < count; index++) {
      const month = shiftMonth(first, index)
      const amount = base + Number(index < event.amount % count)
      const cycle = cycles.get(month) ?? { month, charges: 0, refunds: 0, paid: 0 }
      if (event.type === 'payment') {
        cycle.paid = safeAmount(cycle.paid + amount)
      } else if (event.type === 'refund') {
        cycle.refunds = safeAmount(cycle.refunds + amount)
        spending.push({ month, category: purchases.get(String(event.purchaseId)).category, amount: -amount })
      } else {
        cycle.charges = safeAmount(cycle.charges + amount)
        spending.push({ month, category: event.category, amount })
      }
      cycles.set(month, cycle)
    }
  }
  return { cycles: [...cycles.values()].sort((a, b) => a.month.localeCompare(b.month)), spending }
}

export function cardSummary(card, events, currentDay) {
  const { cycles, spending } = amounts(card, events)
  let credit = 0
  let used = 0
  const invoices = cycles.map(cycle => {
    const closedOn = cycleDay(cycle.month, card.close)
    const dueMonth = card.due <= card.close || cycleDay(cycle.month, card.due) <= closedOn
      ? shiftMonth(cycle.month, 1) : cycle.month
    const net = safeAmount(cycle.charges - cycle.refunds - cycle.paid)
    const balance = safeAmount(net - credit)
    const creditApplied = Math.min(credit, Math.max(0, net))
    credit = Math.max(0, -balance)
    const remaining = Math.max(0, balance)
    used = safeAmount(used + remaining)
    const dueOn = cycleDay(dueMonth, card.due)
    const status = currentDay <= closedOn ? 'Aberta' : remaining === 0 ? 'Quitada' : currentDay > dueOn ? 'Vencida' : 'Fechada'
    return { ...cycle, creditApplied, remaining, closedOn, dueOn, status }
  })
  return { ...card, invoices, events, spending, credit, used, available: Math.max(0, card.limit - used) }
}

export function validateCardEvent(card, events, event, currentDay) {
  const summary = cardSummary(card, events, currentDay)
  if (card.archived && ['purchase', 'fee'].includes(event.type)) throw new RequestError(400, 'Reative o cartão para adicionar novos gastos.')
  if (event.type === 'purchase' && event.amount > summary.available) throw new RequestError(400, 'O valor ultrapassa o limite disponível.')
  if (event.type === 'payment') {
    const invoice = summary.invoices.find(row => row.month === event.invoice)
    const onDate = cardSummary(card, events.filter(row => row.date <= event.date), event.date)
    const dueOnDate = onDate.invoices.find(row => row.month === event.invoice)?.remaining ?? 0
    if (!invoice || event.invoice > closingMonth(event.date, card.close) || event.amount > Math.min(invoice.remaining, dueOnDate)) {
      throw new RequestError(400, 'Informe um pagamento de até o saldo da fatura na data registrada.')
    }
  }
  if (event.type === 'refund') {
    const purchase = events.find(row => row.type === 'purchase' && String(row._id) === event.purchaseId)
    const alreadyRefunded = events.filter(row => row.type === 'refund' && String(row.purchaseId) === event.purchaseId)
      .reduce((total, row) => total + row.amount, 0)
    if (!purchase || event.date < purchase.date || event.amount > purchase.amount - alreadyRefunded) {
      throw new RequestError(400, 'Informe um estorno de até o valor restante da compra.')
    }
  }
}
