import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLedger } from '../LedgerContext.jsx'
import { DateField, MoneyField } from './FinancialFields.jsx'
import { Table } from './Details.jsx'
import { formatDate, localDay, money, toCents } from '../ledgerFormat.js'
import { receiptState, saleKey } from '../../../shared/assetReceipts.mjs'
import './AssetReceiptPanel.css'

const actions = { sale: 'Venda registrada', schedule: 'Previsão alterada', confirm: 'Recebimento confirmado', link: 'Recebimento existente vinculado',
  reverse: 'Lançamento financeiro cancelado', cancel: 'Venda cancelada', correct: 'Nova venda por correção', reminder: 'Lembrete atualizado' }

export default function AssetReceiptPanel({ asset }) {
  const { data, busy, mutate } = useLedger()
  const [pending, setPending] = useState(null)
  const [message, setMessage] = useState('')
  const sale = asset.sale, today = localDay()
  const state = receiptState(asset, data.entries, today)
  const accountName = id => data.accounts.find(row => row._id === id)?.name ?? 'Conta não disponível'
  const eligible = data.entries.filter(row => row.type === 'income' && !row.cancelledAt && !row.assetId && !row.assetOperation && !row.goalId &&
    row.amount === sale.amount && row.date >= sale.date && row.date <= today &&
    data.accounts.some(account => account._id === row.accountId && !account.archived && !account.deletedAt))
  const accounts = data.accounts.filter(row => !row.archived && !row.deletedAt)
  const waiting = !sale.entryId && state.status !== 'cancelled'
  const submit = async payload => {
    if (await mutate('/assets/' + asset._id + '/receipt', 'POST', { ...payload, saleKey: saleKey(sale) })) {
      setPending(null)
      setMessage('')
    }
  }
  function prepare(event, action) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const payload = { action, confirmed: true }
    if (action === 'confirm') Object.assign(payload, { accountId: fields.get('accountId'), date: fields.get('date') })
    if (action === 'link') payload.entryId = fields.get('entryId')
    if (['reverse', 'cancel', 'correct'].includes(action)) payload.reason = fields.get('reason').trim()
    if (action === 'correct') {
      const amount = toCents(fields.get('amount'))
      if (!(amount > 0)) return setMessage('Informe um valor positivo para a nova venda.')
      Object.assign(payload, { amount, date: fields.get('date') })
    }
    setMessage('')
    setPending(payload)
  }
  return <section className="asset-receipt-panel" aria-label={'Recebimento de ' + asset.name}>
    <h3>Pagamento da venda</h3>
    <p className={'receipt-state receipt-' + state.status}><strong>Situação do recebimento: {state.label}</strong></p>
    <label>Valor da venda · bloqueado<input aria-label="Valor da venda bloqueado" readOnly value={money(sale.amount)} /></label>
    <p>Data da venda: {formatDate(sale.date)} · Previsão de recebimento: {sale.expectedOn ? formatDate(sale.expectedOn) : 'Não informada'}</p>
    {state.status === 'received' && <p>Data efetiva: {formatDate(state.entry.date)} · Conta de destino: {accountName(state.entry.accountId)} ·
      {state.entry.assetReceiptSource === 'existing' ? ' Vinculado a lançamento existente' : ' Recebimento vinculado'}.
      {' '}<Link className="text-link" to="/movimentacoes">Consultar movimentação</Link></p>}
    {state.status === 'overdue' && <p>A previsão passou. Você pode reagendar ou confirmar o pagamento quando ele ocorrer.</p>}
    {state.inconsistent && <p>O lançamento vinculado precisa ser revisado. A criação de outro recebimento está bloqueada.</p>}
    {waiting && <><details><summary>Alterar previsão de recebimento</summary>
      <form className="ledger-form" onSubmit={event => {
        event.preventDefault()
        const fields = new FormData(event.currentTarget)
        void submit({ action: 'schedule', expectedOn: fields.get('expectedOn') || null,
          remind: data.reminders.some(row => row.kind === 'assetReceipt' && row.linkId === asset._id && row.status === 'active') })
      }}><fieldset disabled={busy}>
        <DateField key={sale.expectedOn ?? 'empty'} label="Data prevista de recebimento" name="expectedOn" defaultValue={sale.expectedOn} min={sale.date} />
        <button className="action-button">Salvar previsão</button>
      </fieldset></form></details>
      <details><summary>Confirmar recebimento</summary>
        <form className="ledger-form" onSubmit={event => prepare(event, 'confirm')}><fieldset disabled={busy}>
          <label>Conta de destino<select name="accountId" required><option value="">Selecione</option>{accounts.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></label>
          <DateField label="Data efetiva do recebimento" name="date" defaultValue={today} min={sale.date} max={today} required />
          <button className="action-button">Revisar recebimento</button>
        </fieldset></form>
      </details>
    </>}
    <details className="receipt-advanced"><summary>Mais opções</summary>
      {waiting && <>
      <details><summary>Lembrete de recebimento</summary>
        {sale.expectedOn ? <form className="ledger-form" onSubmit={event => {
          event.preventDefault()
          void submit({ action: 'schedule', expectedOn: sale.expectedOn, remind: new FormData(event.currentTarget).has('remind') })
        }}><fieldset disabled={busy}>
          <label className="ledger-check"><input type="checkbox" name="remind" defaultChecked={data.reminders.some(row => row.kind === 'assetReceipt' && row.linkId === asset._id && row.status === 'active')} />Lembrar na data prevista</label>
          <button className="action-button">Salvar lembrete</button>
        </fieldset></form> : <p>Informe uma previsão de recebimento para criar um lembrete.</p>}
      </details>
      <details><summary>Usar um recebimento já registrado</summary>
        {eligible.length ? <form className="ledger-form" onSubmit={event => prepare(event, 'link')}><fieldset disabled={busy}>
          <label>Recebimento integral<select name="entryId" required><option value="">Selecione</option>{eligible.map(row => <option key={row._id} value={row._id}>{formatDate(row.date)} · {accountName(row.accountId)} · {row.description} · {money(row.amount)}</option>)}</select></label>
          <button className="action-button">Revisar vínculo</button>
        </fieldset></form> : <p>Nenhum recebimento integral elegível em conta ativa. Não será criada uma entrada ao vincular.</p>}
      </details>
      <details><summary>Cancelar operação de venda</summary>
        <p>O bem continuará fora do patrimônio ativo. A venda cancelada permanecerá no histórico. Você poderá registrar uma nova venda pelo fluxo de correção.</p>
        <form className="ledger-form" onSubmit={event => prepare(event, 'cancel')}><fieldset disabled={busy}>
          <label>Justificativa<input name="reason" required maxLength={120} /></label><button className="action-button">Revisar cancelamento</button>
        </fieldset></form>
      </details>
      </>}
    {state.status === 'received' && <details><summary>Tratar recebimento registrado incorretamente</summary>
      <p>O cancelamento da venda está bloqueado enquanto este recebimento estiver ativo. A ação abaixo cancela explicitamente o lançamento financeiro e recalcula o saldo, preservando a referência e a justificativa. Use somente após conferir o pagamento na conta.</p>
      <form className="ledger-form" onSubmit={event => prepare(event, 'reverse')}><fieldset disabled={busy}>
        <label>Justificativa do cancelamento financeiro<input name="reason" required maxLength={120} /></label>
        <button className="action-button">Revisar cancelamento do recebimento</button>
      </fieldset></form>
    </details>}
    {state.status === 'cancelled' && <details><summary>Registrar nova venda por correção</summary>
      <p>Justificativa do cancelamento: {sale.cancellationReason}. A operação original e seu custo serão preservados. A nova venda será informativa, sem recebimento automático.</p>
      <form className="ledger-form" onSubmit={event => prepare(event, 'correct')}><fieldset disabled={busy}>
        <MoneyField label="Valor da nova venda" name="amount" required />
        <DateField label="Data da nova venda" name="date" defaultValue={today} min={asset.acquiredOn} max={today} required />
        <label>Justificativa da correção<input name="reason" required maxLength={120} /></label>
        <button className="action-button">Revisar nova operação</button>
      </fieldset></form>
    </details>}
      <details><summary>Consultar histórico da venda e do recebimento</summary><AssetSaleHistory asset={asset} /></details>
    </details>
    {pending && <div className="receipt-confirmation" role="region" aria-label="Revisar operação patrimonial">
      <h4>Confirmar operação</h4>
      <p>{actions[pending.action]} · {money(pending.amount ?? sale.amount)}{pending.date && ' · ' + formatDate(pending.date)}{pending.accountId && ' · ' + accountName(pending.accountId)}</p>
      {pending.entryId && <p>Lançamento selecionado: {data.entries.find(row => row._id === pending.entryId)?.description} · Sem nova entrada financeira.</p>}
      {pending.action === 'reverse' && <p>Este cancelamento retira {money(sale.amount)} do saldo da conta. O lançamento original continuará no histórico como cancelado.</p>}
      {pending.reason && <p>Justificativa: {pending.reason}</p>}
      <div className="ledger-actions"><button type="button" className="action-button" disabled={busy} onClick={() => submit(pending)}>Confirmar operação</button>
        <button type="button" className="action-button" disabled={busy} onClick={() => setPending(null)}>Voltar</button></div>
    </div>}
    {message && <p role="alert">{message}</p>}
  </section>
}

