export function pendingReviews(data) {
  return data.assets.filter(asset => asset.reviewOn && !asset.endedOn && !data.reminders.some(reminder =>
    reminder.status === 'active' && ['asset', 'valuation'].includes(reminder.kind) && reminder.linkId === asset._id && reminder.effectiveDate === asset.reviewOn))
    .sort((a, b) => a.reviewOn.localeCompare(b.reviewOn))
}

export function reminderGroups(reminders, today) {
  const active = reminders.filter(row => row.status === 'active').sort((a, b) => (a.effectiveDate ?? '9999').localeCompare(b.effectiveDate ?? '9999'))
  return { overdue: active.filter(row => row.effectiveDate && row.effectiveDate < today),
    upcoming: active.filter(row => !row.effectiveDate || row.effectiveDate >= today), closed: reminders.filter(row => row.status !== 'active') }
}
