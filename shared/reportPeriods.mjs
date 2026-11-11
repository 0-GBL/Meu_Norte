const iso = date => date.toISOString().slice(0, 10)
const utc = day => new Date(day + 'T00:00:00Z')

export const monthlyComparisonApplicable = (from, through) => from.slice(0, 7) === through.slice(0, 7)

// Calendar dates stay in UTC throughout; no local-time or DST arithmetic.
export function comparisonPeriod(from, through, requested) {
  const monthly = monthlyComparisonApplicable(from, through)
  const mode = requested === 'consecutive' || !monthly ? 'consecutive' : 'month'
  if (mode === 'month') {
    const previousEnd = utc(from.slice(0, 7) + '-01')
    previousEnd.setUTCDate(0)
    const lastDay = previousEnd.getUTCDate()
    const prefix = iso(previousEnd).slice(0, 7)
    const currentEnd = utc(from.slice(0, 7) + '-01')
    currentEnd.setUTCMonth(currentEnd.getUTCMonth() + 1, 0)
    const complete = from.endsWith('-01') && through === iso(currentEnd)
    const clamp = day => prefix + '-' + String(Math.min(Number(day.slice(-2)), lastDay)).padStart(2, '0')
    return { mode, from: clamp(from), through: complete ? iso(previousEnd) : clamp(through) }
  }
  const days = (utc(through) - utc(from)) / 86_400_000 + 1
  const start = utc(from), end = utc(from)
  start.setUTCDate(start.getUTCDate() - days)
  end.setUTCDate(end.getUTCDate() - 1)
  return { mode, from: iso(start), through: iso(end) }
}
