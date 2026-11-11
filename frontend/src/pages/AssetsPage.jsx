import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useLedger } from '../LedgerContext.jsx'
import { assetKinds, assetPresentation } from '../assetPresentation.js'
import { formatDate, localDay, money } from '../ledgerFormat.js'
import { receiptState, saleKey } from '../../../shared/assetReceipts.mjs'
import { RemoveRecord, Table } from '../components/Details.jsx'
import { AssetEditor, AssetOperationForm, SaleWizard, ValuationForm } from '../components/AssetForms.jsx'
import AssetReceiptPanel, { AssetSaleHistory } from '../components/AssetReceiptPanel.jsx'
import './AssetsPage.css'

const activeAsset = row => !row.endedOn

function ValuationHistory({ asset }) {
  return <section className="asset-section"><h3>Valores registrados</h3>
    {asset.valuations.length ? <Table compact label={'Avaliações de ' + asset.name} rows={asset.valuations.map(row => ({ ...row, id: row._id }))} columns={[
      { key: 'date', label: 'Data', render: row => formatDate(row.date) },
      { key: 'value', label: 'Valor', render: row => money(row.value) },
      { key: 'notes', label: 'Observação', render: row => row.notes || '—' },
    ]} /> : <p>Nenhum valor foi registrado ainda.</p>}
    {asset.purchase?.date && <p>Compra registrada em {formatDate(asset.purchase.date)} · {money(asset.purchase.amount)} · {asset.purchase.entryId ? 'Pagamento vinculado' : 'Informativa'}</p>}
    {asset.endedOn && asset.status !== 'sold' && <p>Baixa registrada em {formatDate(asset.endedOn)}. Sem movimentação bancária.</p>}
  </section>
}

function AssetInformation({ asset }) {
  const { data } = useLedger()
  const view = assetPresentation(asset)
  return <dl className="asset-facts">
    <div><dt>Custo de aquisição</dt><dd>{view.cost == null ? 'Não informado' : money(view.cost)}</dd></div>
    {asset.acquiredOn && <div><dt>Data da aquisição</dt><dd>{formatDate(asset.acquiredOn)}</dd></div>}
    {view.active && view.valuation && asset.acquired != null && <div><dt>Variação estimada</dt>
      <dd>{money(view.valuation.value - asset.acquired)}{asset.acquired > 0 && ' · ' + new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format((view.valuation.value - asset.acquired) / asset.acquired)}</dd></div>}
    {!view.active && <div><dt>{view.valuationLabel}</dt><dd>{view.valuation ? money(view.valuation.value) + ' · ' + formatDate(view.valuation.date) : view.emptyValuation}</dd></div>}
    {view.sold && <div><dt>{asset.sale.cancelledAt ? 'Resultado da venda cancelada' : 'Resultado realizado'}</dt><dd>{view.result == null ? 'Custo de aquisição não informado' : money(view.result)}</dd></div>}
    {!view.active && !view.sold && <div><dt>Data da baixa</dt><dd>{formatDate(asset.endedOn)}</dd></div>}
    {asset.description && <div><dt>Descrição</dt><dd>{asset.description}</dd></div>}
    {asset.notes && <div><dt>Observações</dt><dd>{asset.notes}</dd></div>}
    {asset.accountId && <div><dt>Incluído na conta</dt><dd>{data.accounts.find(row => row._id === asset.accountId)?.name ?? 'Conta não disponível'}</dd></div>}
    {view.active && asset.reviewOn && <div><dt>Revisar valor em</dt><dd>{formatDate(asset.reviewOn)}</dd></div>}
  </dl>
}

