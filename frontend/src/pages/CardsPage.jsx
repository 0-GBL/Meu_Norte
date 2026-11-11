import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CreditCard, History, Plus, ReceiptText } from 'lucide-react'
import { useLedger } from '../LedgerContext.jsx'
import { formatDate, formatMoney, localDay, toCents } from '../ledgerFormat.js'
import { money } from '../ledgerFormat.js'
import { ProgressBar, RemoveRecord, Table } from '../components/Details.jsx'
import { DateField, MoneyField, SmallIntegerField } from '../components/FinancialFields.jsx'

const eventNames = { purchase: 'Compra', payment: 'Pagamento', refund: 'Estorno', fee: 'Encargo' }

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
      name: fields.get('name'), institution: fields.get('institution').trim(), limit, close: locked ? card.close : Number(fields.get('close')),
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
        <label>Instituição<input name="institution" maxLength={120} defaultValue={card?.institution} /></label>
        <MoneyField label="Limite" name="limit" required defaultValue={card && formatMoney(card.limit)} />
        <SmallIntegerField label="Dia de fechamento" name="close" readOnly={locked} defaultValue={card?.close} picker />
        <SmallIntegerField label="Dia de vencimento" name="due" readOnly={locked} defaultValue={card?.due} picker />
        {card && <label className="ledger-check"><input name="archived" type="checkbox" defaultChecked={card.archived} /> Cartão arquivado</label>}
        <div className="ledger-actions">
          <button className="action-button">{busy ? 'Salvando…' : 'Salvar cartão'}</button>
          <button type="button" className="action-button" onClick={onDone}>Cancelar</button>
        </div>
      </fieldset>
    </form>
    {locked && <p>Os dias da fatura ficam fixos após o primeiro lançamento para preservar o histórico.</p>}
    <details><summary>Como funcionam os dias da fatura?</summary>
      <p>O fechamento encerra o ciclo de compras. O vencimento é a data limite para pagar. Em meses mais curtos, usamos o último dia do mês quando necessário.</p>
    </details>
    {message && <p role="alert">{message}</p>}
  </section>
}

