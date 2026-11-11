import test from 'node:test'
import assert from 'node:assert/strict'
import { assetPresentation } from './assetPresentation.js'

const sold = { status: 'sold', endedOn: '2026-11-11', acquired: 2000000,
  sale: { date: '2026-11-11', amount: 1800000, cost: 2000000 }, valuations: [] }

test('venda sem avaliação apresenta resultado realizado e não pede avaliação', () => {
  const view = assetPresentation(sold)
  assert.equal(view.status, 'Vendido')
  assert.equal(view.result, -200000)
  assert.equal(view.valuationLabel, 'Última avaliação anterior à venda')
  assert.equal(view.emptyValuation, 'Não informada')
  assert.equal(view.active, false)
})

test('avaliação histórica e referência do recebimento permanecem intactas', () => {
  const asset = { ...sold, sale: { ...sold.sale, entryId: 'receipt' }, valuations: [
    { date: '2026-11-12', value: 1900000 }, { date: '2026-11-10', value: 1850000 }, { date: '2026-10-01', value: 1950000 },
  ] }
  const before = structuredClone(asset)
  assert.deepEqual(assetPresentation(asset).valuation, asset.valuations[1])
  assert.equal(assetPresentation(asset).result, -200000)
  assert.deepEqual(asset, before)
})

test('baixa preserva custo e última avaliação histórica, sem avaliação pendente', () => {
  const asset = { status: 'retired', endedOn: '2026-11-11', acquired: 2000000, valuations: [{ date: '2026-11-10', value: 1850000 }] }
  const view = assetPresentation(asset)
  assert.equal(view.status, 'Baixado')
  assert.equal(view.cost, 2000000)
  assert.equal(view.valuation.value, 1850000)
  assert.equal(view.emptyValuation, 'Não informada')
  assert.equal(view.result, null)
  assert.equal(assetPresentation({ ...asset, valuations: [] }).valuation, undefined)
})

test('ativos mantêm estimativa e mensagem de avaliação pendente', () => {
  assert.equal(assetPresentation({ valuations: [] }).emptyValuation, 'Aguardando avaliação')
  assert.equal(assetPresentation({ valuations: [{ date: '2026-11-11', value: 100 }] }).valuation.value, 100)
})
