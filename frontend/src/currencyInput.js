import { MAX_MONEY_CENTS } from '../../shared/financialRules.mjs'
import { formatMoney, toCents } from './ledgerFormat.js'

const digits = value => value.replace(/\D/g, '')
const display = (amount, negative) => negative && amount === 0 ? '-' + formatMoney(0) : formatMoney(negative ? -amount : amount)

export function pasteCurrency(value, negative = false) {
  const amount = toCents(value)
  return amount === null || (!negative && amount < 0) ? null : formatMoney(amount)
}

// Edit the integer cent digits, never the BRL punctuation or a floating-point amount.
export function editCurrency(value, start, end, text, type = 'insertText', negative = false) {
  const unchanged = { value, position: start }
  if (text === '-') {
    if (!negative) return unchanged
    const replacing = start === 0 && end === value.length
    const next = display(replacing ? 0 : Math.abs(toCents(value) ?? 0), replacing || !value.startsWith('-'))
    return { value: next, position: next.length }
  }
  if (!type.startsWith('delete') && !/^\d+$/.test(text ?? '')) return unchanged
  let raw = digits(value)
  let from = digits(value.slice(0, start)).length
  let through = digits(value.slice(0, end)).length
  if (type.startsWith('delete') && start === end) {
    if ((toCents(value) ?? 0) === 0) return { value: '', position: 0 }
    if (type === 'deleteContentBackward') from = Math.max(0, from - 1)
    else through = Math.min(raw.length, through + 1)
  }
  const right = raw.length - through
  raw = raw.slice(0, from) + (type.startsWith('delete') ? '' : text) + raw.slice(through)
  if (!raw) return { value: '', position: 0 }
  raw = raw.replace(/^0+(?=\d)/, '')
  if (raw.length > String(MAX_MONEY_CENTS).length) return unchanged
  const amount = Number(raw)
  if (!Number.isSafeInteger(amount) || amount > MAX_MONEY_CENTS) return unchanged
  const next = display(amount, negative && value.startsWith('-') && !(start === 0 && end > 0))
  let position = next.length, remaining = right
  while (position > 0 && remaining > 0) if (/\d/.test(next[--position])) remaining--
  return { value: next, position }
}
