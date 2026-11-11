import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RemoveRecord, Table } from '../components/Details.jsx'
import { money } from '../ledgerFormat.js'
import { useLedger } from '../LedgerContext.jsx'
import { formatDate, localDay, toCents } from '../ledgerFormat.js'
import { DateField, MoneyField } from '../components/FinancialFields.jsx'
import ActionPanel from '../components/ActionPanel.jsx'
import { pendingReviews, reminderGroups } from '../reminderFormat.js'

const frequencies = { once: 'Uma vez', weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual' }
export { assetKinds } from '../assetPresentation.js'
export const reminderKinds = { manual: 'Manual', commitment: 'Compromisso financeiro', account: 'Conta', asset: 'Patrimônio',
  valuation: 'Revisão de avaliação', assetReceipt: 'Recebimento de venda patrimonial', cardClose: 'Fechamento de cartão', cardDue: 'Vencimento de cartão', cardOpen: 'Fatura em aberto' }
const cardKind = kind => kind?.startsWith('card')
const activeAsset = row => !row.endedOn
const amountInput = cents => cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',')

export function reminderItems(data) {
  return [
    ...data.reminders.filter(row => row.status === 'active' && row.effectiveDate).map(row => ({ id: row._id, name: row.name, detail: reminderKinds[row.kind] ?? frequencies[row.frequency], date: row.effectiveDate })),
    ...pendingReviews(data).map(row => ({ id: row._id, name: row.name, detail: 'Revisão patrimonial', date: row.reviewOn })),
  ].sort((a, b) => a.date.localeCompare(b.date))
}