function AssetManager({ asset, initialView = 'home', onClose }) {
  const { busy, error, feedback, mutate } = useLedger()
  const [view, setView] = useState(initialView)
  const dialog = useRef(null)
  const title = useRef(null)
  const active = asset && activeAsset(asset)
  const presentation = asset && assetPresentation(asset)
  const home = active ? 'home' : 'details'
  const titles = { home: asset?.name, details: asset?.name, edit: 'Editar bem', value: 'Atualizar valor', exit: 'Vender ou retirar',
    sale: 'Vender bem', retire: 'Retirar bem', history: 'Histórico do bem', advanced: 'Mais opções', purchase: 'Registrar compra' }
  useEffect(() => {
    const element = dialog.current
    const opener = document.activeElement
    element.showModal()
    return () => { element.close(); if (opener?.isConnected) opener.focus() }
  }, [])
  useEffect(() => { title.current?.focus() }, [view])
  const done = () => setView(activeAsset(asset) ? 'home' : 'details')
  return <dialog className="asset-dialog" ref={dialog} aria-labelledby="asset-panel-title" onKeyDown={event => {
    if (event.key !== 'Tab') return
    const controls = [...event.currentTarget.querySelectorAll('button:not([disabled]), a[href], input:not([type="hidden"]):not([disabled]), select:not([disabled]), summary, [tabindex="0"]')]
      .filter(element => element.getClientRects().length && (!element.checkVisibility || element.checkVisibility()))
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && (document.activeElement === first || document.activeElement === title.current)) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }} onCancel={event => {
    event.preventDefault(); if (!busy) onClose()
  }} onClick={event => { if (event.target === event.currentTarget && !busy) {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
  } }}>
    <div className="asset-dialog-content">
      <div className="asset-panel-bar">
        {asset && view !== home && <button className="text-link" type="button" disabled={busy} onClick={() => setView(home)}>← Voltar</button>}
        <button className="action-button" type="button" disabled={busy} onClick={onClose}>Fechar painel</button>
      </div>
      <header><h2 id="asset-panel-title" tabIndex={-1} ref={title}>{asset ? titles[view] : 'Adicionar bem'}</h2>
        {asset && <p>{view === home ? assetKinds[asset.kind] : asset.name}</p>}</header>
      {error && <p role="alert">{error}</p>}
      {feedback && <p role="status">{feedback}</p>}
      {!asset ? <AssetEditor kinds={assetKinds} onDone={onClose} /> : <>
        {view === 'home' && <>
          <p className="asset-panel-value">{presentation.valuation ? money(presentation.valuation.value) : 'Aguardando avaliação'}</p>
          <nav className="asset-action-menu" aria-label="Gerenciar bem">
            <button type="button" onClick={() => setView('edit')}>Editar bem<span>Nome, categoria e informações</span></button>
            <button type="button" onClick={() => setView('value')}>Atualizar valor<span>Informar quanto vale hoje</span></button>
            <button type="button" onClick={() => setView('exit')}>{asset.kind === 'debt' ? 'Retirar bem' : 'Vender ou retirar'}<span>Retirar da lista de bens ativos</span></button>
            <button type="button" onClick={() => setView('history')}>Ver histórico</button>
            <button type="button" onClick={() => setView('advanced')}>Mais opções</button>
          </nav>
        </>}
        {view === 'edit' && <AssetEditor asset={asset} kinds={assetKinds} onDone={done} />}
        {view === 'value' && <ValuationForm asset={asset} onDone={done} />}
        {view === 'exit' && <div className="asset-action-menu">
          {asset.kind !== 'debt' && <button type="button" onClick={() => setView('sale')}>Vender<span>Informar a venda e como vai receber</span></button>}
          <button type="button" onClick={() => setView('retire')}>Retirar bem<span>Retirar um bem que você não possui mais, sem registrar uma venda</span></button>
        </div>}
        {view === 'sale' && <SaleWizard asset={asset} onDone={() => setView('details')} />}
        {view === 'retire' && <AssetOperationForm asset={asset} initialType="retire" onDone={() => setView('details')} />}
        {view === 'purchase' && <AssetOperationForm asset={asset} initialType={asset.purchase?.date ? 'sale' : 'purchase'} onDone={type => setView(type === 'sale' ? 'details' : 'home')} />}
        {view === 'details' && <>
          {presentation.sold && asset.sale?.date ? <AssetReceiptPanel key={saleKey(asset.sale)} asset={asset} /> : <>
            <p>Situação: Baixado · {formatDate(asset.endedOn)}</p><p>Este bem está fora do patrimônio ativo.</p>
          </>}
          <details className="asset-additional"><summary>Informações do bem</summary><AssetInformation asset={asset} /></details>
          <button type="button" className="action-button" onClick={() => setView('history')}>Ver histórico do bem</button>
        </>}
        {view === 'history' && <><ValuationHistory asset={asset} />{presentation.sold && <AssetSaleHistory asset={asset} />}</>}
        {view === 'advanced' && <>
          <AssetInformation asset={asset} />
          <div className="asset-action-menu">
            {active && asset.kind !== 'debt' && <button type="button" onClick={() => setView('purchase')}>{asset.purchase?.date ? 'Vincular uma venda já recebida' : 'Registrar compra ou vincular lançamento'}</button>}
            {active && <Link to={'/lembretes?bem=' + asset._id}>Criar lembrete</Link>}
          </div>
          {active && <RemoveRecord label="Excluir cadastro" message="Confirma a exclusão? Bens com histórico ou vínculos são protegidos." busy={busy}
            onRemove={async () => { if (await mutate('/assets/' + asset._id, 'DELETE')) onClose() }} />}
        </>}
      </>}
    </div>
  </dialog>
}

