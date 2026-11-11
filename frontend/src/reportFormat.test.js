import test from 'node:test'
import assert from 'node:assert/strict'
import { distribution } from './reportFormat.js'

test('agrupa categorias pequenas preservando totais, valores de origem e estornos', () => {
  const rows = [{ name: 'Outros', amount: 980 }, { name: 'Táxi', amount: 15 }, { name: 'Metrô', amount: 5 }, { name: 'Crédito', amount: -20 }]
  const { slices, adjustments, total } = distribution(rows, true)
  assert.equal(total, 1000)
  assert.equal(slices.reduce((sum, row) => sum + row.amount, 0), total)
  assert.notEqual(slices[0].key, slices[1].key)
  assert.deepEqual(slices[1].children, rows.slice(1, 3))
  assert.deepEqual(adjustments, rows.slice(3))
})

test('mantém categoria única e distingue a ausência de dados', () => {
  assert.deepEqual(distribution([], true), { slices: [], total: 0, adjustments: [] })
  assert.equal(distribution([{ name: 'Veículos', amount: 3200000 }], false).slices[0].amount, 3200000)
})