export function RemindersPage() {
  const { data, busy, error, mutate } = useLedger()
  const [params] = useSearchParams()
  const [editing, setEditing] = useState(null)
  const [editorOpen, setEditorOpen] = useState(() => params.has('bem'))
  const [kind, setKind] = useState(() => params.has('bem') ? 'valuation' : 'manual')
  const [message, setMessage] = useState('')
  const today = localDay()
  const { overdue, upcoming, closed } = reminderGroups(data.reminders, today)
  const reviews = pendingReviews(data)
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
      setEditorOpen(false)
    }
  }

  const act = (row, action, until) => mutate('/reminders/' + row._id + '/actions', 'POST',
    { action, occurrence: row.effectiveDate, ...(until && { until }) })

  return <div className="module-page">
    <div className="module-heading"><h2>Seus próximos compromissos</h2><button className="action-button asset-primary" type="button" onClick={() => { setEditing(null); setKind('manual'); setEditorOpen(true) }}>Adicionar lembrete</button></div>
    {editorOpen && <ActionPanel title={editing ? 'Editar lembrete' : 'Adicionar lembrete'} onClose={() => setEditorOpen(false)}>
      <form className="ledger-form" onSubmit={submit} key={editing?._id ?? 'new'}><fieldset disabled={busy}>
        <label>Nome<input name="name" required maxLength={120} defaultValue={editing?.name} /></label>
        {!cardKind(kind) && <DateField label="Data prevista" name="dueOn" required defaultValue={editing?.dueOn ?? today} />}
        <details><summary>Recorrência e informações adicionais</summary><div className="module-options">
        <label>Tipo<select value={kind} onChange={event => setKind(event.target.value)}>{Object.entries(reminderKinds).filter(([key]) => key !== 'assetReceipt').map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
        {linked && <label>Registro vinculado<select key={kind} name="linkId" defaultValue={editing?.linkId ?? params.get('bem') ?? ''} required><option value="">Selecione</option>
          {linkOptions.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></label>}
        {!cardKind(kind) && <>
          <label>Periodicidade<select name="frequency" defaultValue={editing?.frequency}>{Object.entries(frequencies).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        </>}
        <label>Descrição opcional<input name="description" maxLength={120} defaultValue={editing?.description} /></label>
        <label>Horário opcional<input name="time" type="time" defaultValue={editing?.time} /></label>
        <label>Antecedência em dias<input name="leadDays" type="number" min="0" max="365" step="1" defaultValue={editing?.leadDays ?? 0} /></label>
        <MoneyField label="Valor de referência" name="amount" defaultValue={amountInput(editing?.amount)} />
        <p>Concluir um lembrete não cria receitas ou despesas. Registre o pagamento em Movimentações quando ele acontecer.</p>
        </div></details>
        <div className="ledger-actions"><button className="action-button">Salvar lembrete</button>
          {editing && <button className="action-button" type="button" onClick={() => setEditorOpen(false)}>Cancelar edição</button>}
        </div>
      </fieldset></form>
      {(message || error) && <p role="alert">{message || error}</p>}
    </ActionPanel>}
    {error && !editorOpen && <p role="alert">{error}</p>}
    <div id="notificacoes" className="module-section">
      {!overdue.length && !upcoming.length && !reviews.length && <p className="empty-state">Seus lembretes aparecerão aqui. Adicione um compromisso para começar.</p>}
      {[[overdue, 'Lembretes atrasados'], [upcoming, 'Próximos lembretes']].filter(([rows]) => rows.length).map(([rows, title]) => <section className="module-section" key={title}><h2>{title}</h2><div className="module-grid">
      {rows.map(row => <article className="panel module-card" id={row._id} key={row._id}>
        <h3><strong>{row.name}</strong></h3>
        <p>{row.effectiveDate ? formatDate(row.effectiveDate) + (row.time ? ' às ' + row.time : '') : 'Sem ocorrência no momento'} · {row.effectiveDate && row.effectiveDate < today ? 'Em atraso' : row.effectiveDate === today ? 'Hoje' : row.effectiveDate ? 'Agendado' : 'Aguardando data'}</p>
        {row.effectiveDate && <button className="action-button" type="button" disabled={busy} onClick={() => act(row, 'confirm')}>Concluir ocorrência</button>}
        <details><summary>Mais opções</summary><div className="module-options">
        <p>{reminderKinds[row.kind] ?? frequencies[row.frequency]}{row.amount ? ' · ' + money(row.amount) : ''}</p>
        {row.description && <p>{row.description}</p>}
        {row.linkId && <Link className="text-link" to={related(row)}>Ver registro relacionado</Link>}
        <div className="ledger-actions">
          {row.effectiveDate && <>
            <button className="action-button" type="button" disabled={busy} onClick={() => act(row, 'dismiss')}>Dispensar ocorrência</button>
            {!row.read && <button className="action-button" type="button" disabled={busy} onClick={() => act(row, 'read')}>Marcar como lido</button>}
          </>}
          {row.kind === 'assetReceipt' ? <Link className="action-button" to={'/patrimonio#' + row.linkId}>Gerenciar recebimento e previsão</Link> :
            <button className="action-button" type="button" disabled={busy} onClick={() => { setEditing(row); setKind(row.kind ?? 'manual'); setEditorOpen(true) }}>Editar</button>}
          <button className="action-button" type="button" disabled={busy} onClick={() => act(row, 'cancel')}>Cancelar lembrete</button>
          <RemoveRecord label="Excluir lembrete" message="Excluir este lembrete e manter as ocorrências anteriores?" busy={busy} onRemove={() => mutate('/reminders/' + row._id, 'DELETE')} />
        </div>
        {row.effectiveDate && row.kind !== 'assetReceipt' && <form className="ledger-form" onSubmit={event => {
          event.preventDefault()
          void act(row, 'snooze', new FormData(event.currentTarget).get('until'))
        }}>
          <DateField label="Adiar até" name="until" required />
          <button className="action-button" disabled={busy}>Adiar</button>
        </form>}
        </div></details>
      </article>)}</div></section>)}
      {reviews.map(row => <p key={row._id}>{formatDate(row.reviewOn)} · Revisar {row.name} · <Link className="text-link" to={'/patrimonio#' + row._id}>Ver bem</Link></p>)}
    </div>
    {closed.length > 0 && <details><summary>Lembretes concluídos ou encerrados</summary>
      <Table compact label="Lembretes encerrados" rows={closed.map(row => ({ ...row, id: row._id }))} columns={[
        { key: 'name', label: 'Nome' }, { key: 'status', label: 'Situação', render: row => ({ completed: 'Encerrado', deleted: 'Excluído', cancelled: 'Cancelado' })[row.status] },
        { key: 'actions', label: 'Ações', render: row => row.deletedAt ? '—' : <button className="text-link" type="button" disabled={busy} onClick={() => act(row, 'reactivate')}>Reativar</button> },
      ]} />
    </details>}
    {data.reminders.some(row => row.history?.length) && <details><summary>Histórico de ocorrências</summary>
      <Table compact label="Histórico de ocorrências" rows={data.reminders.flatMap(row => (row.history ?? []).map((item, index) => ({ ...item, name: row.name, id: row._id + ':' + index })))
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))} columns={[
        { key: 'name', label: 'Lembrete' }, { key: 'occurrence', label: 'Ocorrência', render: row => formatDate(row.occurrence) },
        { key: 'action', label: 'Situação', render: row => ({ confirm: 'Concluída', dismiss: 'Dispensada', reschedule: 'Reagendada', activate: 'Lembrete ativado', received: 'Recebimento confirmado', cancel: 'Cancelada' })[row.action] ?? row.action },
      ]} />
    </details>}
  </div>
}

export { default as AssetsPage } from './AssetsPage.jsx'
