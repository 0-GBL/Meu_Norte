import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { toCents } from './ledgerFormat.js'

test('converte a entrada em reais sem arredondar nem aceitar separadores ambíguos', () => {
  assert.equal(toCents('0,29'), 29)
  assert.equal(toCents(' -12,5 '), -1250)
  assert.equal(toCents('999999999.99'), 99999999999)
  assert.equal(toCents('1.234,56'), null)
  assert.equal(toCents('1,005'), null)
})
