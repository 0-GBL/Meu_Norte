import { day, cents, id, label, object, RequestError } from './ledger.js'
import { cycleDay, shiftMonth } from './cards.js'

export const reminderDue = row => row.snoozedUntil ?? row.dueOn

export function reminderInput(input) {
  object(input, ['name', 'dueOn', 'frequency', 'amount'])
  if (!['once', 'weekly', 'monthly', 'yearly'].includes(input.frequency)) throw new RequestError(400, 'Escolha uma periodicidade.')
  const dueOn = day(input.dueOn)
  return {
    name: label(input.name, 'um nome'), dueOn, frequency: input.frequency,
    anchor: Number(dueOn.slice(-2)), amount: input.amount === null ? null : cents(input.amount),
  }
}

export function nextReminder(row) {
  if (row.frequency === 'once') return null
  if (row.frequency === 'weekly') {
    const date = new Date(row.dueOn + 'T00:00:00Z')
    date.setUTCDate(date.getUTCDate() + 7)
    return date.toISOString().slice(0, 10)
  }
  return cycleDay(shiftMonth(row.dueOn.slice(0, 7), row.frequency === 'yearly' ? 12 : 1), row.anchor)
}

export function assetInput(input) {
  object(input, ['name', 'kind', 'acquired', 'accountId', 'reviewOn'])
  if (!['vehicle', 'property', 'equipment', 'investment', 'other', 'debt'].includes(input.kind)) {
    throw new RequestError(400, 'Escolha a categoria do patrimônio.')
  }
  return {
    name: label(input.name, 'um nome'), kind: input.kind,
    acquired: input.acquired === null ? null : cents(input.acquired),
    accountId: input.accountId === null ? null : id(input.accountId),
    reviewOn: input.reviewOn === null ? null : day(input.reviewOn),
  }
}

export function valuationInput(input, today) {
  object(input, ['value', 'date', 'reviewOn'])
  const date = day(input.date)
  if (date > today) throw new RequestError(400, 'Informe uma data de avaliação até hoje.')
  return { value: input.value === 0 ? 0 : cents(input.value), date, reviewOn: input.reviewOn === null ? null : day(input.reviewOn) }
}
