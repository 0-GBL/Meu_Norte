import { day, cents, id, label, object, RequestError } from './ledger.js'
import { cycleDay, shiftMonth } from './cards.js'

export const reminderDue = row => row.snoozedUntil ?? row.dueOn
export const accountReminderKinds = ['account']
export const cardReminderKinds = ['cardClose', 'cardDue', 'cardOpen']
export const assetReminderKinds = ['asset', 'valuation']
export const isActiveAsset = row => !row.deletedAt && !row.endedOn
export const optionalText = (value, field) => value == null || value === '' ? '' : label(value, field)

export function reminderInput(input) {
  object(input, ['name', 'dueOn', 'frequency', 'amount', 'description', 'kind', 'time', 'leadDays', 'linkId'])
  if (!['once', 'weekly', 'monthly', 'yearly'].includes(input.frequency)) throw new RequestError(400, 'Escolha uma periodicidade.')
  const kind = input.kind ?? 'manual'
  const linked = [...accountReminderKinds, ...cardReminderKinds, ...assetReminderKinds].includes(kind)
  if (!linked && !['manual', 'commitment'].includes(kind)) throw new RequestError(400, 'Escolha um tipo de lembrete.')
  const dueOn = cardReminderKinds.includes(kind) ? null : day(input.dueOn)
  const time = input.time || ''
  const leadDays = input.leadDays ?? 0
  if (typeof time !== 'string' || (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new RequestError(400, 'Informe um horário válido.')
  if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 365) throw new RequestError(400, 'Informe uma antecedência entre 0 e 365 dias.')
  return {
    name: label(input.name, 'um nome'), dueOn, frequency: cardReminderKinds.includes(kind) ? 'monthly' : input.frequency,
    anchor: dueOn ? Number(dueOn.slice(-2)) : null, amount: input.amount == null ? null : cents(input.amount),
    kind, time, leadDays, linkId: linked ? id(input.linkId) : null,
    description: optionalText(input.description, 'uma descrição'),
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
  object(input, ['name', 'kind', 'acquired', 'accountId', 'reviewOn', 'description', 'notes', 'acquiredOn'])
  if (!['vehicle', 'property', 'equipment', 'investment', 'other', 'debt'].includes(input.kind)) {
    throw new RequestError(400, 'Escolha a categoria do patrimônio.')
  }
  return {
    name: label(input.name, 'um nome'), kind: input.kind,
    acquired: input.acquired == null ? null : input.acquired === 0 ? 0 : cents(input.acquired),
    accountId: input.accountId == null ? null : id(input.accountId),
    reviewOn: input.reviewOn == null ? null : day(input.reviewOn),
    ...(input.acquiredOn !== undefined && { acquiredOn: input.acquiredOn ? day(input.acquiredOn) : null }),
    ...(input.description !== undefined && { description: optionalText(input.description, 'uma descrição') }),
    ...(input.notes !== undefined && { notes: optionalText(input.notes, 'uma observação') }),
  }
}

export function valuationInput(input, today) {
  object(input, ['value', 'date', 'reviewOn', 'notes'])
  const date = day(input.date)
  if (date > today) throw new RequestError(400, 'Informe uma data de avaliação até hoje.')
  return { value: input.value === 0 ? 0 : cents(input.value), date, reviewOn: input.reviewOn == null ? null : day(input.reviewOn),
    ...(input.notes !== undefined && { notes: optionalText(input.notes, 'uma observação') }) }
}

export function assetOperation(input, currentDay) {
  object(input, ['type', 'date', 'amount', 'mode', 'accountId', 'entryId'])
  const { type, mode = 'note' } = input
  if (!['purchase', 'sale', 'retire'].includes(type) || !['note', 'existing', 'new'].includes(mode) ||
    (type === 'retire' && mode !== 'note')) throw new RequestError(400, 'Escolha uma operação patrimonial válida.')
  const date = day(input.date)
  if (date > currentDay) throw new RequestError(400, 'Informe uma data até hoje.')
  return { type, mode, date, ...(type !== 'retire' && { amount: cents(input.amount) }),
    ...(mode === 'existing' && { entryId: id(input.entryId) }), ...(mode === 'new' && { accountId: id(input.accountId) }) }
}
