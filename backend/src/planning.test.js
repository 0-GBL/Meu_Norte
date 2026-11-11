import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { scryptSync } from 'node:crypto'
import { budgetInput, budgetSummaries, goalSummary, spendingRecords } from './planning.js'
import { nextReminder, reminderDue, reminderInput } from './records.js'
import { reportSummary } from './reports.js'
import { checkPassword, hashPassword, validatePassword } from './auth.js'

test('preserva a autenticação de uma senha longa armazenada antes do bcrypt', async () => {
  const password = 'é'.repeat(45)
  const salt = 'a'.repeat(32)
  const key = scryptSync(password, salt, 64, { N: 65536, r: 8, p: 1, maxmem: 96 * 1024 * 1024 })
  assert.equal(await checkPassword(password, salt + ':' + key.toString('hex')), true)
  assert.throws(() => validatePassword(password))
})

test('recorrência anual retorna ao dia 29 em ano bissexto', () => {
  const reminder = reminderInput({ name: 'Anual', dueOn: '2024-02-29', frequency: 'yearly' })
  for (const expected of ['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']) {
    assert.equal(nextReminder(reminder), expected)
    reminder.dueOn = expected
  }
})

test('orçamentos agregam lançamentos e parcelas sem somar pagamentos ou transferências', () => {
  const entries = [
    { type: 'expense', date: '2026-11-03', category: 'Casa', amount: 600 },
    { type: 'cardPayment', date: '2026-11-10', amount: 900 },
    { type: 'transfer', date: '2026-11-15', amount: 1000 },
  ]
  const spending = spendingRecords(entries, [{ spending: [
    { month: '2026-11', category: 'CASA', amount: 500 },
    { month: '2026-11', category: 'Casa', amount: -100 },
  ] }])
  const budgets = ['casa', ''].map(category => budgetInput({ category, month: '2026-11', limit: 1250 }))
  assert.deepEqual(budgetSummaries(budgets, spending).map(({ spent, remaining, status }) => [spent, remaining, status]),
    [[1000, 250, 'near'], [1000, 250, 'near']])
})

test('a meta acompanha aportes e retiradas com estimativa pelo plano mensal', () => {
  const goal = goalSummary({ target: 1500, monthly: 300 }, [{ amount: 1000 }, { amount: -200 }])
  assert.deepEqual([goal.saved, goal.remaining, goal.months], [800, 700, 3])
})

test('adiar não muda a âncora mensal após um mês mais curto', () => {
  const row = reminderInput({ name: 'Conta', dueOn: '2026-01-31', frequency: 'monthly', amount: null })
  assert.equal(reminderDue({ ...row, snoozedUntil: '2026-02-03' }), '2026-02-03')
  const next = nextReminder(row)
  assert.equal(next, '2026-02-28')
  assert.equal(nextReminder({ ...row, dueOn: next }), '2026-03-31')
})

test('relatórios conciliam caixa, despesa do cartão e avaliação sem duplicar reserva vinculada', () => {
  const accounts = [{ initialBalance: 10000 }]
  const entries = [
    { type: 'cardPayment', date: '2026-11-10', amount: 900 },
    { type: 'income', date: '2026-11-10', amount: 500 },
    { type: 'transfer', date: '2026-11-10', amount: 1000 },
  ]
  const cards = [{ spending: [{ month: '2026-11', category: 'Casa', amount: 1200 }] }]
  const assets = [
    { kind: 'equipment', valuations: [{ value: 3000, date: '2026-11-01' }] },
    { kind: 'debt', valuations: [{ value: 700, date: '2026-11-01' }] },
    { kind: 'investment', accountId: 'vinculada', valuations: [{ value: 30000, date: '2026-11-01' }] },
  ]
  const [month] = reportSummary(entries, accounts, cards, assets, '2026-11')
  assert.deepEqual([month.receitas, month.despesas, month.balance, month.netWorth], [500, 1200, 9600, 11900])
})

test('senhas são verificadas com sal individual e rejeitam entradas fora da política', async () => {
  assert.throws(() => validatePassword('curta'))
  assert.throws(() => validatePassword('á'.repeat(129)))
  const password = 'frase-segura-de-teste'
  const first = await hashPassword(password)
  const second = await hashPassword(password)
  assert.notEqual(first, second)
  assert.equal(await checkPassword(password, first), true)
  assert.equal(await checkPassword('senha-incorreta', first), false)
})
