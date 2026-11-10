import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Table } from '../components/Details.jsx'
import { money } from '../demo/finance.js'
import { useLedger } from '../LedgerContext.jsx'
import { localDay, toCents } from '../ledgerFormat.js'

const frequencies = { once: 'Uma vez', weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual' }
const assetKinds = { vehicle: 'Veículo', property: 'Imóvel', equipment: 'Equipamento', investment: 'Investimento ou reserva', other: 'Outro bem', debt: 'Dívida ou obrigação' }
const amountInput = cents => cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',')

export function reminderItems(data) {
  return [
    ...data.reminders.filter(row => row.status === 'active').map(row => ({ id: row._id, name: row.name, detail: frequencies[row.frequency], date: row.effectiveDate })),
    ...data.assets.filter(row => row.reviewOn).map(row => ({ id: row._id, name: row.name, detail: 'Revisão patrimonial', date: row.reviewOn })),
  ].sort((a, b) => a.date.localeCompare(b.date))
}

export function RemindersPage() {
  const { data, busy, error, mutate } = useLedger()
  const [editing, setEditing] = useState(null)
  const [message, setMessage] = useState('')
  const active = data.reminders.filter(row => row.status === 'active')
  const closed = data.reminders.filter(row => row.status !== 'active')
  const reviews = data.assets.filter(row => row.reviewOn).sort((a, b) => a.reviewOn.localeCompare(b.reviewOn))
  const today = localDay()

  const submit = async event => {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const input = fields.get('amount').trim()
    const amount = input ? toCents(input) : null
    if (input && (!amount || amount < 0)) return setMessage('Informe um valor positivo com até duas casas decimais.')
    setMessage('')
    if (await mutate(editing ? '/reminders/' + editing._id : '/reminders', editing ? 'PUT' : 'POST',
      { name: fields.get('name'), dueOn: fields.get('dueOn'), frequency: fields.get('frequency'), amount })) {
      form.reset()
      setEditing(null)
    }
  }

  const act = (row, action, until) => mutate('/reminders/' + row._id + '/actions', 'POST',
    { action, occurrence: row.effectiveDate, ...(until && { until }) })

  return <div className="ledger-stack">
    <section className="panel detail-panel">
      <h2>{editing ? 'Editar lembrete' : 'Novo lembrete'}</h2>
      <form className="ledger-form" onSubmit={submit} key={editing?._id ?? 'new'}><fieldset disabled={busy}>
        <label>Nome<input name="name" required maxLength={120} defaultValue={editing?.name} /></label>
        <label>Data prevista<input name="dueOn" type="date" required defaultValue={editing?.dueOn ?? today} /></label>
        <label>Periodicidade<select name="frequency" defaultValue={editing?.frequency}>{Object.entries(frequencies).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Valor de referência (R$)<input name="amount" inputMode="decimal" defaultValue={amountInput(editing?.amount)} /></label>
        <div className="ledger-actions"><button className="action-button">Salvar lembrete</button>
          {editing && <button className="action-button" type="button" onClick={() => setEditing(null)}>Cancelar edição</button>}
        </div>
      </fieldset></form>
      {(message || error) && <p role="alert">{message || error}</p>}
    </section>
    <section className="panel detail-panel">
      <h2>Central de notificações</h2>
      <p>A confirmação encerra a ocorrência do lembrete. Registre receitas e despesas na seção Movimentações.</p>
      {!active.length && !reviews.length && <p>Você ainda não tem lembretes ativos.</p>}
      {active.map(row => <article className="panel detail-panel" key={row._id}>
        <h3><strong>{row.name}</strong></h3>
        <p>{row.effectiveDate} · {row.effectiveDate < today ? 'Em atraso' : row.effectiveDate === today ? 'Hoje' : 'Agendado'} · {frequencies[row.frequency]}{row.amount && ' · ' + money(row.amount)}</p>
        <div className="ledger-actions">
          <button className="action-button" type="button" disabled={busy} onClick={() => act(row, 'confirm')}>Confirmar ocorrência</button>
          <button className="action-button" type="button" disabled={busy} onClick={() => { setEditing(row); document.getElementById('conteudo').scrollIntoView() }}>Editar</button>
          <button className="action-button" type="button" disabled={busy} onClick={() => act(row, 'cancel')}>Cancelar lembrete</button>
        </div>
        <form className="ledger-form" onSubmit={event => {
          event.preventDefault()
          void act(row, 'snooze', new FormData(event.currentTarget).get('until'))
        }}>
          <label>Adiar até<input name="until" type="date" required /></label>
          <button className="action-button" disabled={busy}>Adiar</button>
        </form>
      </article>)}
      {reviews.map(row => <p key={row._id}>{row.reviewOn} · Revisar {row.name} · <Link className="text-link" to="/patrimonio">Ir ao patrimônio</Link></p>)}
    </section>
    {closed.length > 0 && <section className="panel detail-panel"><h2>Lembretes encerrados</h2>
      <Table label="Lembretes encerrados" rows={closed.map(row => ({ ...row, id: row._id }))} columns={[
        { key: 'name', label: 'Nome' }, { key: 'status', label: 'Situação', render: row => row.status === 'completed' ? 'Confirmado' : 'Cancelado' },
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
    const value = !asset ? toCents(fields.get('value')) : null
    if ((fields.get('acquired') && (!acquired || acquired < 0)) || (!asset && (value === null || value < 0))) {
      return setMessage('Confira os valores informados em reais.')
    }
    setMessage('')
    const payload = {
      name: fields.get('name'), kind: fields.get('kind'), acquired,
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
      <label>Valor de aquisição (R$)<input name="acquired" inputMode="decimal" defaultValue={amountInput(asset?.acquired)} /></label>
      <label>Já representado em uma conta<select name="accountId" defaultValue={asset?.accountId ?? ''}><option value="">Nenhuma conta</option>{accounts.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></label>
      {!asset && <><label>Valor atual (R$)<input name="value" inputMode="decimal" required /></label><label>Data da avaliação<input name="date" type="date" defaultValue={localDay()} max={localDay()} required /></label></>}
      <label>Lembrete de revisão<input name="reviewOn" type="date" defaultValue={asset?.reviewOn ?? ''} /></label>
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
    await mutate('/assets/' + asset._id + '/valuations', 'POST', { value, date: fields.get('date'), reviewOn: fields.get('reviewOn') || null })
  }
  return <form className="ledger-form" onSubmit={submit}><fieldset disabled={busy}>
    <label>Valor revisado (R$)<input name="value" inputMode="decimal" required defaultValue={amountInput(asset.valuations[0]?.value)} /></label>
    <label>Data da avaliação<input name="date" type="date" required max={localDay()} defaultValue={localDay()} /></label>
    <label>Próximo lembrete<input name="reviewOn" type="date" /></label>
    <div className="ledger-actions"><button className="action-button">Registrar avaliação</button></div>
  </fieldset>{message && <p role="alert">{message}</p>}</form>
}

export function AssetsPage() {
  const { data, error } = useLedger()
  const [editing, setEditing] = useState('')
  const asset = data.assets.find(row => row._id === editing)
  const total = data.assets.reduce((sum, row) => row.accountId ? sum :
    sum + (row.kind === 'debt' ? -1 : 1) * (row.valuations[0]?.value ?? 0), data.total)
  return <div className="ledger-stack">
    {error && <p className="demo-notice" role="alert">{error}</p>}
    <AssetEditor key={editing || 'new'} asset={asset} accounts={data.accounts} onDone={() => setEditing('')} />
    <section className="panel detail-panel"><h2>Patrimônio estimado · {money(total)}</h2>
      <p>O total reúne saldos de contas e avaliações manuais, com dedução das dívidas e exclusão dos bens já vinculados a uma conta.</p>
    </section>
    <div className="progress-grid">{data.assets.map(row => <article className="panel detail-panel" key={row._id}>
      <h2>{row.name}</h2>
      <p>{assetKinds[row.kind]} · {money(row.valuations[0]?.value ?? 0)}</p>
      {row.acquired !== null && <p>Valor de aquisição {money(row.acquired)}</p>}
      {row.accountId && <p>Representado em {data.accounts.find(account => account._id === row.accountId)?.name}</p>}
      {row.reviewOn && <p>Revisar em {row.reviewOn}</p>}
      <button className="action-button" type="button" onClick={() => { setEditing(row._id); document.getElementById('conteudo').scrollIntoView() }}>Editar dados ou lembrete</button>
      <details><summary>Registrar avaliação manual</summary><ValuationForm key={row.valuations[0]?._id} asset={row} /></details>
      <details><summary>Histórico de avaliações</summary><Table label={'Avaliações de ' + row.name}
        rows={row.valuations.map(valuation => ({ ...valuation, id: valuation._id }))}
        columns={[{ key: 'date', label: 'Data' }, { key: 'value', label: 'Valor', render: valuation => money(valuation.value) }]} /></details>
    </article>)}</div>
  </div>
}
