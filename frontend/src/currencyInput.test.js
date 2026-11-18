import test from 'node:test'
import assert from 'node:assert/strict'
import { editCurrency, pasteCurrency } from './currencyInput.js'
import { formatMoney, toCents } from './ledgerFormat.js'
import { MAX_MONEY_CENTS } from '../../shared/financialRules.mjs'

const type = (value, text, negative = false) => [...text].reduce((current, key) =>
  editCurrency(current, current.length, current.length, key, 'insertText', negative).value, value)

test('digitação incremental preserva cada centavo em todos os valores solicitados', () => {
  for (const cents of [0, 1, 50, 100, 1050, 15000, 150000, 10000099, MAX_MONEY_CENTS]) {
    assert.equal(type('', String(cents)), formatMoney(cents))
  }
  let value = ''
  for (const [key, cents] of [['1', 1], ['5', 15], ['0', 150], ['0', 1500], ['0', 15000], ['0', 150000]]) {
    value = type(value, key)
    assert.equal(toCents(value), cents)
  }
})

test('Backspace, Delete, seleção parcial e substituição integral editam somente dígitos', () => {
  let value = formatMoney(150000)
  for (const expected of [15000, 1500, 150, 15, 1, 0, null]) {
    value = editCurrency(value, value.length, value.length, '', 'deleteContentBackward').value
    assert.equal(toCents(value), expected)
  }
  value = formatMoney(12345)
  assert.equal(editCurrency(value, 0, value.length, '9').value, formatMoney(9))
  assert.equal(editCurrency(value, value.length - 2, value.length, '50').value, formatMoney(12350))
  assert.equal(editCurrency(value, value.indexOf('2'), value.indexOf('2'), '', 'deleteContentForward').value, formatMoney(1345))
  assert.equal(editCurrency(value, 0, value.length, '', 'deleteContentBackward').value, '')
})

test('colar preserva reais, agrupamentos e centavos sem arredondamento', () => {
  for (const cents of [0, 1, 50, 100, 1050, 15000, 150000, 10000099, MAX_MONEY_CENTS]) {
    assert.equal(pasteCurrency(formatMoney(cents)), formatMoney(cents))
  }
  assert.equal(toCents(pasteCurrency('1500')), 150000)
  assert.equal(toCents(pasteCurrency('100.000,99')), 10000099)
  for (const invalid of ['12a', '1,005', '1.00,00', '1e5', 'Infinity', '', '1000000000,00']) assert.equal(pasteCurrency(invalid), null)
})

test('sinal negativo é preservado somente quando permitido, inclusive a partir de zero', () => {
  assert.equal(type('', '-1250', true), formatMoney(-1250))
  assert.equal(type(formatMoney(-1250), '0', true), formatMoney(-12500))
  assert.equal(type('', '-1250'), formatMoney(1250))
  assert.equal(pasteCurrency('-R$ 12,50'), null)
  assert.equal(pasteCurrency('-R$ 12,50', true), formatMoney(-1250))
  assert.equal(type(formatMoney(-1250), '-', true), formatMoney(1250))
  const replacedSign = editCurrency(formatMoney(MAX_MONEY_CENTS), 0, formatMoney(MAX_MONEY_CENTS).length, '-', 'insertText', true)
  assert.equal(type(replacedSign.value, '1250', true), formatMoney(-1250))
})

test('limite do backend e caracteres inválidos não alteram o último valor válido', () => {
  const maximum = formatMoney(MAX_MONEY_CENTS)
  assert.equal(type(maximum, '9'), maximum)
  for (const key of ['a', '.', ',', '+', 'e']) assert.equal(type(formatMoney(1050), key), formatMoney(1050))
  assert.equal(type('', '9'.repeat(100)), maximum)
})

test('edição de valores existentes e posição do cursor preservam os valores exatos', () => {
  for (const cents of [1, 1050, -1250, MAX_MONEY_CENTS]) {
    const formatted = formatMoney(cents)
    assert.equal(toCents(formatted), cents)
    const result = editCurrency(formatted, 0, formatted.length, '50', 'insertText', true)
    assert.equal(toCents(result.value), 50)
    assert.equal(result.position, result.value.length)
  }
})
