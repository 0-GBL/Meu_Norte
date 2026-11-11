import { useEffect, useId, useRef, useState } from 'react'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { MAX_MONEY_CENTS, validCents } from '../../../shared/financialRules.mjs'
import { dateMessage, editDate, formatDate, formatMoney, moneyDraft, parseDate, toCents } from '../ledgerFormat.js'
import DateCalendar from './DateCalendar.jsx'

function useReset(input, reset) {
  useEffect(() => {
    const form = input.current?.form
    form?.addEventListener('reset', reset)
    return () => form?.removeEventListener('reset', reset)
  }, [input, reset])
}

export function MoneyField({ label, name, defaultValue = '', required, negative = false, zero = false }) {
  const id = useId()
  const input = useRef(null)
  const [error, setError] = useState('')
  const initial = defaultValue === '' || defaultValue == null ? '' : formatMoney(toCents(String(defaultValue)) ?? 0)
  const last = useRef(initial)

  useReset(input, () => {
    last.current = initial
    input.current.setCustomValidity('')
    setError('')
  })

  function validate(event, format = false) {
    const field = event.currentTarget
    const value = field.value.trim()
    const amount = toCents(value)
    const message = !value
      ? required ? 'Informe um valor.' : ''
      : !validCents(amount, { negative, zero })
        ? 'Informe ' + (negative ? 'um valor válido' : zero ? 'um valor a partir de zero' : 'um valor positivo') +
          ', com até duas casas decimais e limite de ' + formatMoney(MAX_MONEY_CENTS) + '.'
        : ''
    field.setCustomValidity(message)
    setError(message)
    if (format && !message && value) {
      field.value = formatMoney(amount)
      last.current = field.value
    }
  }

  function change(event) {
    const field = event.currentTarget
    const previous = last.current
    const draft = moneyDraft(field.value, negative)
    const next = draft ?? previous
    if (next !== field.value) {
      const removed = Math.max(0, field.value.length - next.length)
      const position = Math.max(0, (field.selectionStart ?? field.value.length) - removed)
      field.value = next
      field.setSelectionRange(position, position)
    }
    last.current = next
    validate(event)
  }

  function edit(event) {
    const field = event.currentTarget
    if (!field.value.includes('R$')) return
    const plain = value => value.replace(/R\$\s*/g, '').replaceAll('.', '')
    const position = plain(field.value.slice(0, field.selectionStart ?? field.value.length)).length
    field.value = plain(field.value)
    field.setSelectionRange(position, position)
    last.current = field.value
  }

  return <div className="form-field">
    <label htmlFor={id}>{label}{!required && <span className="field-optional"> (opcional)</span>}</label>
    <input id={id} ref={input} name={name} inputMode="decimal" placeholder="R$ 0,00" maxLength={24}
      required={required} defaultValue={initial} aria-invalid={Boolean(error)} aria-describedby={error ? id + '-error' : undefined}
      onFocus={edit} onChange={change} onBlur={event => validate(event, true)} onInvalid={event => validate(event)} />
    {error && <small id={id + '-error'} className="field-error" aria-live="polite">{error}</small>}
  </div>
}

export function DateField({ label, name, defaultValue = '', required, min, max }) {
  const id = useId()
  const input = useRef(null)
  const trigger = useRef(null)
  const [draft, setDraft] = useState(() => formatDate(defaultValue))
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const iso = parseDate(draft)
  useReset(input, () => {
    setDraft(formatDate(defaultValue))
    setError('')
    input.current.setCustomValidity('')
  })

  function validate(value, showIncomplete = false) {
    const options = { required, min, max, original: defaultValue }
    const message = dateMessage(value, { ...options, complete: true })
    input.current.setCustomValidity(message)
    return showIncomplete ? message : dateMessage(value, options)
  }

  function change(event) {
    const field = event.currentTarget
    const { value, position } = editDate(draft, field.value, field.selectionStart ?? field.value.length, event.nativeEvent.inputType)
    setDraft(value)
    setError(validate(value))
    if (field.value !== value) {
      field.value = value
      field.setSelectionRange(position, position)
    }
  }

  function choose(date) {
    const value = formatDate(date)
    setDraft(value)
    setError(validate(value))
  }

  return <div className="form-field">
    <label htmlFor={id}>{label}{!required && <span className="field-optional"> (opcional)</span>}</label>
    <div className="field-with-picker">
      <input id={id} ref={input} type="text" inputMode="numeric" placeholder="DD/MM/AAAA" maxLength={16} required={required}
        value={draft} onChange={change} onBlur={() => setError(validate(draft, true))} onInvalid={() => setError(validate(draft, true))}
        aria-invalid={Boolean(error)} aria-describedby={error ? id + '-error' : undefined} />
      <button ref={trigger} type="button" className="date-picker-control" aria-haspopup="dialog" aria-expanded={open}
        aria-label={'Abrir calendário para ' + label.toLowerCase()} onClick={() => setOpen(true)}><CalendarDays size={17} aria-hidden="true" /></button>
    </div>
    <input type="hidden" name={name} value={iso} />
    {open && <DateCalendar label={label} selected={iso} min={min} max={max} onSelect={choose}
      onClose={() => { setOpen(false); trigger.current?.focus() }} />}
    {error && <small id={id + '-error'} className="field-error" aria-live="polite">{error}</small>}
  </div>
}

export function SmallIntegerField({ label, name, defaultValue, readOnly, max = 31, picker = false }) {
  const id = useId()
  const input = useRef(null)
  const [value, setValue] = useState(defaultValue == null ? '' : String(defaultValue))
  const [error, setError] = useState('')
  useReset(input, () => { setValue(defaultValue == null ? '' : String(defaultValue)); input.current.setCustomValidity(''); setError('') })
  function update(next, showError = false) {
    const valid = /^\d{1,2}$/.test(next) && Number(next) >= 1 && Number(next) <= max
    const message = valid ? '' : 'Informe um número inteiro de 1 a ' + max + '.'
    input.current.setCustomValidity(message)
    setError(next || showError ? message : '')
    setValue(next)
  }
  return <div className="form-field">
    <label htmlFor={id}>{label}</label>
    <div className="field-with-picker">
      <input id={id} ref={input} name={name} inputMode="numeric" pattern="[0-9]{1,2}" maxLength={2} required
        readOnly={readOnly} value={value} onChange={event => update(event.target.value.replace(/\D/g, '').slice(0, 2))}
        onInvalid={() => update(value, true)} aria-invalid={Boolean(error)} aria-describedby={error ? id + '-error' : undefined} />
      {!readOnly && picker && <div className="date-picker-control">
        <ChevronDown size={17} aria-hidden="true" />
        <select aria-label={'Selecionar ' + label.toLowerCase()} value={Number(value) >= 1 && Number(value) <= max ? String(Number(value)) : ''} onChange={event => update(event.target.value)}>
          <option value="" disabled>Dia</option>
          {Array.from({ length: max }, (_, index) => <option key={index + 1}>{index + 1}</option>)}
        </select>
      </div>}
    </div>
    {error && <small id={id + '-error'} className="field-error" aria-live="polite">{error}</small>}
  </div>
}
