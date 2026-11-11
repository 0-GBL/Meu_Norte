import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RemoveRecord, Table } from '../components/Details.jsx'
import { money } from '../ledgerFormat.js'
import { useLedger } from '../LedgerContext.jsx'
import { formatDate, localDay, toCents } from '../ledgerFormat.js'
import { DateField, MoneyField } from '../components/FinancialFields.jsx'

const frequencies = { once: 'Uma vez', weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual' }
export const assetKinds = { vehicle: 'Veículo', property: 'Imóvel', equipment: 'Equipamento', investment: 'Investimento ou reserva', other: 'Outro bem', debt: 'Dívida ou obrigação' }
export const reminderKinds = { manual: 'Manual', commitment: 'Compromisso financeiro', account: 'Conta', asset: 'Patrimônio',
  valuation: 'Revisão de avaliação', cardClose: 'Fechamento de cartão', cardDue: 'Vencimento de cartão', cardOpen: 'Fatura em aberto' }
const cardKind = kind => kind?.startsWith('card')
const activeAsset = row => !row.endedOn
const amountInput = cents => cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',')

export function reminderItems(data) {
  return [
    ...data.reminders.filter(row => row.status === 'active' && row.effectiveDate).map(row => ({ id: row._id, name: row.name, detail: reminderKinds[row.kind] ?? frequencies[row.frequency], date: row.effectiveDate })),
    ...data.assets.filter(row => row.reviewOn && activeAsset(row)).map(row => ({ id: row._id, name: row.name, detail: 'Revisão patrimonial', date: row.reviewOn })),
  ].sort((a, b) => a.date.localeCompare(b.date))
}

