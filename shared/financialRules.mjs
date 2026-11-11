export const MAX_MONEY_CENTS = 99_999_999_999

export function validCents(value, { negative = false, zero = false } = {}) {
  return Number.isSafeInteger(value) && Math.abs(value) <= MAX_MONEY_CENTS &&
    (negative || value >= 0) && (zero || value !== 0)
}

export function validDate(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
