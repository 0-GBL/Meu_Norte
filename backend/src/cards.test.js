import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { cardSummary, closingMonth, eventInput, validateCardEvent } from './cards.js'
import { accountBalances, entryInput } from './ledger.js'

const card = { name: 'Cartão', close: 20, due: 10, limit: 1000 }
const today = '2026-05-25'
const purchase = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', type: 'purchase', date: '2026-01-21', amount: 1000, installments: 3, category: 'Casa' }

test('parcelas preservam centavos e passam ao próximo ciclo após o fechamento', () => {
  const result = cardSummary(card, [purchase], today)
  assert.equal(closingMonth('2026-01-20', 20), '2026-01')
  assert.equal(closingMonth('2024-02-29', 31), '2024-02')
  assert.deepEqual(result.invoices.map(row => [row.month, row.charges, row.dueOn]), [
    ['2026-02', 334, '2026-03-10'], ['2026-03', 333, '2026-04-10'], ['2026-04', 333, '2026-05-10'],
  ])
  assert.equal(result.available, 0)
})

test('pagamento parcial baixa a conta e restaura limite sem aumentar despesas', () => {
  const accountId = 'bbbbbbbbbbbbbbbbbbbbbbbb'
  const payment = { type: 'payment', date: '2026-03-08', amount: 200, accountId, invoice: '2026-02' }
  validateCardEvent(card, [purchase], payment, today)
  const result = cardSummary(card, [purchase, payment], today)
  assert.equal(result.invoices[0].remaining, 134)
  assert.equal(result.available, 200)
  assert.equal(result.spending.reduce((total, row) => total + row.amount, 0), 1000)
  assert.equal(accountBalances([{ _id: accountId, initialBalance: 5000 }], [{ ...payment, type: 'cardPayment' }]).total, 4800)
  assert.throws(() => entryInput({ ...payment, type: 'cardPayment', description: 'Fatura' }))
  assert.throws(() => validateCardEvent(card, [purchase, payment], { ...payment, amount: 135 }, today))
  assert.throws(() => validateCardEvent(card, [purchase], { ...payment, invoice: '2026-04' }, today))
})

test('estorno parcial carrega crédito e limita reembolsos ao valor original', () => {
  const refund = { type: 'refund', date: '2026-02-04', amount: 400, purchaseId: purchase._id }
  validateCardEvent(card, [purchase], refund, today)
  const result = cardSummary(card, [purchase, refund], today)
  assert.deepEqual(result.invoices.map(row => row.remaining), [0, 267, 333])
  assert.equal(result.spending.reduce((total, row) => total + row.amount, 0), 600)
  assert.throws(() => validateCardEvent(card, [purchase, refund], { ...refund, amount: 601 }, today))
  assert.throws(() => eventInput({ ...purchase, _id: undefined, description: 'Compra', installments: 61 }, today))
})
