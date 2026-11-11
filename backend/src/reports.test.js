import test from 'node:test'
import assert from 'node:assert/strict'
import { cardSummary } from './cards.js'
import { periodReport, portfolioPosition, reportComparison } from './reports.js'

const date = '2025-02-28'
const accounts = [{ _id: 'a', initialBalance: 10000, archived: true },
  { _id: 'b', initialBalance: -2000 }, { _id: 'deleted', initialBalance: 500, deletedAt: date }]
const entry = (type, amount, extra) => ({ type, date: '2025-02-10', amount, accountId: 'a', category: 'Geral', ...extra })
const entries = [entry('income', 6000), entry('expense', 2000), entry('transfer', 3000, { destinationId: 'b' }),
  entry('cardPayment', 1000), entry('expense', 500, { accountId: 'deleted' }),
  entry('income', 99999, { cancelledAt: date }), entry('income', 50000, { date: '2025-03-03' })]
const valuation = (value, date = '2025-02-08') => ({ value, date })
const asset = (kind, valuations, extra) => ({ _id: kind, name: kind, kind, valuations, ...extra })
const assets = [
  asset('vehicle', [valuation(3200000), valuation(4000000, '2025-01-08')], { acquired: 4000000 }),
  asset('property', [valuation(1000000)], { accountId: 'a' }),
  asset('equipment', [], { acquired: 50000 }),
  asset('other', [valuation(90000)], { deletedAt: date }),
  asset('investment', [valuation(50000)], { endedOn: date }),
  asset('debt', [valuation(20000)]),
  asset('debt', [valuation(2000)], { accountId: 'b' }),
  asset('debt', []),
]
const cards = [cardSummary({ close: 15, due: 22, limit: 50000 }, [
  { _id: 'purchase', type: 'purchase', date: '2025-02-01', amount: 8000, installments: 2, category: 'Compras' },
  { type: 'refund', date: '2025-02-02', amount: 500, purchaseId: 'purchase' },
  { type: 'payment', date: '2025-02-10', amount: 1000, invoice: '2025-02' },
], date)]
const input = { accounts, entries, assets, cards, from: '2025-02-01', through: date, currentDay: date }

test('consolida patrimônio avaliado, saldos negativos e faturas sem duplicar passivos', () => {
  assert.equal(cards[0].invoices[0].remaining, 2500)
  assert.deepEqual(portfolioPosition({ ...input, date }), {
    date, balance: 11000, evaluatedAssets: 3200000, obligations: 26500, debts: 20000, cardDebt: 6500,
    pendingAssets: 1, pendingDebts: 1, netWorth: 3184500,
  })
})

test('separa competência de caixa, ignora cancelamentos e mantém escopos dos filtros', () => {
  const report = periodReport(input)
  assert.deepEqual([report.income, report.expenses, report.cash], [6000, 6000, 2500])
  assert.equal(report.rows[0].balance, 11000)
  assert.deepEqual(report.categories, [{ name: 'Geral', amount: 2500 }, { name: 'Compras', amount: 3500 }])
  const transfer = periodReport({ ...input, type: 'transfer', accountId: 'b' })
  assert.deepEqual([transfer.income, transfer.expenses, transfer.cash, transfer.rows[0].balance], [0, 0, 3000, 1000])
  assert.equal(periodReport({ ...input, category: 'Compras' }).expenses, 3500)
  assert.equal(periodReport({ ...input, type: 'cardPayment' }).cash, -1000)
  assert.equal(periodReport({ ...input, type: 'cardPayment' }).expenses, 0)
  const future = periodReport({ ...input, through: '2025-03-31' })
  assert.equal(future.rows.at(-1).balance, null)
  assert.equal(future.cash, 2500)
})

test('expõe avaliações em datas registradas e categorias sem bens vinculados ou baixados', () => {
  const report = periodReport({ ...input, from: '2025-01-01', assetKind: 'vehicle' })
  assert.deepEqual(report.assetCategories, [{ name: 'vehicle', amount: 3200000 }])
  assert.deepEqual(report.valuationSeries, [{
    id: 'vehicle', name: 'vehicle', acquired: 4000000,
    points: [{ date: '2025-01-08', value: 4000000 }, { date: '2025-02-08', value: 3200000 }],
  }])
  assert.deepEqual(periodReport({ ...input, assetKind: 'property' }).assetCategories, [])
  assert.deepEqual(periodReport({ ...input, assetKind: 'equipment' }).valuationSeries, [])
})

test('compara intervalos, sem percentual indefinido ou inversão com base negativa', () => {
  const prior = periodReport({ ...input, from: '2025-01-04', through: '2025-01-31' })
  assert.deepEqual(reportComparison(periodReport(input), prior).income, { value: 6000, difference: 6000, percent: null })
  assert.deepEqual(reportComparison({ income: 500, expenses: 1000, cash: -500 },
    { income: 0, expenses: 1000, cash: -1000 }).result, { value: -500, difference: 500, percent: 50 })
})
