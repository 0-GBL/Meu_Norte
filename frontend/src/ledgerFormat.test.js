import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { dateMessage, editDate, formatDate, formatMoney, maskDate, moneyDraft, parseDate, progress, toCents } from './ledgerFormat.js'

test('progresso de metas preserva percentuais acima do alvo e trata alvo zero', () => {
  assert.equal(progress(6500, 10000), 65)
  assert.equal(progress(125, 100), 125)
  assert.equal(progress(10, 0), 0)
})

test('converte a entrada em reais sem arredondar e aceita o formato brasileiro', () => {
  assert.equal(toCents('0,29'), 29)
  assert.equal(toCents(' -12,5 '), -1250)
  assert.equal(toCents('999999999.99'), 99999999999)
  assert.equal(toCents('1.234,56'), 123456)
  assert.equal(toCents('R$ 1.234,56'), 123456)
  assert.equal(toCents('1.234'), 123400)
  assert.equal(toCents('1,005'), null)
  assert.equal(toCents('1.00,00'), null)
  assert.equal(toCents('1.000.000.000,00'), null)
})

test('valores históricos e limites preservam os centavos ao formatar e digitar novamente', () => {
  for (const amount of [0, 1, -1250, 123456, 99_999_999_999]) {
    assert.equal(toCents(formatMoney(amount)), amount)
  }
})

test('insere separadores na digitação de datas e mantém o valor ISO do registro', () => {
  assert.equal(maskDate('290'), '29/0')
  assert.equal(maskDate('29/022024'), '29/02/2024')
  assert.equal(parseDate(maskDate('29022024')), '2024-02-29')
  assert.equal(parseDate(formatDate('2025-11-06')), '2025-11-06')
})

test('rejeita datas inexistentes, incompletas e com ano inválido', () => {
  for (const date of ['29/02/2025', '31/04/2026', '00/01/2026', '01/13/2026', '01/01/0000', '01/01/202', '01/01/20266']) {
    assert.equal(parseDate(date), '')
  }
})

test('insere barras, conserva o cursor e rejeita excesso sem trocar a data', () => {
  assert.deepEqual(editDate('2', '29', 2, 'insertText'), { value: '29/', position: 3 })
  assert.deepEqual(editDate('29/02/2024', '28/02/2024', 2, 'insertText'), { value: '28/02/2024', position: 3 })
  assert.equal(editDate('29/02/2024', '294/02/2024', 3, 'insertText').value, '29/02/2024')
  assert.deepEqual(editDate('29/02/', '29/02', 5, 'deleteContentBackward'), { value: '29/0', position: 4 })
})

test('indica erros cedo e permite manter datas históricas já registradas', () => {
  assert.match(dateMessage('12/13/'), /mês.*01 e 12/)
  assert.match(dateMessage('31/04/'), /dia não existe/)
  assert.match(dateMessage('29/02/2027'), /dia não existe/)
  assert.equal(dateMessage('29/02/2028'), '')
  assert.match(dateMessage('29/02/', { complete: true }), /Complete/)
  assert.match(dateMessage('01/01/1890'), /ano/)
  assert.equal(dateMessage('01/01/1890', { original: '1890-01-01' }), '')
})

test('filtra digitação e preserva valores colados em formato brasileiro', () => {
  assert.equal(moneyDraft('R$ 1.234,56', false), '1.234,56')
  assert.equal(moneyDraft('1234,', false), '1234,')
  for (const input of ['12a', '12,345', '1234567890', '-12,50']) assert.equal(moneyDraft(input, false), null)
  assert.equal(moneyDraft('-12,50', true), '-12,50')
})
