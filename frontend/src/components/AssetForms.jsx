import { useEffect, useRef, useState } from 'react'
import { useLedger } from '../LedgerContext.jsx'
import { DateField, MoneyField } from './FinancialFields.jsx'
import { formatDate, localDay, money, toCents } from '../ledgerFormat.js'
import { saleKey } from '../../../shared/assetReceipts.mjs'

const amountInput = value => value == null ? '' : (value / 100).toFixed(2).replace('.', ',')

export function AssetEditor({ asset, kinds, onDone }) {
  const { data, busy, mutate } = useLedger()
  const [message, setMessage] = useState('')
  async function submit(event) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const acquired = fields.get('acquired') ? toCents(fields.get('acquired')) : null
    const value = !asset && fields.get('value') ? toCents(fields.get('value')) : null
    if ((fields.get('acquired') && (acquired == null || acquired < 0)) || (!asset && fields.get('value') && (value == null || value < 0))) {
      return setMessage('Confira os valores informados.')
    }
    const payload = {
      name: fields.get('name'), kind: fields.get('kind'), acquired: asset?.purchase?.date ? asset.acquired : acquired,
      acquiredOn: asset?.purchase?.date ? asset.acquiredOn : fields.get('acquiredOn') || null,
      description: fields.get('description').trim(), notes: fields.get('notes').trim(),
      accountId: fields.get('accountId') || null, reviewOn: fields.get('reviewOn') || null,
      ...(!asset && { value, date: fields.get('date') }),
    }
    if (await mutate(asset ? '/assets/' + asset._id : '/assets', asset ? 'PUT' : 'POST', payload)) onDone()
  }
  return <form className="ledger-form asset-short-form" onSubmit={submit}><fieldset disabled={busy}>
    <label>Nome<input name="name" required maxLength={120} defaultValue={asset?.name} autoFocus /></label>
    <label>Categoria<select name="kind" defaultValue={asset?.kind}>{Object.entries(kinds).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
    {!asset?.purchase?.date ? <MoneyField label="Valor de aquisição" name="acquired" zero defaultValue={amountInput(asset?.acquired)} /> :
      <p>Custo de aquisição: {asset.acquired == null ? 'Não informado' : money(asset.acquired)} · Compra registrada</p>}
    <details className="asset-additional"><summary>Informações adicionais</summary><div className="asset-form-fields">
      {!asset?.purchase?.date && <DateField label="Data da aquisição" name="acquiredOn" max={localDay()} defaultValue={asset?.acquiredOn} />}
      <label>Descrição<input name="description" maxLength={120} defaultValue={asset?.description} /></label>
      {!asset && <><MoneyField label="Valor atual estimado" name="value" zero />
        <DateField label="Data da avaliação" name="date" defaultValue={localDay()} max={localDay()} /></>}
      <label>Este bem já está incluído em uma conta?<select name="accountId" defaultValue={asset?.accountId ?? ''}><option value="">Não</option>{data.accounts.filter(row => !row.deletedAt).map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></label>
      <DateField label="Lembrete para revisar o valor" name="reviewOn" defaultValue={asset?.reviewOn} />
      <label>Observações<input name="notes" maxLength={120} defaultValue={asset?.notes} /></label>
    </div></details>
    <button className="action-button asset-primary">Salvar</button>
    {message && <p role="alert">{message}</p>}
  </fieldset></form>
}

export function ValuationForm({ asset, onDone }) {
  const { busy, mutate } = useLedger()
  const [message, setMessage] = useState('')
  async function submit(event) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const value = toCents(fields.get('value'))
    if (value == null || value < 0) return setMessage('Informe um valor a partir de zero.')
    if (await mutate('/assets/' + asset._id + '/valuations', 'POST', { value, date: fields.get('date'),
      reviewOn: fields.get('reviewOn') || null, notes: fields.get('notes').trim() })) onDone()
  }
  return <form className="ledger-form asset-short-form" onSubmit={submit}><fieldset disabled={busy}>
    <MoneyField label="Quanto vale hoje?" name="value" required zero defaultValue={amountInput(asset.valuations[0]?.value)} />
    <details className="asset-additional"><summary>Informações adicionais</summary><div className="asset-form-fields">
      <DateField label="Data da avaliação" name="date" required max={localDay()} defaultValue={localDay()} />
      <DateField label="Lembrete para revisar novamente" name="reviewOn" defaultValue={asset.reviewOn} />
      <label>Observações<input name="notes" maxLength={120} /></label>
    </div></details>
    <button className="action-button asset-primary">Salvar valor</button>
    {message && <p role="alert">{message}</p>}
  </fieldset></form>
}

