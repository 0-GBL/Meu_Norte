import { useState } from 'react'
import { useLedger } from '../LedgerContext.jsx'
import { localDay, toCents } from '../ledgerFormat.js'
import { dateLabel, money } from '../demo/finance.js'
import { Table } from '../components/Details.jsx'

const types = { income: 'Receita', expense: 'Despesa', transfer: 'Transferência' }
const historyTypes = { ...types, cardPayment: 'Pagamento de fatura' }
const expenseKinds = { fixed: 'Fixa', variable: 'Variável' }
const emptyAccount = { name: '', kind: '', initialBalance: '0', archived: false }

export function LedgerAccess() {
  const { enabled, auth, user, localConnected, busy, error, connect, disconnect, authenticate } = useLedger()
  if (!enabled) return null
  if (user) return <section className="panel detail-panel"><h2>Conta do Meu Norte</h2>
    <p>{user.name} · {user.email}</p>
    <button className="action-button" type="button" disabled={busy} onClick={() => authenticate('logout', {})}>Sair da conta</button>
    {error && <p role="alert">{error}</p>}
  </section>
  if (!auth.localAccess) return null
  return <section className="panel detail-panel"><h2>Registros locais</h2>
    {localConnected ? <><p>Seu espaço de desenvolvimento está conectado.</p><button className="action-button" type="button" disabled={busy} onClick={disconnect}>Desconectar</button></> :
      <form className="ledger-form" onSubmit={event => {
        event.preventDefault()
        const form = event.currentTarget
        void connect(new FormData(form).get('access').trim()).then(ok => { if (ok) form.reset() })
      }}>
        <label>Chave de acesso<input type="password" name="access" autoComplete="off" required pattern="[0-9a-fA-F]{64}" /></label>
        <button className="action-button" disabled={busy}>{busy ? 'Conectando…' : 'Conectar registros'}</button>
      </form>}
    {error && <p role="alert">{error}</p>}
  </section>
}

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

  async function submit(event) {
    event.preventDefault()
    const initialBalance = toCents(form.initialBalance)
    if (!editing && initialBalance === null) return setValidation('Digite o saldo em reais com até duas casas decimais.')
    setValidation('')
    const { name, kind, archived } = form
    if (await mutate(editing ? '/accounts/' + form._id : '/accounts', editing ? 'PUT' : 'POST',
      editing ? { name, kind, archived } : { name, kind, initialBalance })) reset()
  }

  return <div className="ledger-stack">
    <section className="panel detail-panel">
      <h2>{editing ? 'Editar conta' : 'Nova conta'}</h2>
      <form className="ledger-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>Nome<input required maxLength={120} {...bind('name')} /></label>
          <label>Tipo de conta<input required maxLength={120} placeholder="Ex. Conta corrente" {...bind('kind')} /></label>
          {!editing && <label>Saldo inicial (R$)<input required inputMode="decimal" {...bind('initialBalance')} /></label>}
          {editing && <label>Situação<select value={form.archived ? 'archived' : 'active'} onChange={event => setForm({ ...form, archived: event.target.value === 'archived' })}><option value="active">Ativa</option><option value="archived">Arquivada</option></select></label>}
          <div className="ledger-actions"><button className="action-button">Salvar conta</button>{editing && <button className="action-button" type="button" onClick={reset}>Cancelar</button>}</div>
        </fieldset>
      </form>
      {(validation || error) && <p role="alert">{validation || error}</p>}
    </section>
    <section className="panel detail-panel">
      <h2>Saldo consolidado · {money(data.total)}</h2>
      <p>Contas arquivadas continuam no saldo e no histórico. Elas ficam indisponíveis para novos registros.</p>
      {data.accounts.length ? <Table label="Contas cadastradas" rows={data.accounts.map(row => ({ ...row, id: row._id }))} columns={[
        { key: 'name', label: 'Conta' }, { key: 'kind', label: 'Tipo' },
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
  const [filters, setFilters] = useState({ query: '', type: '', category: '', account: '', month: '' })
  const editing = Boolean(form._id)
  const transfer = form.type === 'transfer'
  const accounts = data.accounts.filter(account => !account.archived || form.linkedAccounts?.includes(account._id))
  const categoryOptions = [...new Set(data.entries.map(row => row.category).filter(Boolean))]
  const filtered = data.entries.filter(row => (!filters.query || row.description.toLocaleLowerCase('pt-BR').includes(filters.query.trim().toLocaleLowerCase('pt-BR')))
    && (!filters.type || row.type === filters.type)
    && (!filters.category || row.category === filters.category)
    && (!filters.account || row.accountId === filters.account || row.destinationId === filters.account)
    && (!filters.month || row.date.startsWith(filters.month)))
  const accountName = id => data.accounts.find(account => account._id === id)?.name
  const filter = key => ({ value: filters[key], onChange: event => setFilters({ ...filters, [key]: event.target.value }) })

  async function submit(event) {
    event.preventDefault()
    const amount = toCents(form.amount)
    if (amount === null || amount <= 0) return setValidation('Digite um valor positivo com até duas casas decimais.')
    setValidation('')
    const { type, description, date, accountId, destinationId, category, expenseKind } = form
    const payload = { type, description, amount, date, accountId, ...(transfer ? { destinationId } : { category }),
      ...(type === 'expense' && { expenseKind }) }
    if (await mutate(editing ? '/entries/' + form._id : '/entries', editing ? 'PUT' : 'POST', payload)) reset()
  }

  function edit(row) {
    setForm({ ...emptyEntry(), ...row, amount: (row.amount / 100).toFixed(2).replace('.', ','), linkedAccounts: [row.accountId, row.destinationId] })
    setValidation('')
    document.getElementById('conteudo').scrollIntoView()
  }

  return <div className="ledger-stack">
    <section className="panel detail-panel"><h2>{editing ? 'Editar movimentação' : 'Nova movimentação'}</h2>
      {accounts.length ? <form className="ledger-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>Tipo<select {...bind('type')}>{Object.entries(types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Descrição<input required maxLength={120} {...bind('description')} /></label>
          <label>Valor (R$)<input required inputMode="decimal" {...bind('amount')} /></label>
          <label>Data<input required type="date" {...bind('date')} /></label>
          <label>{transfer ? 'Conta de origem' : 'Conta'}<select required {...bind('accountId')}><option value="">Selecione</option>{accounts.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></label>
          {transfer ? <label>Conta de destino<select required {...bind('destinationId')}><option value="">Selecione</option>{accounts.filter(row => row._id !== form.accountId).map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></label> : <label>Categoria<input required maxLength={120} {...bind('category')} /></label>}
          {form.type === 'expense' && <label>Classificação<select {...bind('expenseKind')}>{Object.entries(expenseKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
          <div className="ledger-actions"><button className="action-button">Salvar movimentação</button>{editing && <button className="action-button" type="button" onClick={reset}>Cancelar</button>}</div>
        </fieldset>
      </form> : <p>Cadastre ou reative uma conta para lançar movimentações.</p>}
      {(validation || error) && <p role="alert">{validation || error}</p>}
    </section>
    <section className="panel detail-panel"><h2>Histórico de movimentações</h2>
      {data.entries.length > 0 && <div className="filters">
        <label>Buscar descrição<input type="search" {...filter('query')} /></label>
        <label>Tipo<select {...filter('type')}><option value="">Todos</option>{Object.entries(historyTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Categoria<select {...filter('category')}><option value="">Todas</option>{categoryOptions.map(category => <option key={category}>{category}</option>)}</select></label>
        <label>Conta<select {...filter('account')}><option value="">Todas</option>{data.accounts.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></label>
        <label>Mês<input type="month" {...filter('month')} /></label>
      </div>}
      {pendingDelete && <div className="ledger-actions"><span>Excluir {pendingDelete.description}?</span><button type="button" disabled={busy} className="action-button" onClick={async () => {
        if (await mutate('/entries/' + pendingDelete._id, 'DELETE')) {
          if (form._id === pendingDelete._id) reset()
          setPendingDelete(null)
        }
      }}>Confirmar exclusão</button><button type="button" className="action-button" disabled={busy} onClick={() => setPendingDelete(null)}>Cancelar</button></div>}
      {data.entries.length ? <Table label="Histórico" rows={filtered.map(row => ({ ...row, id: row._id }))} columns={[
        { key: 'description', label: 'Descrição' }, { key: 'type', label: 'Tipo', render: row => row.type === 'expense' ? 'Despesa · ' + expenseKinds[row.expenseKind] : historyTypes[row.type] },
        { key: 'category', label: 'Categoria', render: row => row.category ?? '—' },
        { key: 'account', label: 'Conta', render: row => row.destinationId ? accountName(row.accountId) + ' → ' + accountName(row.destinationId) : accountName(row.accountId) },
        { key: 'date', label: 'Data', render: row => dateLabel(row.date) },
        { key: 'amount', label: 'Valor', render: row => money(['expense', 'cardPayment'].includes(row.type) ? -row.amount : row.amount) },
        { key: 'actions', label: 'Ações', render: row => row.type === 'cardPayment' ? 'Vinculado à fatura' : <div className="ledger-actions"><button className="text-link" type="button" disabled={busy} onClick={() => edit(row)}>Editar</button><button className="text-link" type="button" disabled={busy} onClick={() => setPendingDelete(row)}>Excluir</button></div> },
      ]} /> : <p>Suas movimentações aparecerão aqui depois do primeiro lançamento.</p>}
    </section>
  </div>
}
