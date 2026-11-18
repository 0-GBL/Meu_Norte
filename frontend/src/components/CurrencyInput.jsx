import { useEffect, useRef } from 'react'
import { editCurrency, pasteCurrency } from '../currencyInput.js'

export default function CurrencyInput({ inputRef, negative = false, defaultValue = '', onValueChange, ...props }) {
  const ownRef = useRef(null)
  const ref = inputRef ?? ownRef
  const last = useRef(defaultValue)

  function apply(result) {
    if (!result) return
    const field = ref.current
    field.value = result.value
    last.current = result.value
    field.setSelectionRange(result.position, result.position)
    onValueChange?.(field)
  }

  function edit(text, type = 'insertText') {
    const field = ref.current
    apply(editCurrency(last.current, field.selectionStart, field.selectionEnd, text, type, negative))
  }

  useEffect(() => {
    const field = ref.current
    const reset = () => { last.current = defaultValue }
    field.form?.addEventListener('reset', reset)
    // Native beforeinput covers mobile keyboards, including deletions across separators.
    const before = event => {
      if (!event.cancelable || event.isComposing) return
      if (event.inputType === 'insertText' || ['deleteContentBackward', 'deleteContentForward'].includes(event.inputType)) {
        event.preventDefault()
        edit(event.data, event.inputType)
      }
    }
    field.addEventListener('beforeinput', before)
    return () => { field.form?.removeEventListener('reset', reset); field.removeEventListener('beforeinput', before) }
  })

  return <input {...props} ref={ref} data-currency-input="" type="text" inputMode="numeric"
    placeholder="R$ 0,00" defaultValue={defaultValue} maxLength={24}
    onKeyDown={event => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        edit('', event.key === 'Backspace' ? 'deleteContentBackward' : 'deleteContentForward')
      } else if (event.key.length === 1) {
        event.preventDefault()
        edit(event.key)
      }
    }}
    onPaste={event => {
      event.preventDefault()
      const next = pasteCurrency(event.clipboardData.getData('text'), negative)
      if (next !== null) apply({ value: next, position: next.length })
    }}
    onChange={event => {
      // Fallback for autofill, composition and input methods without cancelable beforeinput.
      const raw = event.currentTarget.value
      const next = raw === '' ? '' : /[R$,.]/.test(raw) ? pasteCurrency(raw, negative) :
        /^\d+$/.test(raw) ? editCurrency('', 0, 0, raw, 'insertText', negative).value : null
      apply({ value: next ?? last.current, position: (next ?? last.current).length })
    }} />
}
