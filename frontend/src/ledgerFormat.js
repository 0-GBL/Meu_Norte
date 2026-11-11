import { MAX_MONEY_CENTS, validCents, validDate } from '../../shared/financialRules.mjs'

const maxWholeDigits = String(Math.floor(MAX_MONEY_CENTS / 100)).length

export function toCents(value) {
  if (typeof value !== 'string') return null
  const input = value.trim().replace(/^(-?)R\$\s*/i, '$1')
  const grouped = /^-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(input)
  const normalized = grouped ? input.replaceAll('.', '') : input
  const match = /^(-?)(\d+)(?:[,.](\d{1,2}))?$/.exec(normalized)
  if (!match) return null
  const [, sign, reais, cents = ''] = match
  if (reais.length > maxWholeDigits) return null
  const amount = (Number(reais) * 100 + Number(cents.padEnd(2, '0'))) * (sign ? -1 : 1)
  return validCents(amount, { negative: true, zero: true }) ? amount || 0 : null
}

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const formatMoney = cents => currency.format(cents / 100)
export const money = formatMoney
const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' })
export const dateLabel = date => shortDate.format(new Date(date))
export const progress = (current, target) => target > 0 ? Math.round(current / target * 100) : 0

export function maskDate(value) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return digits.slice(0, 2) + (digits.length >= 2 ? '/' : '') +
    digits.slice(2, 4) + (digits.length >= 4 ? '/' : '') + digits.slice(4)
}

export function editDate(previous, raw, cursor, inputType) {
  if (raw.replace(/\D/g, '').length > 8) {
    return { value: previous, position: Math.min(previous.length, Math.max(0, cursor - Math.max(0, raw.length - previous.length))) }
  }
  let before = raw.slice(0, cursor).replace(/\D/g, '').length
  let value = maskDate(raw)
  if (value === previous && raw !== previous && raw.length < previous.length) {
    const digits = previous.replace(/\D/g, '')
    if (inputType === 'deleteContentBackward' && before > 0) {
      value = maskDate(digits.slice(0, before - 1) + digits.slice(before))
      before--
    } else if (inputType === 'deleteContentForward') {
      value = maskDate(digits.slice(0, before) + digits.slice(before + 1))
    }
  }
  let position = 0
  let seen = 0
  while (position < value.length && seen < before) {
    if (/\d/.test(value[position])) seen++
    position++
  }
  if (value[position] === '/' && !inputType?.startsWith('delete')) position++
  return { value, position }
}

export function dateMessage(value, { required, min, max, complete, original } = {}) {
  if (!value) return required && complete ? 'Informe uma data.' : ''
  const [day, month, year] = value.split('/')
  if (day.length === 2 && (+day < 1 || +day > 31)) return 'O dia deve estar entre 01 e 31.'
  if (month?.length === 2 && (+month < 1 || +month > 12)) return 'O mês deve estar entre 01 e 12.'
  if (month?.length === 2 && +day > new Date(Date.UTC(2024, +month, 0)).getUTCDate()) return 'Esse dia não existe no mês informado.'
  if (year?.length !== 4) return complete ? 'Complete a data no formato DD/MM/AAAA.' : ''
  const date = parseDate(value)
  if (!date) return 'Esse dia não existe no mês e ano informados.'
  if (date !== original && (+year < 1900 || +year > 2199)) return 'O ano deve estar entre 1900 e 2199.'
  if (min && date < min) return 'Escolha uma data a partir de ' + formatDate(min) + '.'
  if (max && date > max) return 'Escolha uma data até ' + formatDate(max) + '.'
  return ''
}

export function moneyDraft(value, negative) {
  const raw = value.trim().replace(/^(-?)R\$\s*/i, '$1')
  if (raw === '' || (raw === '-' && negative)) return raw
  if (!negative && raw.startsWith('-')) return null
  const amount = toCents(raw)
  if (amount !== null) return raw
  if (/^-?\d+[,.]$/.test(raw) && toCents(raw.slice(0, -1)) !== null) return raw
  // Allow incomplete grouping while editing or entering a Brazilian amount.
  if (/^-?\d{1,3}(?:\.\d{3})*\.\d{0,2}$/.test(raw) &&
    raw.replace(/\D/g, '').length <= maxWholeDigits) return raw
  return null
}

export function parseDate(value) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return ''
  const iso = value.split('/').reverse().join('-')
  return validDate(iso) ? iso : ''
}

export const formatDate = iso => iso ? iso.split('-').reverse().join('/') : ''

export function localDay() {
  const now = new Date()
  const pad = number => String(number).padStart(2, '0')
  return [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join('-')
}
