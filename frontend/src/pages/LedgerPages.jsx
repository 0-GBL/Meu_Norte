import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLedger } from '../LedgerContext.jsx'
import { formatDate, localDay, toCents } from '../ledgerFormat.js'
import { money } from '../ledgerFormat.js'
import { RemoveRecord, Table } from '../components/Details.jsx'
import { DateField, MoneyField } from '../components/FinancialFields.jsx'

const types = { income: 'Receita', expense: 'Despesa', transfer: 'Transferência' }
const historyTypes = { ...types, cardPayment: 'Pagamento de fatura', cardPurchase: 'Compra no cartão', assetPurchase: 'Compra patrimonial', assetSale: 'Venda patrimonial' }
const expenseKinds = { fixed: 'Fixa', variable: 'Variável' }
const emptyAccount = { name: '', kind: '', initialBalance: '0', archived: false }

function useEditor(empty) {
  const [form, setForm] = useState(empty)
  const [validation, setValidation] = useState('')
  const reset = () => { setForm(empty); setValidation('') }
  const bind = key => ({ value: form[key] ?? '', onChange: event => setForm({ ...form, [key]: event.target.value }) })
  return { form, setForm, validation, setValidation, reset, bind }
}

export function LiveAccounts() {
  const { data, busy, error, mutate } = useLedger()
  const { form, setForm, validation, setValidation, reset, bind } = useEditor(emptyAccount)
  const editing = Boolean(form._id)
  const visibleAccounts = data.accounts.filter(row => !row.deletedAt)

  async function submit(event) {
    event.preventDefault()
    const element = event.currentTarget
    const initialBalance = editing ? null : toCents(new FormData(element).get('initialBalance'))
    if (!editing && initialBalance === null) return setValidation('Digite o saldo em reais com até duas casas decimais.')
    setValidation('')
    const { name, kind, archived } = form
    if (await mutate(editing ? '/accounts/' + form._id : '/accounts', editing ? 'PUT' : 'POST',
      editing ? { name, kind, archived } : { name, kind, initialBalance })) { element.reset(); reset() }
  }

  return <div className="ledger-stack">
    <section className="panel detail-panel">
      <h2>{editing ? 'Editar conta' : 'Nova conta'}</h2>
      <form className="ledger-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>Nome<input required maxLength={120} {...bind('name')} /></label>
          <label>Tipo de conta<input required maxLength={120} placeholder="Ex. Conta corrente" {...bind('kind')} /></label>
          {!editing && <MoneyField label="Saldo inicial" name="initialBalance" required negative zero defaultValue={emptyAccount.initialBalance} />}
          {editing && <label>Situação<select value={form.archived ? 'archived' : 'active'} onChange={event => setForm({ ...form, archived: event.target.value === 'archived' })}><option value="active">Ativa</option><option value="archived">Arquivada</option></select></label>}
          <div className="ledger-actions"><button className="action-button">Salvar conta</button>{editing && <button className="action-button" type="button" onClick={reset}>Cancelar</button>}</div>
        </fieldset>
      </form>
      {editing && <RemoveRecord label="Excluir conta" message="A conta sairá da lista. O histórico ficará disponível." busy={busy}
        onRemove={async () => { if (await mutate('/accounts/' + form._id, 'DELETE')) reset() }} />}
      {(validation || error) && <p role="alert">{validation || error}</p>}
    </section>
    <section className="panel detail-panel">
      <h2>Saldo consolidado · {money(data.total)}</h2>
      <p>Contas arquivadas continuam no saldo e no histórico. Elas ficam indisponíveis para novos registros.</p>
      {visibleAccounts.length ? <Table compact label="Contas cadastradas" rows={visibleAccounts.map(row => ({ ...row, id: row._id }))} columns={[
        { key: 'name', label: 'Conta', render: row => <span id={row._id}>{row.name}</span> }, { key: 'kind', label: 'Tipo' },
        { key: 'balance', label: 'Saldo', render: row => money(row.balance) },
        { key: 'status', label: 'Situação', render: row => row.archived ? 'Arquivada' : 'Ativa' },
        { key: 'actions', label: 'Ações', render: row => <button type="button" disabled={busy} className="text-link" aria-label={'Editar ' + row.name} onClick={() => { setForm(row); setValidation(''); document.getElementById('conteudo').scrollIntoView() }}>Editar</button> },
      ]} /> : <p>Adicione sua primeira conta para registrar movimentações.</p>}
    </section>
  </div>
}

