export function toCents(value) {
  const match = /^(-?)(\d{1,9})(?:[,.](\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  const [, sign, reais, cents = ''] = match
  return (Number(reais) * 100 + Number(cents.padEnd(2, '0'))) * (sign ? -1 : 1)
}

export function localDay() {
  const now = new Date()
  const pad = number => String(number).padStart(2, '0')
  return [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join('-')
}
