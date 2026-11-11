import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { comparisonPeriod } from '../../shared/reportPeriods.mjs'

test('mês atual usa mesmos dias e permite intervalo consecutivo', () => {
  assert.deepEqual(comparisonPeriod('2026-11-01', '2026-11-11'), { mode: 'month', from: '2026-10-01', through: '2026-10-11' })
  assert.deepEqual(comparisonPeriod('2026-11-01', '2026-11-11', 'consecutive'), { mode: 'consecutive', from: '2026-10-21', through: '2026-10-31' })
})

test('meses completos usam mês anterior completo, incluindo fevereiro e virada do ano', () => {
  for (const [from, through, start, end] of [
    ['2026-11-01', '2026-11-30', '2026-10-01', '2026-10-31'],
    ['2026-03-01', '2026-03-31', '2026-02-01', '2026-02-28'],
    ['2024-03-01', '2024-03-31', '2024-02-01', '2024-02-29'],
    ['2024-02-01', '2024-02-29', '2024-01-01', '2024-01-31'],
    ['2026-01-01', '2026-01-31', '2025-12-01', '2025-12-31'],
  ]) assert.deepEqual(comparisonPeriod(from, through), { mode: 'month', from: start, through: end })
})

test('dias inexistentes são limitados e intervalos de vários meses usam duração inclusiva', () => {
  assert.deepEqual(comparisonPeriod('2026-03-29', '2026-03-30'), { mode: 'month', from: '2026-02-28', through: '2026-02-28' })
  assert.deepEqual(comparisonPeriod('2024-03-01', '2024-03-30'), { mode: 'month', from: '2024-02-01', through: '2024-02-29' })
  assert.deepEqual(comparisonPeriod('2026-03-01', '2026-03-30'), { mode: 'month', from: '2026-02-01', through: '2026-02-28' })
  assert.deepEqual(comparisonPeriod('2026-10-20', '2026-11-11', 'month'), { mode: 'consecutive', from: '2026-09-27', through: '2026-10-19' })
  assert.deepEqual(comparisonPeriod('2024-03-01', '2024-03-01', 'consecutive'), { mode: 'consecutive', from: '2024-02-29', through: '2024-02-29' })
})

test('comparações independem do fuso e de transições de horário de verão', () => {
  const module = new URL('../../shared/reportPeriods.mjs', import.meta.url).href
  const script = `import { comparisonPeriod } from ${JSON.stringify(module)}; console.log(JSON.stringify([comparisonPeriod('2026-11-01','2026-11-11'),comparisonPeriod('2024-03-01','2024-03-31','consecutive')]))`
  const results = ['UTC', 'America/Sao_Paulo', 'America/New_York', 'Pacific/Kiritimati'].map(TZ =>
    execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' }))
  results.forEach(result => assert.equal(result, results[0]))
})
