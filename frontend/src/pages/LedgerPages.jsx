import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useLedger } from '../LedgerContext.jsx'
import { formatDate, localDay, money, toCents } from '../ledgerFormat.js'
import { RemoveRecord, Table } from '../components/Details.jsx'
import { DateField, MoneyField } from '../components/FinancialFields.jsx'
import ActionPanel from '../components/ActionPanel.jsx'

const types = { income: 'Receita', expense: 'Despesa', transfer: 'Transferência' }
const historyTypes = { ...types, cardPayment: 'Pagamento de fatura', cardPurchase: 'Compra no cartão', assetPurchase: 'Compra patrimonial', assetSale: 'Recebimento de venda patrimonial', assetSaleEvent: 'Venda patrimonial informativa' }
const expenseKinds = { fixed: 'Fixa', variable: 'Variável' }
const inputAmount = amount => amount == null ? '' : (amount / 100).toFixed(2).replace('.', ',')

function AccountEditor({ account, onDone }) {
  const { busy, mutate } = useLedger()
  const [message, setMessage] = useState('')
  return <form className="ledger-form" onSubmit={async event => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const initialBalance = toCents(fields.get('initialBalance') || '0')
    if (!account && initialBalance == null) return setMessage('Confira o saldo informado.')
    const payload = { name: fields.get('name'), kind: fields.get('kind'), ...(account ? { archived: Boolean(account.archived) } : { initialBalance }) }
    if (await mutate(account ? '/accounts/' + account._id : '/accounts', account ? 'PUT' : 'POST', payload)) onDone()
  }}><fieldset disabled={busy}>
    <label>Nome da conta<input name="name" defaultValue={account?.name} required maxLength={120} /></label>
    {!account && <MoneyField label="Saldo inicial" name="initialBalance" negative zero defaultValue="0" />}
    <details><summary>Informações adicionais</summary><div className="module-options">
      <label>Tipo de conta<input name="kind" defaultValue={account?.kind || 'Conta corrente'} required maxLength={120} /></label>
      {account && <p>Saldo inicial: {money(account.initialBalance)}. Ajuste o saldo registrando uma movimentação.</p>}
    </div></details>
    <button className="action-button">Salvar conta</button>
    {message && <p role="alert">{message}</p>}
  </fieldset></form>
}