export function RemindersPage() {
  const { data, busy, error, mutate } = useLedger()
  const [params] = useSearchParams()
  const [editing, setEditing] = useState(null)
  const [kind, setKind] = useState(() => params.has('bem') ? 'valuation' : 'manual')
  const [message, setMessage] = useState('')
  const active = data.reminders.filter(row => row.status === 'active')
  const closed = data.reminders.filter(row => row.status !== 'active')
  const reviews = data.assets.filter(row => row.reviewOn && activeAsset(row)).sort((a, b) => a.reviewOn.localeCompare(b.reviewOn))
  const today = localDay()
  const linkOptions = cardKind(kind) ? data.cards.filter(row => !row.deletedAt) :
    kind === 'account' ? data.accounts.filter(row => !row.deletedAt) :
      ['asset', 'valuation'].includes(kind) ? data.assets.filter(activeAsset) : []
  const linked = !['manual', 'commitment'].includes(kind)
  const related = row => cardKind(row.kind) ? '/cartoes?cartao=' + row.linkId :
    row.kind === 'account' ? '/contas#' + row.linkId : '/patrimonio#' + row.linkId

  const submit = async event => {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const input = fields.get('amount').trim()
    const amount = input ? toCents(input) : null
    if (input && (!amount || amount < 0)) return setMessage('Informe um valor positivo com até duas casas decimais.')
    setMessage('')
    if (await mutate(editing ? '/reminders/' + editing._id : '/reminders', editing ? 'PUT' : 'POST',
      { name: fields.get('name'), dueOn: fields.get('dueOn'), frequency: fields.get('frequency') ?? 'monthly', amount, kind,
        description: fields.get('description').trim(), time: fields.get('time'), leadDays: Number(fields.get('leadDays')),
        linkId: fields.get('linkId') || null })) {
      form.reset()
      setEditing(null)
      setKind('manual')
    }
  }

  const act = (row, action, until) => mutate('/reminders/' + row._id + '/actions', 'POST',
    { action, occurrence: row.effectiveDate, ...(until && { until }) })

  return <div className="ledger-stack">
    <section className="panel detail-panel">
      <h2>{editing ? 'Editar lembrete' : 'Novo lembrete'}</h2>
      <form className="ledger-form" onSubmit={submit} key={editing?._id ?? 'new'}><fieldset disabled={busy}>
        <label>Nome<input name="name" required maxLength={120} defaultValue={editing?.name} /></label>
        <label>Tipo<select value={kind} onChange={event => setKind(event.target.value)}>{Object.entries(reminderKinds).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
        {linked && <label>Registro vinculado<select key={kind} name="linkId" defaultValue={editing?.linkId ?? params.get('bem') ?? ''} required><option value="">Selecione</option>
          {linkOptions.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></label>}
        {!cardKind(kind) && <>
          <DateField label="Data prevista" name="dueOn" required defaultValue={editing?.dueOn ?? today} />
          <label>Periodicidade<select name="frequency" defaultValue={editing?.frequency}>{Object.entries(frequencies).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        </>}
        <label>Descrição opcional<input name="description" maxLength={120} defaultValue={editing?.description} /></label>
        <label>Horário opcional<input name="time" type="time" defaultValue={editing?.time} /></label>
        <label>Antecedência em dias<input name="leadDays" type="number" min="0" max="365" step="1" defaultValue={editing?.leadDays ?? 0} /></label>
        <MoneyField label="Valor de referência" name="amount" defaultValue={amountInput(editing?.amount)} />
        <div className="ledger-actions"><button className="action-button">Salvar lembrete</button>
          {editing && <button className="action-button" type="button" onClick={() => { setEditing(null); setKind('manual') }}>Cancelar edição</button>}
        </div>
      </fieldset></form>
      {(message || error) && <p role="alert">{message || error}</p>}
    </section>
    <section className="panel detail-panel" id="notificacoes">
      <h2>Central de notificações</h2>
      <p>Os avisos aparecem dentro do Meu Norte. Confirmar uma ocorrência mantém as próximas datas recorrentes.</p>
      {!active.length && !reviews.length && <p>Você ainda não tem lembretes ativos.</p>}
      {active.map(row => <article className="panel detail-panel" id={row._id} key={row._id}>
        <h3><strong>{row.name}</strong></h3>
        <p>{row.effectiveDate ? formatDate(row.effectiveDate) + (row.time ? ' às ' + row.time : '') : 'Sem ocorrência no momento'} · {row.effectiveDate && row.effectiveDate < today ? 'Em atraso' : row.effectiveDate === today ? 'Hoje' : 'Agendado'} · {reminderKinds[row.kind] ?? frequencies[row.frequency]}{row.amount && ' · ' + money(row.amount)}</p>
        {row.description && <p>{row.description}</p>}
        {row.linkId && <Link className="text-link" to={related(row)}>Ver registro relacionado</Link>}
        <div className="ledger-actions">
          {row.effectiveDate && <>
            <button className="action-button" type="button" disabled={busy} onClick={() => act(row, 'confirm')}>Concluir ocorrência</button>
            <button className="action-button" type="button" disabled={busy} onClick={() => act(row, 'dismiss')}>Dispensar ocorrência</button>
            {!row.read && <button className="action-button" type="button" disabled={busy} onClick={() => act(row, 'read')}>Marcar como lido</button>}
          </>}
          <button className="action-button" type="button" disabled={busy} onClick={() => { setEditing(row); setKind(row.kind ?? 'manual'); document.getElementById('conteudo').scrollIntoView() }}>Editar</button>
          <button className="action-button" type="button" disabled={busy} onClick={() => act(row, 'cancel')}>Cancelar lembrete</button>
          <RemoveRecord label="Excluir lembrete" message="Excluir este lembrete e manter as ocorrências anteriores?" busy={busy} onRemove={() => mutate('/reminders/' + row._id, 'DELETE')} />
        </div>
        {row.effectiveDate && <form className="ledger-form" onSubmit={event => {
          event.preventDefault()
          void act(row, 'snooze', new FormData(event.currentTarget).get('until'))
        }}>
          <DateField label="Adiar até" name="until" required />
          <button className="action-button" disabled={busy}>Adiar</button>
        </form>}
      </article>)}
      {reviews.map(row => <p key={row._id}>{row.reviewOn} · Revisar {row.name} · <Link className="text-link" to="/patrimonio">Ir ao patrimônio</Link></p>)}
    </section>
    {closed.length > 0 && <section className="panel detail-panel"><h2>Lembretes encerrados</h2>
      <Table label="Lembretes encerrados" rows={closed.map(row => ({ ...row, id: row._id }))} columns={[
        { key: 'name', label: 'Nome' }, { key: 'status', label: 'Situação', render: row => ({ completed: 'Encerrado', deleted: 'Excluído', cancelled: 'Cancelado' })[row.status] },
        { key: 'actions', label: 'Ações', render: row => row.deletedAt ? '—' : <button className="text-link" type="button" disabled={busy} onClick={() => act(row, 'reactivate')}>Reativar</button> },
      ]} />
    </section>}
    {data.reminders.some(row => row.history?.length) && <section className="panel detail-panel"><h2>Histórico de ocorrências</h2>
      <Table compact label="Histórico de ocorrências" rows={data.reminders.flatMap(row => (row.history ?? []).map((item, index) => ({ ...item, name: row.name, id: row._id + ':' + index })))
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))} columns={[
        { key: 'name', label: 'Lembrete' }, { key: 'occurrence', label: 'Ocorrência', render: row => formatDate(row.occurrence) },
        { key: 'action', label: 'Situação', render: row => row.action === 'confirm' ? 'Concluída' : 'Dispensada' },
      ]} />
    </section>}
  </div>
}

function AssetEditor({ asset, accounts, onDone }) {
  const { busy, mutate } = useLedger()
  const [message, setMessage] = useState('')
  const submit = async event => {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const acquired = fields.get('acquired') ? toCents(fields.get('acquired')) : null
    const value = !asset && fields.get('value') ? toCents(fields.get('value')) : null
    if ((fields.get('acquired') && (acquired === null || acquired < 0)) || (!asset && fields.get('value') && (value === null || value < 0))) {
      return setMessage('Confira os valores informados em reais.')
    }
    setMessage('')
    const payload = {
      name: fields.get('name'), kind: fields.get('kind'), acquired: asset?.purchase?.date ? asset.acquired : acquired,
      acquiredOn: asset?.purchase?.date ? asset.acquiredOn : fields.get('acquiredOn') || null,
      description: fields.get('description').trim(), notes: fields.get('notes').trim(),
      accountId: fields.get('accountId') || null, reviewOn: fields.get('reviewOn') || null,
      ...(!asset && { value, date: fields.get('date') }),
    }
    if (await mutate(asset ? '/assets/' + asset._id : '/assets', asset ? 'PUT' : 'POST', payload)) {
      form.reset()
      onDone()
    }
  }
  return <section className="panel detail-panel">
    <h2>{asset ? 'Editar registro' : 'Novo registro patrimonial'}</h2>
    <form className="ledger-form" onSubmit={submit}><fieldset disabled={busy}>
      <label>Nome<input name="name" required maxLength={120} defaultValue={asset?.name} /></label>
      <label>Categoria<select name="kind" defaultValue={asset?.kind}>{Object.entries(assetKinds).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <label>Descrição opcional<input name="description" maxLength={120} defaultValue={asset?.description} /></label>
      {!asset?.purchase?.date && <><MoneyField label="Valor de aquisição" name="acquired" zero defaultValue={amountInput(asset?.acquired)} />
        <DateField label="Data da aquisição" name="acquiredOn" max={localDay()} defaultValue={asset?.acquiredOn} /></>}
      <label>Já representado em uma conta<select name="accountId" defaultValue={asset?.accountId ?? ''}><option value="">Nenhuma conta</option>{accounts.filter(row => !row.deletedAt).map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></label>
      {!asset && <><MoneyField label="Valor atual" name="value" zero /><DateField label="Data da avaliação" name="date" defaultValue={localDay()} max={localDay()} /></>}
      <label>Observação opcional<input name="notes" maxLength={120} defaultValue={asset?.notes} /></label>
      <DateField label="Lembrete de revisão" name="reviewOn" defaultValue={asset?.reviewOn} />
      <div className="ledger-actions"><button className="action-button">Salvar registro</button>{asset && <button className="action-button" type="button" onClick={onDone}>Cancelar edição</button>}</div>
    </fieldset></form>
    {message && <p role="alert">{message}</p>}
  </section>
}

function ValuationForm({ asset }) {
  const { busy, mutate } = useLedger()
  const [message, setMessage] = useState('')
  const submit = async event => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const value = toCents(fields.get('value'))
    if (value === null || value < 0) return setMessage('Informe um valor em reais a partir de zero.')
    setMessage('')
    await mutate('/assets/' + asset._id + '/valuations', 'POST', { value, date: fields.get('date'), reviewOn: fields.get('reviewOn') || null, notes: fields.get('notes').trim() })
  }
  return <form className="ledger-form" onSubmit={submit}><fieldset disabled={busy}>
    <MoneyField label="Valor revisado" name="value" required zero defaultValue={amountInput(asset.valuations[0]?.value)} />
    <DateField label="Data da avaliação" name="date" required max={localDay()} defaultValue={localDay()} />
    <DateField label="Próximo lembrete" name="reviewOn" />
    <label>Observação opcional<input name="notes" maxLength={120} /></label>
    <div className="ledger-actions"><button className="action-button">Registrar avaliação</button></div>
  </fieldset>{message && <p role="alert">{message}</p>}</form>
}

function AssetOperationForm({ asset }) {
  const { data, busy, mutate } = useLedger()
  const [type, setType] = useState(asset.kind === 'debt' ? 'retire' : asset.purchase?.date ? 'sale' : 'purchase')
  const [mode, setMode] = useState('note')
  const [message, setMessage] = useState('')
  const entries = data.entries.filter(row => !row.assetId && row.type === (type === 'purchase' ? 'expense' : 'income'))
  const [entryId, setEntryId] = useState('')
  const entry = entries.find(row => row._id === entryId)
  async function submit(event) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const amount = entry?.amount ?? (type === 'retire' ? undefined : toCents(fields.get('amount')))
    if (type !== 'retire' && !(amount > 0)) return setMessage('Informe um valor positivo para a operação.')
    const date = entry?.date ?? fields.get('date')
    setMessage('')
    if (await mutate('/assets/' + asset._id + '/operations', 'POST', {
      type, date, amount, mode, ...(mode === 'existing' && { entryId }), ...(mode === 'new' && { accountId: fields.get('accountId') }),
    })) { setType('sale'); setMode('note'); setEntryId('') }
  }
  return <form className="ledger-form" onSubmit={submit}><fieldset disabled={busy}>
    <label>Operação<select value={type} onChange={event => { setType(event.target.value); setMode('note'); setEntryId('') }}>
      {asset.kind !== 'debt' && <>{!asset.purchase?.date && <option value="purchase">Compra</option>}<option value="sale">Venda</option></>}<option value="retire">Baixa</option>
    </select></label>
    {type !== 'retire' && <label>Efeito na conta<select value={mode} onChange={event => { setMode(event.target.value); setEntryId('') }}>
      <option value="note">Somente informativo</option><option value="existing">Vincular lançamento existente</option><option value="new">Criar lançamento na conta</option>
    </select></label>}
    {mode === 'existing' ? <label>Lançamento<select value={entryId} onChange={event => setEntryId(event.target.value)} required><option value="">Selecione</option>
      {entries.map(row => <option key={row._id} value={row._id}>{formatDate(row.date)} · {row.description} · {money(row.amount)}</option>)}
    </select></label> : <>
      {type !== 'retire' && <MoneyField label={type === 'purchase' ? 'Valor pago' : 'Valor recebido'} name="amount" required />}
      <DateField label="Data da operação" name="date" defaultValue={localDay()} max={localDay()} required />
    </>}
    {mode === 'new' && <label>Conta<select name="accountId" required><option value="">Selecione</option>
      {data.accounts.filter(row => !row.archived && !row.deletedAt).map(row => <option key={row._id} value={row._id}>{row.name}</option>)}
    </select></label>}
    <div className="ledger-actions"><button className="action-button">Registrar {type === 'purchase' ? 'compra' : type === 'sale' ? 'venda' : 'baixa'}</button></div>
  </fieldset>{message && <p role="alert">{message}</p>}</form>
}

export function AssetsPage() {
  const { data, error, busy, mutate } = useLedger()
  const [editing, setEditing] = useState('')
  const asset = data.assets.find(row => row._id === editing)
  const active = data.assets.filter(activeAsset)
  const included = active.filter(row => !row.accountId && row.kind !== 'debt')
  const total = included.reduce((sum, row) => sum + (row.valuations[0]?.value ?? 0), 0)
  const cost = included.reduce((sum, row) => sum + (row.acquired ?? 0), 0)
  const comparable = included.filter(row => row.acquired != null && row.valuations.length)
  const variation = comparable.reduce((sum, row) => sum + row.valuations[0].value - row.acquired, 0)
  const totals = Object.entries(assetKinds).flatMap(([key, name]) => {
    const rows = included.filter(row => row.kind === key && row.valuations.length)
    return rows.length ? [{ name, value: rows.reduce((sum, row) => sum + row.valuations[0].value, 0) }] : []
  })
  const renderAsset = row => {
    const value = row.valuations[0]?.value
    const difference = value != null && row.acquired != null ? value - row.acquired : null
    const signed = amount => (amount > 0 ? '+' : '') + money(amount)
    return <article className="panel detail-panel" id={row._id} key={row._id}>
      <h2>{row.name}</h2>
      <p>{assetKinds[row.kind]} · {row.status === 'sold' ? 'Vendido' : row.status === 'retired' ? 'Baixado' : 'Ativo'}</p>
      {row.description && <p>{row.description}</p>}
      <p>Valor atual estimado <strong>{value == null ? 'Aguardando avaliação' : money(value)}</strong>{row.valuations[0] && ' · ' + formatDate(row.valuations[0].date)}</p>
      {row.acquired != null && <p>Valor de aquisição {money(row.acquired)}{row.acquiredOn && ' · ' + formatDate(row.acquiredOn)}</p>}
      {difference != null && <p>Variação estimada {signed(difference)}{row.acquired > 0 && ' · ' + new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(difference / row.acquired)}</p>}
      {row.sale?.date && <p>Venda de {money(row.sale.amount)} em {formatDate(row.sale.date)}. {row.sale.cost == null ? 'Custo de aquisição desconhecido.' : 'Resultado realizado ' + signed(row.sale.amount - row.sale.cost) + ' sobre o custo de aquisição.'} {row.sale.entryId ? 'Recebimento vinculado.' : 'Registro informativo.'}</p>}
      {row.purchase?.date && <p>Compra registrada em {formatDate(row.purchase.date)} · {row.purchase.entryId ? 'Pagamento vinculado' : 'Informativa'}</p>}
      {row.accountId && <p>Representado em {data.accounts.find(account => account._id === row.accountId)?.name}</p>}
      {row.reviewOn && activeAsset(row) && <p>Revisar em {formatDate(row.reviewOn)}</p>}
      {row.notes && <p>{row.notes}</p>}
      {activeAsset(row) && <>
        <div className="ledger-actions">
          <button className="action-button" type="button" onClick={() => { setEditing(row._id); document.getElementById('conteudo').scrollIntoView() }}>Editar</button>
          <Link className="action-button" to={'/lembretes?bem=' + row._id}>Criar lembrete</Link>
          <RemoveRecord label="Excluir cadastro" message="Confirme a exclusão deste cadastro." busy={busy} onRemove={() => mutate('/assets/' + row._id, 'DELETE')} />
        </div>
        <details><summary>{row.kind === 'debt' ? 'Registrar baixa' : 'Registrar compra, venda ou baixa'}</summary><AssetOperationForm asset={row} /></details>
        <details><summary>Registrar avaliação manual</summary><ValuationForm key={row.valuations[0]?._id} asset={row} /></details>
      </>}
      {row.valuations.length > 0 && <details><summary>Histórico de avaliações</summary><Table compact label={'Avaliações de ' + row.name}
        rows={row.valuations.map(valuation => ({ ...valuation, id: valuation._id }))}
        columns={[{ key: 'date', label: 'Data', render: valuation => formatDate(valuation.date) }, { key: 'value', label: 'Valor', render: valuation => money(valuation.value) },
          { key: 'notes', label: 'Observação', render: valuation => valuation.notes || '—' }]} /></details>}
    </article>
  }
  return <div className="ledger-stack">
    {error && <p className="module-notice" role="alert">{error}</p>}
    <AssetEditor key={editing || 'new'} asset={asset} accounts={data.accounts} onDone={() => setEditing('')} />
    <section className="panel detail-panel"><h2>Bens ativos avaliados · {money(total)}</h2>
      <p>Aquisições com valor informado {money(cost)} · Variação estimada dos bens comparáveis {money(variation)}</p>
      <p>Estimativas manuais. Bens representados em contas e obrigações ficam fora deste total.</p>
      {totals.length > 0 && <ul>{totals.map(row => <li key={row.name}>{row.name} · {money(row.value)}</li>)}</ul>}
    </section>
    <div className="progress-grid">{active.map(renderAsset)}</div>
    {data.assets.some(row => !activeAsset(row)) && <section className="panel detail-panel"><h2>Bens vendidos ou baixados</h2>
      <div className="progress-grid">{data.assets.filter(row => !activeAsset(row)).map(renderAsset)}</div></section>}
  </div>
}
