export const assetKinds = { vehicle: 'Veículo', property: 'Imóvel', equipment: 'Equipamento', investment: 'Investimento ou reserva', other: 'Outro bem', debt: 'Dívida ou obrigação' }

export function assetPresentation(asset) {
  const active = !asset.endedOn
  const sold = !active && asset.status === 'sold'
  const valuation = asset.valuations.find(row => active || row.date <= asset.endedOn)
  const cost = sold ? asset.sale?.cost ?? asset.acquired : asset.acquired
  return {
    active, sold, valuation, cost,
    status: active ? 'Ativo' : sold ? 'Vendido' : 'Baixado',
    valuationLabel: active ? 'Valor atual estimado' : sold ? 'Última avaliação anterior à venda' : 'Última avaliação histórica',
    emptyValuation: active ? 'Aguardando avaliação' : 'Não informada',
    result: sold && cost != null && asset.sale?.amount != null ? asset.sale.amount - cost : null,
  }
}
