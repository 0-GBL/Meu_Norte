import { useEffect, useId, useRef } from 'react'
import { useLedger } from '../LedgerContext.jsx'
import './Progressive.css'

export default function ActionPanel({ title, subtitle, onClose, children }) {
  const { busy, error, feedback } = useLedger()
  const dialog = useRef(null), heading = useRef(null), titleId = useId()
  useEffect(() => {
    const opener = document.activeElement, element = dialog.current
    element.showModal()
    return () => { element.close(); if (opener?.isConnected) opener.focus() }
  }, [])
  useEffect(() => { heading.current?.focus() }, [title])
  return <dialog className="action-panel" ref={dialog} aria-labelledby={titleId} onCancel={event => {
    event.preventDefault(); if (!busy) onClose()
  }} onKeyDown={event => {
    if (event.key !== 'Tab') return
    const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), a[href], input:not([type="hidden"]):not(:disabled), select:not(:disabled), summary, [tabindex="0"]')]
      .filter(element => element.getClientRects().length && (!element.checkVisibility || element.checkVisibility()))
    if (event.shiftKey && [controls[0], heading.current].includes(document.activeElement)) { event.preventDefault(); controls.at(-1)?.focus() }
    else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus() }
  }}>
    <div className="action-panel-body">
      <div className="action-panel-close"><button type="button" className="action-button" disabled={busy} onClick={onClose}>Fechar painel</button></div>
      <header><h2 id={titleId} tabIndex={-1} ref={heading}>{title}</h2>{subtitle && <p>{subtitle}</p>}</header>
      {error && <p role="alert">{error}</p>}
      {feedback && <p role="status">{feedback}</p>}
      {children}
    </div>
  </dialog>
}
