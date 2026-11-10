import { useState } from 'react'
import { useLedger } from '../LedgerContext.jsx'
import { localDay, toCents } from '../ledgerFormat.js'
import { money } from '../demo/finance.js'
import { Table } from '../components/Details.jsx'

const eventNames = { purchase: 'Compra', payment: 'Pagamento', refund: 'Estorno', fee: 'Encargo' }
const formatDate = date => date.split('-').reverse().join('/')

function CardEditor({ card, onDone }) {
  const { busy, mutate } = useLedger()
  const [message, setMessage] = useState('')
  const locked = Boolean(card?.events.length)
  const submit = async event => {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const limit = toCents(fields.get('limit'))
    if (!limit || limit < 0) return setMessage('Informe um limite positivo com até duas casas decimais.')
    setMessage('')
    const payload = {
      name: fields.get('name'), limit, close: locked ? card.close : Number(fields.get('close')),
      due: locked ? card.due : Number(fields.get('due')), archived: fields.get('archived') === 'on',
    }
    if (await mutate(card ? '/cards/' + card._id : '/cards', card ? 'PUT' : 'POST', payload)) {
      form.reset()
      onDone()
    }
  }

  return <section className="panel detail-panel">
    <h2>{card ? 'Editar cartão' : 'Novo cartão'}</h2>
    <form className="ledger-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <label>Nome do cartão<input name="name" required maxLength={120} defaultValue={card?.name} /></label>
        <label>Limite (R$)<input name="limit" required inputMode="decimal" defaultValue={card && (card.limit / 100).toFixed(2).replace('.', ',')} /></label>
        <label>Dia de fechamento<input name="close" type="number" min="1" max="31" required readOnly={locked} defaultValue={card?.close} /></label>
        <label>Dia de vencimento<input name="due" type="number" min="1" max="31" required readOnly={locked} defaultValue={card?.due} /></label>
        {card && <label className="ledger-check"><input name="archived" type="checkbox" defaultChecked={card.archived} /> Cartão arquivado</label>}
        <div className="ledger-actions">
          <button className="action-button">Salvar cartão</button>
          {card && <button type="button" className="action-button" onClick={onDone}>Cancelar</button>}
        </div>
      </fieldset>
    </form>
    {locked && <p>Os dias da fatura ficam fixos após o primeiro lançamento para preservar o histórico.</p>}
    {message && <p role="alert">{message}</p>}
  </section>
}