export function EntryEditor({ entry, initialType = 'expense', accountId = '', onDone }) {
  const { data, busy, mutate } = useLedger()
  const [form, setForm] = useState(() => ({ type: initialType, accountId, destinationId: '', expenseKind: 'variable', category: 'Geral', ...entry }))
  const [message, setMessage] = useState('')
  const accounts = data.accounts.filter(row => !row.deletedAt && (!row.archived || [entry?.accountId, entry?.destinationId].includes(row._id)))
  const bind = key => ({ value: form[key] ?? '', onChange: event => setForm({ ...form, [key]: event.target.value }) })
  const transfer = form.type === 'transfer'
  if (!accounts.length) return <p>Adicione ou reative uma conta para registrar uma movimentação. <Link className="text-link" to="/contas">Ir para Contas</Link></p>
  return <form className="ledger-form" onSubmit={async event => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget), amount = toCents(fields.get('amount'))
    if (!(amount > 0)) return setMessage('Informe um valor positivo.')
    const payload = { type: form.type, description: fields.get('description'), amount, date: fields.get('date'), accountId: form.accountId,
      ...(transfer ? { destinationId: form.destinationId } : { category: (form.category || '').trim() || 'Geral' }),
      ...(form.type === 'expense' && { expenseKind: form.expenseKind }) }
    if (await mutate(entry ? '/entries/' + entry._id : '/entries', entry ? 'PUT' : 'POST', payload)) onDone()
  }}><fieldset disabled={busy}>
    <label>Descrição<input name="description" defaultValue={entry?.description} required maxLength={120} /></label>
    <MoneyField label="Valor" name="amount" required defaultValue={inputAmount(entry?.amount)} />
    <DateField label="Data" name="date" required defaultValue={entry?.date || localDay()} />
    <label>{transfer ? 'Conta de origem' : 'Conta'}<select name="accountId" required {...bind('accountId')}><option value="">Selecione</option>{accounts.map(row => <option key={row._id} value={row._id}>{row.name}{row.archived ? ' (arquivada)' : ''}</option>)}</select></label>
    {transfer && <label>Conta de destino<select name="destinationId" required {...bind('destinationId')}><option value="">Selecione</option>{accounts.filter(row => row._id !== form.accountId).map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></label>}
    <details><summary>Informações adicionais</summary><div className="module-options">
      {entry && <label>Tipo<select {...bind('type')}>{Object.entries(types).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>}
      {!transfer && <label>Categoria<input maxLength={120} {...bind('category')} placeholder="Geral" /></label>}
      {form.type === 'expense' && <label>Tipo de despesa<select {...bind('expenseKind')}>{Object.entries(expenseKinds).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>}
      {!transfer && <p>Se não informar uma categoria, usaremos “Geral”.</p>}
    </div></details>
    <button className="action-button">{transfer ? 'Confirmar transferência' : 'Salvar movimentação'}</button>
    {message && <p role="alert">{message}</p>}
  </fieldset></form>
}

export function LiveAccounts() {
  const { data, busy, error, mutate } = useLedger()
  const { hash } = useLocation()
  const [panel, setPanel] = useState(null)
  const account = panel?.id && data.accounts.find(row => row._id === panel.id)
  useEffect(() => { if (data.accounts.some(row => row._id === hash.slice(1) && !row.deletedAt)) setPanel({ view: 'manage', id: hash.slice(1) }) }, [hash])
  const close = () => setPanel(null)
  const cards = rows => rows.map(row => <article className="panel module-card" id={row._id} key={row._id}>
    <h3>{row.name}</h3><p className="card-value">{money(row.balance)}</p>{row.archived && <p className="module-muted">Arquivada</p>}
    <button className="action-button" type="button" onClick={() => setPanel({ id: row._id, view: 'manage' })}>Gerenciar<span className="sr-only"> {row.name}</span></button>
  </article>)
  return <div className="module-page">
    {error && !panel && <p role="alert">{error}</p>}
    <section className="panel module-overview"><div><p>Saldo total das contas</p><strong>{money(data.total)}</strong>{data.accounts.some(row => row.archived && !row.deletedAt) && <p>Inclui os saldos das contas arquivadas.</p>}</div><button className="action-button asset-primary" type="button" onClick={() => setPanel({ view: 'new' })}>Adicionar conta</button></section>
    <section className="module-section"><h2>Suas contas</h2>{data.accounts.some(row => !row.deletedAt && !row.archived) ? <div className="module-grid">{cards(data.accounts.filter(row => !row.deletedAt && !row.archived))}</div> : <p className="empty-state">Adicione sua primeira conta para começar.</p>}</section>
    {data.accounts.some(row => row.archived && !row.deletedAt) && <details><summary>Contas arquivadas</summary><div className="module-grid">{cards(data.accounts.filter(row => row.archived && !row.deletedAt))}</div><p className="module-muted">Os saldos e o histórico dessas contas continuam preservados.</p></details>}
    {panel && <ActionPanel title={panel.view === 'new' ? 'Adicionar conta' : panel.view === 'edit' ? 'Editar conta' : panel.view === 'transfer' ? 'Transferir dinheiro' : account?.name ?? 'Conta'} onClose={close}>
      {['new', 'edit'].includes(panel.view) ? <AccountEditor account={account || undefined} onDone={close} /> : panel.view === 'transfer' ? <EntryEditor initialType="transfer" accountId={account._id} onDone={close} /> : account && <>
        <p className="card-value">Saldo: {money(account.balance)}</p><nav aria-label="Gerenciar conta">
          <Link to={'/movimentacoes?conta=' + account._id}>Consultar movimentações</Link>
          <button type="button" onClick={() => setPanel({ ...panel, view: 'edit' })}>Editar informações</button>
          {!account.archived && <button type="button" onClick={() => setPanel({ ...panel, view: 'transfer' })}>Transferir dinheiro</button>}
        </nav>
        <details><summary>Mais opções e detalhes</summary><div className="module-options">
          <p>Tipo: {account.kind} · Saldo inicial: {money(account.initialBalance)}</p>
          <button className="action-button" type="button" disabled={busy} onClick={async () => {
            if (await mutate('/accounts/' + account._id, 'PUT', { name: account.name, kind: account.kind, archived: !account.archived })) close()
          }}>{account.archived ? 'Reativar conta' : 'Arquivar conta'}</button>
          {account.balance === 0 ? <RemoveRecord label="Excluir conta" message="Excluir esta conta? O histórico será preservado. Vínculos ativos impedem a exclusão." busy={busy} onRemove={async () => { if (await mutate('/accounts/' + account._id, 'DELETE')) close() }} /> : <p>Para excluir a conta, ela precisa estar com saldo zero e sem vínculos ativos.</p>}
        </div></details>
      </>}
    </ActionPanel>}
  </div>
}

export function LiveEntries() {
  const { data, busy, error, mutate } = useLedger()
  const [params] = useSearchParams()
  const [panel, setPanel] = useState(null)
  const [filters, setFilters] = useState(() => ({ query: '', type: '', category: '', account: params.get('conta') || '', month: '', status: '' }))
  const [limit, setLimit] = useState(30)
  const deleted = new Set(data.accounts.filter(row => row.deletedAt).map(row => row._id))
  const rowType = row => row.assetOperation === 'purchase' ? 'assetPurchase' : row.assetOperation === 'sale' ? 'assetSale' : row.type
  const paymentCards = new Map(data.cards.flatMap(card => card.events.filter(row => row.type === 'payment').map(row => [row._id, { cardId: card._id, invoice: row.invoice }])))
  const assetEvents = data.assets.flatMap(asset => [...(asset.saleHistory ?? []), ...(asset.sale?.date ? [asset.sale] : [])].filter(sale => !sale.entryId)
    .map((sale, index) => ({ _id: 'asset-sale:' + asset._id + ':' + index, assetId: asset._id, type: 'assetSaleEvent', date: sale.date, amount: sale.amount,
      description: 'Venda informativa · ' + asset.name, category: 'Patrimônio', cancelledAt: sale.cancelledAt, patrimonialEvent: true })))
  const history = [...data.entries, ...(data.cancelledEntries ?? []), ...assetEvents, ...data.cards.flatMap(card => card.events.filter(row => row.type === 'purchase').map(row => ({ ...row, type: 'cardPurchase', cardName: card.name })))]
    .sort((a, b) => b.date.localeCompare(a.date) || String(b._id).localeCompare(String(a._id)))
  const filtered = history.filter(row => (!filters.query || row.description.toLocaleLowerCase('pt-BR').includes(filters.query.trim().toLocaleLowerCase('pt-BR')))
    && (!filters.type || rowType(row) === filters.type) && (!filters.category || row.category === filters.category)
    && (!filters.account || row.accountId === filters.account || row.destinationId === filters.account)
    && (!filters.month || row.date.startsWith(filters.month)) && (!filters.status || (row.cancelledAt ? 'cancelled' : 'recorded') === filters.status))
  const row = panel?.id && history.find(row => row._id === panel.id)
  const editable = row && !(row.cancelledAt || row.assetId || row.goalId || ['cardPayment', 'cardPurchase'].includes(row.type) || deleted.has(row.accountId) || deleted.has(row.destinationId))
  const accountName = id => { const item = data.accounts.find(row => row._id === id); return item ? item.name + (item.deletedAt ? ' (excluída)' : '') : '—' }
  const filter = key => ({ value: filters[key], onChange: event => { setFilters({ ...filters, [key]: event.target.value }); setLimit(30) } })
  const close = () => setPanel(null)
  const reference = item => {
    if (item.assetId) return <Link className="text-link" to={'/patrimonio#' + item.assetId}>{data.assets.find(asset => asset._id === item.assetId)?.name ?? 'Ver bem'}</Link>
    if (item.goalId) return <Link className="text-link" to="/metas">Ver meta</Link>
    const card = paymentCards.get(item._id) ?? item
    return card.cardId ? <Link className="text-link" to={'/cartoes?cartao=' + card.cardId}>{item.cardName ?? 'Ver fatura ' + card.invoice}</Link> : 'Registro direto'
  }
  return <div className="module-page">
    {error && !panel && <p role="alert">{error}</p>}
    <div className="module-card-actions">{[['income', 'Adicionar receita'], ['expense', 'Adicionar despesa'], ['transfer', 'Transferir dinheiro']].map(([type, name]) => <button key={type} className={'action-button' + (type === 'income' ? ' asset-primary' : '')} type="button" onClick={() => setPanel({ view: 'new', type })}>{name}</button>)}</div>
    <section className="module-section"><h2>Histórico de movimentações</h2>
      <label className="module-search">Buscar movimentação<input type="search" {...filter('query')} /></label>
      {filters.account && <p className="module-muted">Conta: {accountName(filters.account)} <button className="text-link" type="button" onClick={() => setFilters({ ...filters, account: '' })}>Ver todas</button></p>}
      <details><summary>Filtros avançados</summary><div className="filters module-options">
        <label>Tipo<select {...filter('type')}><option value="">Todos</option>{Object.entries(historyTypes).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
        <label>Categoria<select {...filter('category')}><option value="">Todas</option>{[...new Set(history.map(row => row.category).filter(Boolean))].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Conta<select {...filter('account')}><option value="">Todas</option>{data.accounts.map(row => <option key={row._id} value={row._id}>{accountName(row._id)}</option>)}</select></label>
        <label>Mês<input type="month" {...filter('month')} /></label><label>Situação<select {...filter('status')}><option value="">Todas</option><option value="recorded">Registrada</option><option value="cancelled">Cancelada</option></select></label>
        <button className="action-button" type="button" onClick={() => setFilters({ query: '', type: '', category: '', account: '', month: '', status: '' })}>Limpar filtros</button>
      </div></details>
      {filtered.length ? <Table compact label="Histórico" rows={filtered.slice(0, limit).map(row => ({ ...row, id: row._id }))} columns={[
        { key: 'description', label: 'Descrição', render: row => <><span>{row.description}</span><small className="movement-meta module-muted">{historyTypes[rowType(row)]}{row.accountId && ' · ' + accountName(row.accountId)}{row.destinationId && ' → ' + accountName(row.destinationId)}</small></> }, { key: 'date', label: 'Data', render: row => formatDate(row.date) },
        { key: 'amount', label: 'Valor', render: row => money(['expense', 'cardPayment', 'cardPurchase'].includes(row.type) ? -row.amount : row.amount) + (row.patrimonialEvent ? ' · sem caixa' : row.cancelledAt ? ' · cancelada' : '') },
        { key: 'details', label: 'Detalhes', render: row => <button className="text-link" type="button" onClick={() => setPanel({ view: 'details', id: row._id })}>Ver detalhes<span className="sr-only"> {row.description}</span></button> },
      ]} /> : <p className="empty-state">{history.length ? 'Nenhuma movimentação corresponde à busca. Ajuste os filtros.' : 'Suas receitas, despesas e transferências aparecerão aqui.'}</p>}
      {filtered.length > limit && <button className="action-button" type="button" onClick={() => setLimit(limit + 30)}>Carregar mais</button>}
    </section>
    {panel && <ActionPanel title={panel.view === 'details' ? row?.description ?? 'Detalhes' : panel.view === 'edit' ? 'Editar movimentação' : panel.type === 'income' ? 'Adicionar receita' : panel.type === 'transfer' ? 'Transferir dinheiro' : 'Adicionar despesa'} onClose={close}>
      {panel.view !== 'details' ? <EntryEditor key={panel.id ?? panel.type} entry={row || undefined} initialType={panel.type} accountId={filters.account} onDone={close} /> : row && <>
        <dl className="module-facts">{[['Tipo', historyTypes[rowType(row)]], ['Valor', money(row.amount) + (row.patrimonialEvent ? ' · sem caixa' : '')], ['Data', formatDate(row.date)], ['Conta', row.destinationId ? accountName(row.accountId) + ' → ' + accountName(row.destinationId) : accountName(row.accountId)], ['Categoria', row.category || '—'], ['Situação', row.cancelledAt ? 'Cancelada' : 'Registrada'], ['Origem', row.patrimonialEvent ? 'Evento patrimonial informativo' : row.assetReceiptSource === 'existing' ? 'Recebimento existente vinculado' : row.assetOperation === 'sale' ? 'Recebimento patrimonial confirmado' : 'Lançamento financeiro']].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
        {reference(row)}
        {editable ? <><button className="action-button" type="button" onClick={() => setPanel({ ...panel, view: 'edit' })}>Editar movimentação</button>
          <details><summary>Cancelar lançamento</summary><p>O lançamento ficará no histórico como cancelado e deixará de afetar o saldo.</p><button type="button" className="action-button" disabled={busy} onClick={async () => { if (await mutate('/entries/' + row._id, 'DELETE')) close() }}>Confirmar cancelamento</button></details></> : <p className="module-muted">Histórico preservado. Registros vinculados são gerenciados no módulo de origem.</p>}
      </>}
    </ActionPanel>}
  </div>
}
