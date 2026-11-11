import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLedger } from '../LedgerContext.jsx'
import { formatDate, formatMoney, localDay, toCents } from '../ledgerFormat.js'
import { money } from '../ledgerFormat.js'
import { RemoveRecord, Table } from '../components/Details.jsx'
import { DateField, MoneyField, SmallIntegerField } from '../components/FinancialFields.jsx'
import ActionPanel from '../components/ActionPanel.jsx'

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

  return <section className="module-section">
    <form className="ledger-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <label>Nome do cartão<input name="name" required maxLength={120} defaultValue={card?.name} /></label>
        <MoneyField label="Limite" name="limit" required defaultValue={card && formatMoney(card.limit)} />
        <SmallIntegerField label="Dia de fechamento" name="close" readOnly={locked} defaultValue={card?.close} picker />
        <SmallIntegerField label="Dia de vencimento" name="due" readOnly={locked} defaultValue={card?.due} picker />
        <details><summary>Informações adicionais</summary><div className="module-options">
          <label>Instituição<input name="institution" maxLength={120} defaultValue={card?.institution} /></label>
          {card && <label className="ledger-check"><input name="archived" type="checkbox" defaultChecked={card.archived} /> Cartão arquivado</label>}
        </div></details>
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

function EventEditor({ card, accounts, initialType, onDone }) {
  const { busy, mutate } = useLedger()
  const type = initialType ?? (card.archived ? 'payment' : 'purchase')
  const [message, setMessage] = useState('')
  const activeAccounts = accounts.filter(row => !row.archived && !row.deletedAt)
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
    if (type === 'purchase') Object.assign(payload, { category: fields.get('category').trim() || 'Geral', installments: Number(fields.get('installments')) })
    if (type === 'refund') payload.purchaseId = fields.get('purchaseId')
    if (type === 'payment') Object.assign(payload, { invoice: fields.get('invoice'), accountId: fields.get('accountId') })
    if (await mutate('/cards/' + card._id + '/events', 'POST', payload)) onDone()
  }
  return <section className="module-section">
    <form className="ledger-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        {(type === 'purchase' || type === 'fee') && <label>Descrição<input name="description" required maxLength={120} /></label>}
        {type === 'purchase' && <details><summary>Categoria e parcelamento</summary><div className="module-options">
          <label>Categoria<input name="category" defaultValue="Geral" maxLength={120} /></label>
          <SmallIntegerField label="Parcelas" name="installments" max={60} defaultValue={1} />
        </div></details>}
        {type === 'refund' && <label>Compra original<select name="purchaseId" required><option value="">Selecione</option>
          {purchases.map(row => <option key={row._id} value={row._id}>{formatDate(row.date)} · {row.description} · {money(row.amount)}</option>)}
        </select></label>}
        {type === 'payment' && <>
          <label>Fatura<select name="invoice" required defaultValue={invoices[0]?.month}><option value="">Selecione</option>{invoices.map(row => <option key={row.month} value={row.month}>{row.month} · {money(row.remaining)}</option>)}</select></label>
          <label>Conta do pagamento<select name="accountId" required><option value="">Selecione</option>{activeAccounts.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></label>
        </>}
        <MoneyField label="Valor" name="amount" required />
        <DateField label="Data" name="date" required defaultValue={localDay()} max={localDay()} />
        <div className="ledger-actions"><button className="action-button" disabled={cannotPay || cannotRefund}>{busy ? 'Registrando…' : 'Registrar ' + eventNames[type].toLowerCase()}</button></div>
      </fieldset>
    </form>
    {cannotPay && <p>Para registrar um pagamento, selecione uma conta ativa e uma fatura com saldo.</p>}
    {type === 'payment' && <p>Você pode pagar uma parte ou o valor total. O pagamento sai da conta sem repetir o gasto da compra.</p>}
    {cannotRefund && <p>Registre uma compra para poder lançar um estorno.</p>}
    {message && <p role="alert">{message}</p>}
  </section>
}

const invoiceColumns = [
  { key: 'month', label: 'Mês da fatura' }, { key: 'dueOn', label: 'Vencimento', render: row => formatDate(row.dueOn) },
  { key: 'remaining', label: 'Falta pagar', render: row => money(row.remaining) }, { key: 'status', label: 'Situação' },
]
const technicalColumns = [...invoiceColumns, { key: 'closedOn', label: 'Fechamento', render: row => formatDate(row.closedOn) },
  ...[['charges', 'Lançamentos'], ['refunds', 'Estornos'], ['creditApplied', 'Crédito anterior'], ['paid', 'Pago']].map(([key, label]) => ({ key, label, render: row => money(row[key]) }))]

