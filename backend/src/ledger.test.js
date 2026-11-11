import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { MAX_MONEY_CENTS } from '../../shared/financialRules.mjs'
import { accountBalances, accountInput, entryInput, RequestError } from './ledger.js'

const accountId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const destinationId = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const accounts = [
  { _id: accountId, initialBalance: 100000 },
  { _id: destinationId, initialBalance: -1000, archived: true },
]
const base = { description: 'Registro', amount: 10000, date: '2024-02-29', accountId }

test('transferência redistribui o saldo sem alterar o total', () => {
  const transfer = entryInput({ ...base, type: 'transfer', destinationId })
  const { accounts: result, total } = accountBalances(accounts, [transfer])
  assert.deepEqual(result.map(account => account.balance), [90000, 9000])
  assert.equal(total, 99000)
})

test('editar e excluir lançamentos recalcula o saldo a partir do histórico', () => {
  const expense = entryInput({ ...base, type: 'expense', category: 'Casa', expenseKind: 'fixed' })
  const income = entryInput({ ...base, type: 'income', category: 'Salário', amount: 25000 })
  assert.equal(accountBalances(accounts, [expense, income]).total, 114000)
  assert.equal(accountBalances(accounts, [{ ...expense, amount: 4500 }, income]).total, 119500)
  assert.equal(accountBalances(accounts, [income]).total, 124000)
})

test('validação rejeita decimais, datas inválidas, contas iguais e alterações do saldo inicial', () => {
  const transfer = { ...base, type: 'transfer', destinationId }
  for (const invalid of [{ date: '2025-02-29' }, { amount: 1.25 }, { destinationId: accountId }, { owner: 'outra-pessoa' }]) {
    assert.throws(() => entryInput({ ...transfer, ...invalid }), RequestError)
  }
  assert.throws(() => accountInput({ name: 'Conta', kind: 'Corrente', archived: false, initialBalance: 1 }, true), RequestError)
})

test('valida os limites compartilhados sem perder centavos ou bloquear saldo inicial negativo', () => {
  const account = { name: 'Conta', kind: 'Corrente' }
  assert.equal(accountInput({ ...account, initialBalance: -MAX_MONEY_CENTS }).initialBalance, -MAX_MONEY_CENTS)
  assert.throws(() => accountInput({ ...account, initialBalance: MAX_MONEY_CENTS + 1 }), RequestError)
  const income = { ...base, type: 'income', category: 'Receita', amount: MAX_MONEY_CENTS }
  assert.equal(entryInput(income).amount, MAX_MONEY_CENTS)
  assert.throws(() => entryInput({ ...income, amount: -1 }), RequestError)
  assert.throws(() => entryInput({ ...income, date: '0000-01-01' }), RequestError)
})