function EventEditor({ card, accounts, initialType }) {
  const { busy, mutate } = useLedger()
  const [type, setType] = useState(initialType ?? (card.archived ? 'payment' : 'purchase'))
  const [message, setMessage] = useState('')
  const activeAccounts = accounts.filter(row => !row.archived)
  const purchases = card.events.filter(row => row.type === 'purchase')
  const invoices = card.invoices.filter(row => row.remaining > 0 && row.status !== 'Futura')
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
          <SmallIntegerField label="Parcelas" name="installments" max={60} defaultValue={1} />
        </>}
        {type === 'refund' && <label>Compra original<select name="purchaseId" required><option value="">Selecione</option>
          {purchases.map(row => <option key={row._id} value={row._id}>{formatDate(row.date)} · {row.description} · {money(row.amount)}</option>)}
        </select></label>}
        {type === 'payment' && <>
          <label>Fatura<select name="invoice" required><option value="">Selecione</option>{invoices.map(row => <option key={row.month} value={row.month}>{row.month} · {money(row.remaining)}</option>)}</select></label>
          <label>Conta do pagamento<select name="accountId" required><option value="">Selecione</option>{activeAccounts.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></label>
        </>}
        <MoneyField label="Valor" name="amount" required />
        <DateField label="Data" name="date" required defaultValue={localDay()} max={localDay()} />
        <div className="ledger-actions"><button className="action-button" disabled={cannotPay || cannotRefund}>{busy ? 'Registrando…' : 'Registrar ' + eventNames[type].toLowerCase()}</button></div>
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

function CreditTile({ card, selected, onSelect }) {
  const Tile = onSelect ? 'button' : 'article'
  return <Tile className="credit-tile" {...(onSelect && { type: 'button', 'aria-pressed': selected, onClick: onSelect })}>
    <span className="credit-tile-header">
      <span><strong>{card.name}</strong><small>{card.institution || 'Cartão de crédito'}{card.deletedAt ? ' · Excluído' : card.archived ? ' · Arquivado' : ''}</small></span>
      <CreditCard size={22} aria-hidden="true" />
    </span>
    <span className="credit-available"><small>Limite disponível</small><strong>{money(card.available)}</strong></span>
    <span className="credit-usage"><small>Utilização do limite</small><strong>{Math.round(card.used / card.limit * 100)}%</strong></span>
    <ProgressBar label={'Limite utilizado de ' + card.name} current={card.used} target={card.limit} />
    <span className="credit-tile-meta"><span><small>Limite total</small><strong>{money(card.limit)}</strong></span><span><small>Utilizado</small><strong>{money(card.used)}</strong></span></span>
    <span className="credit-tile-cycle">
      <span><small>Próximo fechamento</small><strong>{card.nextClose ? formatDate(card.nextClose) : 'Dia ' + card.close}</strong></span>
      <span><small>Próximo vencimento</small><strong>{card.nextDue ? formatDate(card.nextDue) : 'Dia ' + card.due}</strong></span>
    </span>
  </Tile>
}

export default function CardsPage() {
  const { data, error, busy, mutate } = useLedger()
  const [params] = useSearchParams()
  const [selected, setSelected] = useState(() => params.get('cartao') ?? '')
  const [editor, setEditor] = useState(null)
  const [section, setSection] = useState('invoices')
  const [initialType, setInitialType] = useState(undefined)
  const card = data.cards.find(row => row._id === selected) ?? data.cards.find(row => !row.deletedAt) ?? data.cards[0]
  const payments = card?.events.filter(row => row.type === 'payment').slice().reverse() ?? []
  const activity = card?.events.filter(row => row.type !== 'payment').slice().reverse() ?? []
  const eventColumns = [
    { key: 'date', label: 'Data', render: row => formatDate(row.date) },
    { key: 'type', label: 'Operação', render: row => eventNames[row.type] },
    { key: 'description', label: 'Detalhe', render: row => row.description ?? (row.invoice ? 'Fatura ' + row.invoice : card.events.find(event => event._id === row.purchaseId)?.description) },
    { key: 'installments', label: 'Parcelas', render: row => row.installments ?? '—' },
    { key: 'amount', label: 'Valor', render: row => money(row.amount) },
  ]

  return <div className="ledger-stack">
    {error && <p className="module-notice" role="alert">{error}</p>}
    <div className="card-section-heading card-overview">
      <div><h2>Seus cartões</h2><p>Consulte limites e as próximas datas de cada cartão.</p></div>
      <button type="button" className="action-button" disabled={busy} onClick={() => setEditor('new')}><Plus size={16} aria-hidden="true" /> Novo cartão</button>
    </div>
    {editor && <CardEditor key={editor} card={editor === 'edit' ? card : null} onDone={() => setEditor(null)} />}
    {!card && !editor && <section className="panel detail-panel"><p>Cadastre um cartão para acompanhar compras, limites e faturas.</p></section>}
    <div className="credit-card-grid">
      {data.cards.map(row => <CreditTile key={row._id} card={row} selected={card?._id === row._id} onSelect={() => {
        setSelected(row._id)
        setEditor(null)
        setInitialType(undefined)
        setSection('invoices')
      }} />)}
    </div>
    {card && <>
      <section className="panel detail-panel">
        <div className="card-section-heading"><h2>{card.name}</h2>
          {card.credit > 0 && <p>Crédito disponível de {money(card.credit)}</p>}
        </div>
        <div className="ledger-actions card-view-switch" aria-label="Seções do cartão">
          <button className="action-button" type="button" aria-pressed={section === 'invoices'} onClick={() => setSection('invoices')}><ReceiptText size={16} aria-hidden="true" /> Faturas</button>
          <button className="action-button" type="button" aria-pressed={section === 'events'} onClick={() => { setInitialType(undefined); setSection('events') }}><CreditCard size={16} aria-hidden="true" /> Compras e lançamentos</button>
          <button className="action-button" type="button" aria-pressed={section === 'payments'} onClick={() => setSection('payments')}><History size={16} aria-hidden="true" /> Pagamentos</button>
        </div>
        {card.deletedAt ? <p>Histórico de um cartão excluído.</p> : <div className="ledger-actions">
          <button className="action-button" type="button" disabled={busy} onClick={() => { setEditor('edit'); document.getElementById('conteudo').scrollIntoView() }}>Editar cartão</button>
          <RemoveRecord key={card._id} label="Excluir cartão" message="Excluir este cartão e manter seu histórico?" busy={busy} onRemove={async () => {
            if (await mutate('/cards/' + card._id, 'DELETE')) setEditor(null)
          }} />
        </div>}
      </section>
      {section === 'invoices' ? <section className="panel detail-panel">
        <h2>Faturas mensais</h2>
        {!card.deletedAt && card.invoices.some(row => row.remaining > 0 && row.status !== 'Futura') &&
          <button className="action-button" type="button" onClick={() => { setInitialType('payment'); setSection('events') }}>Registrar pagamento</button>}
        {card.invoices.length ? <Table compact label="Faturas mensais" columns={invoiceColumns} rows={card.invoices.slice().reverse().map(row => ({ ...row, id: row.month }))} /> : <p>As faturas aparecem após o primeiro lançamento.</p>}
      </section> : section === 'payments' ? <section className="panel detail-panel">
        <h2>Histórico de pagamentos</h2>
        {payments.length ? <Table compact label="Histórico de pagamentos" rows={payments.map(row => ({ ...row, id: row._id }))} columns={[
          { key: 'date', label: 'Data', render: row => formatDate(row.date) },
          { key: 'invoice', label: 'Fatura' },
          { key: 'account', label: 'Conta', render: row => data.accounts.find(account => account._id === row.accountId)?.name ?? 'Conta' },
          { key: 'amount', label: 'Valor', render: row => money(row.amount) },
        ]} /> : <p>Os pagamentos registrados aparecem aqui.</p>}
      </section> : <>
      {!card.deletedAt && <EventEditor key={card._id + card.archived + initialType} card={card} accounts={data.accounts} initialType={initialType} />}
      <section className="panel detail-panel">
        <h2>Histórico do cartão</h2>
        {activity.length ? <Table compact label="Histórico do cartão" columns={eventColumns} rows={activity.map(row => ({ ...row, id: row._id }))} /> : <p>As compras, parcelas e outros lançamentos aparecem aqui.</p>}
      </section>
      </>}
    </>}
  </div>
}