export default function CardsPage() {
  const { data, busy, error, mutate } = useLedger()
  const [params] = useSearchParams()
  const [panel, setPanel] = useState(() => params.has('cartao') ? { id: params.get('cartao'), view: 'invoices' } : null)
  const card = panel?.id && data.cards.find(row => row._id === panel.id)
  const close = () => setPanel(null)
  const open = (row, view) => setPanel({ id: row._id, view })
  const eventRows = card?.events.filter(row => row.type !== 'payment') ?? []
  const payments = card?.events.filter(row => row.type === 'payment') ?? []
  const tiles = rows => rows.map(row => {
    const bill = row.invoices.find(bill => bill.status !== 'Futura' && bill.remaining > 0)
    return <article className="panel module-card" key={row._id} id={row._id}>
      <h3>{row.name}</h3><p className="module-muted">Limite disponível</p><p className="card-value">{money(row.available)}</p>
      <p>{bill ? 'Fatura a pagar: ' + money(bill.remaining) : 'Nenhuma fatura em aberto'}</p>
      <p className="module-muted">{bill ? 'Vence em ' + formatDate(bill.dueOn) + ' · ' + bill.status : row.deletedAt ? 'Cartão excluído' : row.archived ? 'Cartão arquivado' : 'Sem pagamento pendente'}</p>
      <div className="module-card-actions">
        {!row.archived && !row.deletedAt && <button className="action-button" type="button" onClick={() => open(row, 'purchase')}>Registrar compra</button>}
        <button className="action-button" type="button" onClick={() => open(row, 'invoices')}>Ver fatura</button>
        {bill && !row.deletedAt && <button className="action-button" type="button" onClick={() => open(row, 'payment')}>Pagar fatura</button>}
        <button className="action-button" type="button" onClick={() => open(row, 'manage')}>Gerenciar cartão</button>
      </div>
    </article>
  })
  return <div className="module-page">
    {error && !panel && <p role="alert">{error}</p>}
    <div className="module-heading"><h2>Seus cartões</h2><button className="action-button asset-primary" type="button" onClick={() => setPanel({ view: 'new' })}>Adicionar cartão</button></div>
    {data.cards.some(row => !row.deletedAt && !row.archived) ? <div className="module-grid">{tiles(data.cards.filter(row => !row.deletedAt && !row.archived))}</div> : <p className="empty-state">Adicione um cartão para acompanhar compras e faturas.</p>}
    {data.cards.some(row => row.archived || row.deletedAt) && <details><summary>Cartões arquivados ou excluídos</summary><div className="module-grid">{tiles(data.cards.filter(row => row.archived || row.deletedAt))}</div></details>}
    {panel && <ActionPanel title={panel.view === 'new' ? 'Adicionar cartão' : panel.view === 'edit' ? 'Editar cartão' : panel.view === 'purchase' ? 'Registrar compra' : panel.view === 'payment' ? 'Pagar fatura' : panel.view === 'refund' ? 'Registrar estorno' : panel.view === 'fee' ? 'Registrar encargo' : card?.name ?? 'Cartão'} onClose={close}>
      {panel.view === 'new' || panel.view === 'edit' ? <CardEditor card={card || undefined} onDone={close} /> : !card ? <p>Cartão não encontrado.</p> : ['purchase', 'payment', 'refund', 'fee'].includes(panel.view) ?
        <EventEditor key={panel.view} card={card} accounts={data.accounts} initialType={panel.view} onDone={close} /> : panel.view === 'invoices' ? <>
          <h3>Faturas</h3><Table compact label="Faturas mensais" rows={card.invoices.slice().reverse().map(row => ({ ...row, id: row.month }))} columns={invoiceColumns} />
          <details><summary>Mais opções e histórico</summary><div className="module-options">
            <button className="action-button" type="button" onClick={() => open(card, 'events')}>Compras e lançamentos</button>
            <button className="action-button" type="button" onClick={() => open(card, 'payments')}>Pagamentos</button>
            <Table compact label="Detalhes das faturas" rows={card.invoices.map(row => ({ ...row, id: row.month }))} columns={technicalColumns} />
          </div></details>
        </> : ['events', 'payments'].includes(panel.view) ? <>
          <button className="text-link" type="button" onClick={() => open(card, 'invoices')}>Voltar às faturas</button>
          <Table compact label={panel.view === 'payments' ? 'Histórico de pagamentos' : 'Compras e ajustes'} rows={(panel.view === 'payments' ? payments : eventRows).slice().reverse().map(row => ({ ...row, id: row._id }))} columns={[
            { key: 'date', label: 'Data', render: row => formatDate(row.date) }, { key: 'type', label: 'Operação', render: row => eventNames[row.type] },
            { key: 'description', label: 'Descrição', render: row => row.description ?? row.invoice ?? card.events.find(event => event._id === row.purchaseId)?.description ?? '—' },
            { key: 'amount', label: 'Valor', render: row => money(row.amount) },
            { key: 'installments', label: 'Parcelas', render: row => row.installments ?? '—' },
            { key: 'account', label: 'Conta', render: row => data.accounts.find(account => account._id === row.accountId)?.name ?? '—' },
          ]} />
        </> : <>
          <dl className="module-facts">{[['Limite total', money(card.limit)], ['Limite utilizado', money(card.used)], ['Crédito disponível', money(card.credit)], ['Próximo fechamento', formatDate(card.nextClose)], ['Próximo vencimento', formatDate(card.nextDue)], ['Instituição', card.institution || 'Não informada']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          {!card.deletedAt && <button className="action-button" type="button" onClick={() => open(card, 'edit')}>Editar informações</button>}
          <details><summary>Mais opções</summary><div className="module-options">
            {!card.deletedAt && <><button className="action-button" type="button" onClick={() => open(card, 'refund')}>Registrar estorno</button>
              {!card.archived && <button className="action-button" type="button" onClick={() => open(card, 'fee')}>Registrar encargo</button>}
              <RemoveRecord label="Excluir cartão" message="Excluir o cartão? Faturas e histórico serão preservados; valores pendentes impedem a exclusão." busy={busy} onRemove={async () => { if (await mutate('/cards/' + card._id, 'DELETE')) close() }} />
            </>}
            <button className="action-button" type="button" onClick={() => open(card, 'events')}>Compras e lançamentos</button><button className="action-button" type="button" onClick={() => open(card, 'payments')}>Pagamentos</button>
          </div></details>
        </>}
    </ActionPanel>}
  </div>
}
