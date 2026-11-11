import test from 'node:test'
import assert from 'node:assert/strict'
import { pendingReviews, reminderGroups } from './reminderFormat.js'

test('agrupa lembretes por data civil sem duplicar ocorrências ou alterar o histórico', () => {
  const rows = [{ _id: 'today', status: 'active', effectiveDate: '2026-11-11' }, { _id: 'late', status: 'active', effectiveDate: '2026-10-31' },
    { _id: 'next', status: 'active', effectiveDate: '2026-12-01' }, { _id: 'none', status: 'active', effectiveDate: null }, { _id: 'done', status: 'completed', history: ['preservado'] }]
  const before = structuredClone(rows), groups = reminderGroups(rows, '2026-11-11')
  assert.deepEqual(groups.overdue.map(row => row._id), ['late'])
  assert.deepEqual(groups.upcoming.map(row => row._id), ['today', 'next', 'none'])
  assert.deepEqual(groups.closed.map(row => row._id), ['done'])
  assert.deepEqual(rows, before)
})

test('revisão já representada por lembrete ativo não aparece duas vezes', () => {
  const assets = [{ _id: 'a', reviewOn: '2026-11-11' }, { _id: 'b', reviewOn: '2026-11-12' }, { _id: 'sold', reviewOn: '2026-11-11', endedOn: '2026-11-01' }]
  const reminders = [{ status: 'active', kind: 'valuation', linkId: 'a', effectiveDate: '2026-11-11' }]
  assert.deepEqual(pendingReviews({ assets, reminders }).map(row => row._id), ['b'])
  assert.deepEqual(pendingReviews({ assets, reminders: [{ ...reminders[0], status: 'completed' }] }).map(row => row._id), ['a', 'b'])
})