function EventEditor({ card, accounts }) {
  const { busy, mutate } = useLedger()
  const [type, setType] = useState(card.archived ? 'payment' : 'purchase')
  const [message, setMessage] = useState('')
  const activeAccounts = accounts.filter(row => !row.archived)
  const purchases = card.events.filter(row => row.type === 'purchase')
  const invoices = card.invoices.filter(row => row.remaining > 0)
  const cannotPay = type === 'payment' && (!activeAccounts.length || !invoices.length)
  const cannotRefund = type === 'refund' && !purchases.length
  const submit = async event => {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const amount = toCents(fields.get('amount'))
    if (!amount || amount < 0) return setMessage('Informe um valor positivo com até duas casas decimais.')
    setMessage('')
    const payload = { type, amount, date: fields.get('date') }
    if (type === 'purchase' || type === 'fee') payload.description = fields.get('description')
    if (type === 'purchase') Object.assign(payload, { category: fields.get('category'), installments: Number(fields.get('installments')) })
    if (type === 'refund') payload.purchaseId = fields.get('purchaseId')
    if (type === 'payment') Object.assign(payload, { invoice: fields.get('invoice'), accountId: fields.get('accountId') })
    if (await mutate('/cards/' + card._id + '/events', 'POST', payload)) form.reset()
  }
  return <section className="panel detail-panel">
    <h2>Novo lançamento</h2>
    <form className="ledger-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <label>Operação<select value={type} onChange={event => { setType(event.target.value); setMessage('') }}>
          {Object.entries(eventNames).filter(([key]) => !card.archived || ['payment', 'refund'].includes(key))
            .map(([key, name]) => <option key={key} value={key}>{name}</option>)}
        </select></label>
        {(type === 'purchase' || type === 'fee') && <label>Descrição<input name="description" required maxLength={120} /></label>}
        {type === 'purchase' && <>
          <label>Categoria<input name="category" required maxLength={120} /></label>
          <label>Parcelas<input name="installments" type="number" min="1" max="60" required defaultValue="1" /></label>
        </>}
        {type === 'refund' && <label>Compra original<select name="purchaseId" required><option value="">Selecione</option>
          {purchases.map(row => <option key={row._id} value={row._id}>{formatDate(row.date)} · {row.description} · {money(row.amount)}</option>)}
        </select></label>}
        {type === 'payment' && <>
          <label>Fatura<select name="invoice" required><option value="">Selecione</option>{invoices.map(row => <option key={row.month} value={row.month}>{row.month} · {money(row.remaining)}</option>)}</select></label>
          <label>Conta do pagamento<select name="accountId" required><option value="">Selecione</option>{activeAccounts.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></label>
        </>}
        <label>Valor (R$)<input name="amount" required inputMode="decimal" /></label>
        <label>Data<input name="date" type="date" required defaultValue={localDay()} max={localDay()} /></label>
        <div className="ledger-actions"><button className="action-button" disabled={cannotPay || cannotRefund}>Registrar {eventNames[type].toLowerCase()}</button></div>
      </fieldset>
    </form>
    {cannotPay && <p>Para registrar um pagamento, selecione uma conta ativa e uma fatura com saldo.</p>}
    {cannotRefund && <p>Registre uma compra para poder lançar um estorno.</p>}
    {message && <p role="alert">{message}</p>}
  </section>
}

const invoiceColumns = [
  { key: 'month', label: 'Ciclo' },
  { key: 'closedOn', label: 'Fechamento', render: row => formatDate(row.closedOn) },
  { key: 'dueOn', label: 'Vencimento', render: row => formatDate(row.dueOn) },
  { key: 'charges', label: 'Lançamentos', render: row => money(row.charges) },
  { key: 'refunds', label: 'Estornos', render: row => money(row.refunds) },
  { key: 'creditApplied', label: 'Crédito anterior', render: row => money(row.creditApplied) },
  { key: 'paid', label: 'Pago', render: row => money(row.paid) },
  { key: 'remaining', label: 'Em aberto', render: row => money(row.remaining) },
  { key: 'status', label: 'Situação' },
]

export default function CardsPage() {
  const { data, error } = useLedger()
  const [selected, setSelected] = useState('')
  const [editing, setEditing] = useState(false)
  const card = data.cards.find(row => row._id === selected) ?? data.cards[0]
  const eventColumns = [
    { key: 'date', label: 'Data', render: row => formatDate(row.date) },
    { key: 'type', label: 'Operação', render: row => eventNames[row.type] },
    { key: 'description', label: 'Detalhe', render: row => row.description ?? (row.invoice ? 'Fatura ' + row.invoice : card.events.find(event => event._id === row.purchaseId)?.description) },
    { key: 'installments', label: 'Parcelas', render: row => row.installments ?? '—' },
    { key: 'amount', label: 'Valor', render: row => money(row.amount) },
  ]

  return <div className="ledger-stack">
    {error && <p className="demo-notice" role="alert">{error}</p>}
    <CardEditor key={editing ? card?._id : 'new'} card={editing ? card : null} onDone={() => setEditing(false)} />
    {card && <>
      <section className="panel detail-panel">
        <h2>Seus cartões</h2>
        <div className="filters">
          <label>Cartão<select value={card._id} onChange={event => { setSelected(event.target.value); setEditing(false) }}>
            {data.cards.map(row => <option key={row._id} value={row._id}>{row.name}{row.archived ? ' · Arquivado' : ''}</option>)}
          </select></label>
        </div>
        <div className="ledger-actions">
          <span>Limite total <strong>{money(card.limit)}</strong></span>
          <span>Disponível <strong>{money(card.available)}</strong></span>
          {card.credit > 0 && <span>Crédito <strong>{money(card.credit)}</strong></span>}
        </div>
        <button className="action-button" type="button" onClick={() => { setEditing(true); document.getElementById('conteudo').scrollIntoView() }}>Editar cartão</button>
      </section>
      <EventEditor key={card._id + card.archived} card={card} accounts={data.accounts} />
      <section className="panel detail-panel">
        <h2>Faturas mensais</h2>
        {card.invoices.length ? <Table label="Faturas mensais" columns={invoiceColumns} rows={card.invoices.slice().reverse().map(row => ({ ...row, id: row.month }))} /> : <p>As faturas aparecem após o primeiro lançamento.</p>}
      </section>
      <section className="panel detail-panel">
        <h2>Histórico do cartão</h2>
        {card.events.length ? <Table label="Histórico do cartão" columns={eventColumns} rows={card.events.slice().reverse().map(row => ({ ...row, id: row._id }))} /> : <p>Os lançamentos do cartão aparecerão aqui.</p>}
      </section>
    </>}
  </div>
}
