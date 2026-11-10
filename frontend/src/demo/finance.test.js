import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { accounts, goals, history, money, progress, totalBalance } from './finance.js'

test('saldo consolidado soma saldos em centavos, inclusive negativos', () => {
  assert.equal(totalBalance(accounts), 1284550)
  assert.equal(totalBalance([{ balance: 101 }, { balance: -99 }]), 2)
  assert.equal(totalBalance([]), 0)
})

test('progresso de metas preserva percentuais acima do alvo e trata alvo zero', () => {
  assert.equal(progress(goals[0].saved, goals[0].target), 65)
  assert.equal(progress(125, 100), 125)
  assert.equal(progress(10, 0), 0)
})

test('série histórica usa centavos e a moeda é apresentada em reais', () => {
  assert.equal(history[0].receitas, 540000)
  assert.match(money(history[0].receitas), /5\.400,00/)
})