export function SaleWizard({ asset, onDone }) {
  const { data, busy, mutate } = useLedger()
  const [step, setStep] = useState(1)
  const [sale, setSale] = useState({ amount: null, date: localDay(), received: '', accountId: '', expectedOn: '' })
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState(false)
  const [retry, setRetry] = useState(0)
  const scheduled = useRef(false)
  const current = data.assets.find(row => row._id === asset._id)
  // Scheduling uses the existing receipt API after the sale transaction succeeds.
  // A failure only retries the forecast; it never submits the sale a second time.
  useEffect(() => {
    if (!saved || !current?.sale?.date || scheduled.current) return
    if (!sale.expectedOn || sale.received === 'yes') { onDone(); return }
    scheduled.current = true
    void mutate('/assets/' + asset._id + '/receipt', 'POST', { action: 'schedule', saleKey: saleKey(current.sale), expectedOn: sale.expectedOn, remind: false }).then(ok => {
      if (ok) onDone()
      else setMessage('A venda foi salva. A previsão ainda não foi salva. Tente salvar a previsão novamente ou continue para os detalhes.')
    })
  }, [saved, current?.sale?.operationId, retry])
  const accounts = data.accounts.filter(row => !row.archived && !row.deletedAt)
  async function confirm() {
    if (saved) return
    setMessage('')
    if (await mutate('/assets/' + asset._id + '/operations', 'POST', { type: 'sale', mode: sale.received === 'yes' ? 'new' : 'note',
      amount: sale.amount, date: sale.date, ...(sale.received === 'yes' && { accountId: sale.accountId }) })) setSaved(true)
  }
  return <div className="asset-wizard">
    <p className="asset-step" role="status">{step === 1 ? 'Informar a venda' : 'Conferir e confirmar'}</p>
    {step === 1 && <form className="ledger-form asset-short-form" onSubmit={event => {
      event.preventDefault()
      const fields = new FormData(event.currentTarget), amount = toCents(fields.get('amount'))
      if (!(amount > 0)) return setMessage('Informe o valor da venda.')
      if (sale.received === 'no' && fields.get('expectedOn') && fields.get('expectedOn') < fields.get('date')) return setMessage('A previsão de recebimento deve ser na data da venda ou depois dela.')
      setSale({ ...sale, amount, date: fields.get('date'), accountId: fields.get('accountId') || '', expectedOn: sale.received === 'no' ? fields.get('expectedOn') || '' : '' }); setMessage(''); setStep(3)
    }}><fieldset disabled={busy}>
      <MoneyField label="Valor da venda" name="amount" required defaultValue={amountInput(sale.amount)} />
      <DateField label="Data da venda" name="date" defaultValue={sale.date} min={asset.acquiredOn} max={localDay()} required />
      <label>Você já recebeu o dinheiro?<select value={sale.received} required onChange={event => setSale({ ...sale, received: event.target.value })}>
        <option value="">Selecione</option><option value="yes">Sim, já recebi</option><option value="no">Ainda não</option>
      </select></label>
      {sale.received === 'yes' && <>
        <label>Em qual conta?<select name="accountId" defaultValue={sale.accountId} required><option value="">Selecione</option>{accounts.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></label>
        <p>A entrada será registrada na data da venda. Confira os dados antes de confirmar.</p>
        {!accounts.length && <p>Cadastre ou reative uma conta para confirmar o recebimento.</p>}
      </>}
      {sale.received === 'no' && <><DateField label="Quando espera receber?" name="expectedOn" defaultValue={sale.expectedOn} />
        <p>Você pode deixar a previsão vazia e confirmar o pagamento depois.</p></>}
      <button className="action-button asset-primary">Revisar venda</button>
    </fieldset></form>}
    {step === 3 && <>
      <dl className="asset-facts"><div><dt>Bem</dt><dd>{asset.name}</dd></div><div><dt>Valor da venda</dt><dd>{money(sale.amount)}</dd></div>
        <div><dt>Data da venda</dt><dd>{formatDate(sale.date)}</dd></div><div><dt>Recebimento</dt><dd>{sale.received === 'yes' ? 'Já recebido · ' + accounts.find(row => row._id === sale.accountId)?.name : sale.expectedOn ? 'Previsto para ' + formatDate(sale.expectedOn) : 'Pendente, sem previsão'}</dd></div></dl>
      <p>Depois de confirmar, o valor da venda fica bloqueado.{sale.received === 'no' && ' Esta venda não cria uma entrada na conta.'}</p>
      {!saved && <div className="ledger-actions"><button className="action-button" type="button" disabled={busy} onClick={() => setStep(1)}>Voltar</button>
        <button className="action-button asset-primary" type="button" disabled={busy} onClick={confirm}>{sale.received === 'yes' ? 'Confirmar venda e recebimento' : 'Confirmar venda'}</button></div>}
      {saved && message && <div className="ledger-actions"><button className="action-button" type="button" disabled={busy} onClick={() => { scheduled.current = false; setMessage(''); setRetry(retry + 1) }}>Tentar salvar previsão</button>
        <button className="action-button" type="button" disabled={busy} onClick={onDone}>Ver detalhes</button></div>}
    </>}
    {message && <p role="alert">{message}</p>}
  </div>
}

// Less frequent purchase/linking options retain the existing API and validations.
export function AssetOperationForm({ asset, onDone, initialType = 'purchase' }) {
  const { data, busy, mutate } = useLedger()
  const [type, setType] = useState(initialType)
  const [mode, setMode] = useState('note')
  const [entryId, setEntryId] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(null)
  const entries = data.entries.filter(row => !row.assetId && !row.goalId && !row.cancelledAt && row.type === (type === 'purchase' ? 'expense' : 'income'))
  const entry = entries.find(row => row._id === entryId)
  async function save() {
    if (await mutate('/assets/' + asset._id + '/operations', 'POST', pending)) onDone(pending.type)
  }
  return <form className="ledger-form asset-short-form" onChange={() => setPending(null)} onSubmit={event => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const amount = entry?.amount ?? (type === 'retire' ? undefined : toCents(fields.get('amount')))
    if (type !== 'retire' && !(amount > 0)) return setMessage('Informe um valor positivo para a operação.')
    setPending({ type, mode, amount, date: entry?.date ?? fields.get('date'), ...(mode === 'existing' && { entryId }), ...(mode === 'new' && { accountId: fields.get('accountId') }) })
    setMessage('')
  }}><fieldset disabled={busy}>
    {initialType !== 'retire' && <label>Operação<select value={type} onChange={event => { setType(event.target.value); setMode('note'); setEntryId(''); setPending(null) }}>
      {!asset.purchase?.date && <option value="purchase">Registrar compra</option>}<option value="sale">Vincular uma venda já recebida</option>
    </select></label>}
    {type === 'retire' && <p>Retirar um bem que você não possui mais, sem registrar uma venda. Nenhuma movimentação bancária será criada.</p>}
    {type !== 'retire' && <label>Como registrar?<select value={mode} onChange={event => { setMode(event.target.value); setEntryId(''); setPending(null) }}>
      <option value="note">Somente informativo</option><option value="existing">Usar um lançamento já registrado</option><option value="new">Criar lançamento na conta</option>
    </select></label>}
    {mode === 'existing' ? <label>Lançamento<select value={entryId} required onChange={event => { setEntryId(event.target.value); setPending(null) }}><option value="">Selecione</option>
      {entries.map(row => <option key={row._id} value={row._id}>{formatDate(row.date)} · {row.description} · {money(row.amount)}</option>)}</select></label> : <>
      {type !== 'retire' && <MoneyField label={type === 'purchase' ? 'Valor pago' : 'Valor da venda'} name="amount" required />}
      <DateField label={type === 'retire' ? 'Data da retirada' : 'Data da operação'} name="date" defaultValue={localDay()} max={localDay()} required />
    </>}
    {mode === 'new' && <label>Conta<select name="accountId" required><option value="">Selecione</option>{data.accounts.filter(row => !row.archived && !row.deletedAt).map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</select></label>}
    <button className="action-button" onClick={() => setPending(null)}>Revisar {type === 'retire' ? 'retirada' : 'operação'}</button>
    {pending && <div className="receipt-confirmation" role="region" aria-label="Revisar operação">
      <p>{type === 'retire' ? 'Retirar ' : type === 'purchase' ? 'Registrar compra de ' : 'Registrar venda de '}{asset.name} em {formatDate(pending.date)}{pending.amount != null && ' · ' + money(pending.amount)}.</p>
      <button className="action-button asset-primary" type="button" onClick={save}>Confirmar {type === 'retire' ? 'retirada' : 'operação'}</button>
    </div>}
    {message && <p role="alert">{message}</p>}
  </fieldset></form>
}