function emptyEntry() {
  return { type: 'expense', description: '', amount: '', category: '', accountId: '', destinationId: '', expenseKind: 'variable', date: localDay() }
}

export function LiveEntries() {
  const { data, busy, error, mutate } = useLedger()
  const { form, setForm, validation, setValidation, reset, bind } = useEditor(emptyEntry)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [filters, setFilters] = useState({ query: '', type: '', category: '', account: '', month: '', status: '' })
  const [limit, setLimit] = useState(30)
  const editing = Boolean(form._id)
  const transfer = form.type === 'transfer'
  const accounts = data.accounts.filter(account => !account.deletedAt && (!account.archived || form.linkedAccounts?.includes(account._id)))
  const deleted = new Set(data.accounts.filter(row => row.deletedAt).map(row => row._id))
  const rowType = row => row.assetOperation === 'purchase' ? 'assetPurchase' : row.assetOperation === 'sale' ? 'assetSale' : row.type
  const paymentCards = new Map(data.cards.flatMap(card => card.events.filter(row => row.type === 'payment')
    .map(row => [row._id, { cardId: card._id, invoice: row.invoice }])))
  const history = [...data.entries, ...(data.cancelledEntries ?? []), ...data.cards.flatMap(card => card.events
    .filter(event => event.type === 'purchase').map(event => ({ ...event, type: 'cardPurchase', cardName: card.name })))]
    .sort((a, b) => b.date.localeCompare(a.date) || b._id.localeCompare(a._id))
  const categoryOptions = [...new Set(history.map(row => row.category).filter(Boolean))]
  const filtered = history.filter(row => (!filters.query || row.description.toLocaleLowerCase('pt-BR').includes(filters.query.trim().toLocaleLowerCase('pt-BR')))
    && (!filters.type || rowType(row) === filters.type)
    && (!filters.category || row.category === filters.category)
    && (!filters.account || row.accountId === filters.account || row.destinationId === filters.account)
    && (!filters.month || row.date.startsWith(filters.month))
    && (!filters.status || (row.cancelledAt ? 'cancelled' : 'recorded') === filters.status))
  const accountName = id => {
    const account = data.accounts.find(row => row._id === id)
    return account ? account.name + (account.deletedAt ? ' (conta excluída)' : '') : '—'
  }
  const filter = key => ({ value: filters[key], onChange: event => { setFilters({ ...filters, [key]: event.target.value }); setLimit(30) } })

  async function submit(event) {
    event.preventDefault()
    const element = event.currentTarget
    const fields = new FormData(element)
    const amount = toCents(fields.get('amount'))
    if (amount === null || amount <= 0) return setValidation('Digite um valor positivo com até duas casas decimais.')
    setValidation('')
    const { type, description, accountId, destinationId, category, expenseKind } = form
    const payload = { type, description, amount, date: fields.get('date'), accountId, ...(transfer ? { destinationId } : { category }),
      ...(type === 'expense' && { expenseKind }) }
    if (await mutate(editing ? '/entries/' + form._id : '/entries', editing ? 'PUT' : 'POST', payload)) { element.reset(); reset() }
  }

  function edit(row) {
    setForm({ ...emptyEntry(), ...row, amount: (row.amount / 100).toFixed(2).replace('.', ','), linkedAccounts: [row.accountId, row.destinationId] })
    setValidation('')
    document.getElementById('conteudo').scrollIntoView()
  }

  return <div className="ledger-stack">
    <section className="panel detail-panel"><h2>{editing ? 'Editar movimentação' : 'Nova movimentação'}</h2>
      {accounts.length ? <form key={form._id ?? 'new'} className="ledger-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>Tipo<select {...bind('type')}>{Object.entries(types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Descrição<input required maxLength={120} {...bind('description')} /></label>
          <MoneyField label="Valor" name="amount" required defaultValue={form.amount} />
          <DateField label="Data" name="date" required defaultValue={form.date} />
          <label>{transfer ? 'Conta de origem' : 'Conta'}<select required {...bind('accountId')}><option value="">Selecione</option>{accounts.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></label>
          {transfer ? <label>Conta de destino<select required {...bind('destinationId')}><option value="">Selecione</option>{accounts.filter(row => row._id !== form.accountId).map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></label> : <label>Categoria<input required maxLength={120} {...bind('category')} /></label>}
          {form.type === 'expense' && <label>Classificação<select {...bind('expenseKind')}>{Object.entries(expenseKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
          <div className="ledger-actions"><button className="action-button">Salvar movimentação</button>{editing && <button className="action-button" type="button" onClick={reset}>Cancelar</button>}</div>
        </fieldset>
      </form> : <p>Cadastre ou reative uma conta para lançar movimentações.</p>}
      {(validation || error) && <p role="alert">{validation || error}</p>}
    </section>
    <section className="panel detail-panel"><h2>Histórico de movimentações</h2>
      {history.length > 0 && <div className="filters">
        <label>Buscar descrição<input type="search" {...filter('query')} /></label>
        <label>Tipo<select {...filter('type')}><option value="">Todos</option>{Object.entries(historyTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Categoria<select {...filter('category')}><option value="">Todas</option>{categoryOptions.map(category => <option key={category}>{category}</option>)}</select></label>
        <label>Conta<select {...filter('account')}><option value="">Todas</option>{data.accounts.map(row => <option key={row._id} value={row._id}>{accountName(row._id)}</option>)}</select></label>
        <label>Mês<input type="month" {...filter('month')} /></label>
        <label>Situação<select {...filter('status')}><option value="">Todas</option><option value="recorded">Registrada</option><option value="cancelled">Cancelada</option></select></label>
      </div>}
      {pendingDelete && <div className="ledger-actions"><span>Excluir {pendingDelete.description}?</span><button type="button" disabled={busy} className="action-button" onClick={async () => {
        if (await mutate('/entries/' + pendingDelete._id, 'DELETE')) {
          if (form._id === pendingDelete._id) reset()
          setPendingDelete(null)
        }
      }}>Confirmar exclusão</button><button type="button" className="action-button" disabled={busy} onClick={() => setPendingDelete(null)}>Cancelar</button></div>}
      {history.length ? <Table compact label="Histórico" rows={filtered.slice(0, limit).map(row => ({ ...row, id: row._id }))} columns={[
        { key: 'description', label: 'Descrição' }, { key: 'type', label: 'Tipo', render: row => historyTypes[rowType(row)] },
        { key: 'category', label: 'Categoria', render: row => row.category ?? '—' },
        { key: 'account', label: 'Conta', render: row => row.destinationId ? accountName(row.accountId) + ' → ' + accountName(row.destinationId) : accountName(row.accountId) },
        { key: 'date', label: 'Data', render: row => formatDate(row.date) },
        { key: 'amount', label: 'Valor', render: row => money(['expense', 'cardPayment', 'cardPurchase'].includes(row.type) ? -row.amount : row.amount) },
        { key: 'status', label: 'Situação', render: row => row.cancelledAt ? 'Cancelada' : 'Registrada' },
        { key: 'reference', label: 'Referência', render: row => {
          if (row.assetId) return <Link className="text-link" to={'/patrimonio#' + row.assetId}>Ver bem</Link>
          if (row.goalId) return <Link className="text-link" to="/metas">Meta</Link>
          const card = paymentCards.get(row._id) ?? row
          return card.cardId ? <Link className="text-link" to={'/cartoes?cartao=' + card.cardId}>{row.cardName ?? 'Fatura ' + card.invoice}</Link> : '—'
        } },
        { key: 'actions', label: 'Ações', render: row => row.cancelledAt || row.assetId || row.goalId || ['cardPayment', 'cardPurchase'].includes(row.type) || deleted.has(row.accountId) || deleted.has(row.destinationId)
          ? 'Histórico preservado' : <div className="ledger-actions"><button className="text-link" type="button" disabled={busy} onClick={() => edit(row)}>Editar</button><button className="text-link" type="button" disabled={busy} onClick={() => setPendingDelete(row)}>Cancelar lançamento</button></div> },
      ]} /> : <p>Suas movimentações aparecerão aqui depois do primeiro lançamento.</p>}
      {filtered.length > limit && <button type="button" className="action-button" onClick={() => setLimit(limit + 30)}>Carregar mais</button>}
    </section>
  </div>
}