export default function AssetsPage() {
  const { data, error } = useLedger()
  const location = useLocation()
  const closedSection = useRef(null)
  const [selection, setSelection] = useState(null)
  const active = data.assets.filter(activeAsset)
  const closed = data.assets.filter(row => !activeAsset(row))
  const included = active.filter(row => !row.accountId && row.kind !== 'debt')
  const total = included.reduce((sum, row) => sum + (row.valuations[0]?.value ?? 0), 0)
  const cost = included.reduce((sum, row) => sum + (row.acquired ?? 0), 0)
  const variation = included.filter(row => row.acquired != null && row.valuations.length)
    .reduce((sum, row) => sum + row.valuations[0].value - row.acquired, 0)
  const selected = selection?.id && data.assets.find(row => row._id === selection.id)
  useEffect(() => {
    const id = location.hash.slice(1), asset = data.assets.find(row => row._id === id)
    if (!asset) return
    if (!activeAsset(asset) && closedSection.current) closedSection.current.open = true
    setSelection({ id, view: activeAsset(asset) ? 'home' : 'details' })
  }, [location.hash])
  function card(asset) {
    const view = assetPresentation(asset)
    const state = receiptState(asset, data.entries, localDay())
    return <article className="panel asset-card" id={asset._id} key={asset._id}>
      <div className="asset-card-heading"><h3>{asset.name}</h3><span className="asset-status">{asset.sale?.cancelledAt ? 'Venda cancelada' : view.status}</span></div>
      {view.active && <p className="asset-category">{assetKinds[asset.kind]}</p>}
      {view.active ? <p className="asset-card-value">{view.valuation ? money(view.valuation.value) : 'Aguardando avaliação'}</p> :
        view.sold && <p className="asset-card-value"><span>Valor de venda</span>{money(asset.sale.amount)}</p>}
      {!view.active && state && <p>Recebimento: {state.label}</p>}
      <button className="action-button" type="button" onClick={() => setSelection({ id: asset._id, view: view.active ? 'home' : 'details' })}>{view.active ? 'Gerenciar' : 'Ver detalhes'}<span className="sr-only"> {asset.name}</span></button>
    </article>
  }
  return <div className="assets-page">
    {error && !selection && <p className="module-notice" role="alert">{error}</p>}
    <section className="asset-overview panel">
      <div><p>Patrimônio total avaliado</p><strong>{money(total)}</strong><small>Somente bens ativos avaliados fora das contas.</small>
        <details className="asset-total-details"><summary>Sobre este total</summary>
          <p>Aquisições com valor informado: {money(cost)}. Variação dos bens com custo e avaliação: {money(variation)}.</p>
          <ul>{Object.entries(assetKinds).flatMap(([kind, name]) => {
            const rows = included.filter(row => row.kind === kind && row.valuations.length)
            return rows.length ? [<li key={kind}>{name}: {money(rows.reduce((sum, row) => sum + row.valuations[0].value, 0))}</li>] : []
          })}</ul>
          <p>Bens vendidos, baixados, dívidas e bens já incluídos em contas ficam fora deste total.</p>
        </details>
      </div>
      <button className="action-button asset-primary" type="button" onClick={() => setSelection({ id: null })}>Adicionar bem</button>
    </section>
    <section className="asset-section" aria-labelledby="active-assets-title"><h2 id="active-assets-title">Bens ativos <span>{active.length}</span></h2>
      {active.length ? <div className="asset-grid">{active.map(card)}</div> : <div className="panel asset-empty"><p>Seus bens aparecerão aqui.</p><p>Use “Adicionar bem” para começar.</p></div>}
    </section>
    {closed.length > 0 && <details className="asset-closed panel" ref={closedSection}><summary>Bens vendidos ou baixados <span>{closed.length}</span></summary>
      <div className="asset-grid">{closed.map(card)}</div>
    </details>}
    {selection && (selection.id == null || selected) && <AssetManager key={selection.id ?? 'new'} asset={selected} initialView={selection.view} onClose={() => setSelection(null)} />}
  </div>
}