export function AssetSaleHistory({ asset }) {
  const { data } = useLedger()
  const accountName = id => data.accounts.find(row => row._id === id)?.name ?? 'Conta não disponível'
  const rows = [...(asset.saleHistory ?? []), asset.sale].flatMap((operation, index) => [
    { id: index + ':original', action: 'sale', date: operation.date, amount: operation.amount,
      reason: operation.cancelledAt ? 'Operação cancelada preservada' : 'Valor original da operação' },
    ...(operation.history ?? []).filter(row => row.action !== 'sale').map((row, item) => ({ ...row, id: index + ':' + item })),
  ])
  return <Table compact label={'Operações de ' + asset.name} rows={rows} columns={[
        { key: 'action', label: 'Operação', render: row => actions[row.action] ?? row.action },
        { key: 'date', label: 'Data da operação', render: row => formatDate(row.date) || '—' },
        { key: 'recordedAt', label: 'Registrado em', render: row => row.recordedAt ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.recordedAt)) : 'Registro original' },
        { key: 'details', label: 'Detalhes', render: row => [row.amount != null && money(row.amount), row.action === 'schedule' && `Previsão: ${formatDate(row.previousDate) || 'Não informada'} → ${formatDate(row.nextDate) || 'Não informada'}`, row.action === 'reminder' && (row.enabled ? 'Lembrete ativado' : 'Lembrete desativado'), row.accountId && accountName(row.accountId), row.entryId && 'Lançamento: ' + row.entryId, row.reason].filter(Boolean).join(' · ') || '—' },
  ]} />
}
