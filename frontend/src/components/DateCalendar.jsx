import { useEffect, useId, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { formatDate, localDay } from '../ledgerFormat.js'

const months = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat('pt-BR', {
  month: 'long', timeZone: 'UTC',
}).format(new Date(Date.UTC(2024, index, 1))))
const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const asDate = iso => new Date(iso + 'T00:00:00Z')
const isoDay = date => date.toISOString().slice(0, 10)

export default function DateCalendar({ label, selected, min, max, onSelect, onClose }) {
  const heading = useId()
  const dialog = useRef(null)
  const grid = useRef(null)
  const lower = min && min > '1900-01-01' ? min : '1900-01-01'
  const upper = max && max < '2199-12-31' ? max : '2199-12-31'
  const clamp = date => date < lower ? lower : date > upper ? upper : date
  const [active, setActive] = useState(() => clamp(selected || localDay()))
  const [focusDay, setFocusDay] = useState(false)
  const month = active.slice(0, 7)
  const [year, monthNumber] = month.split('-').map(Number)
  const start = asDate(month + '-01')
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const firstDay = start.getUTCDay()
  const yearStart = Number(lower.slice(0, 4))
  const yearEnd = Number(upper.slice(0, 4))

  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal()
    grid.current.querySelector('[tabindex="0"]')?.focus()
  }, [])

  useEffect(() => {
    if (!focusDay) return
    grid.current.querySelector('[tabindex="0"]')?.focus()
  }, [active, focusDay])

  function moveMonth(offset) {
    const date = asDate(month + '-01')
    date.setUTCMonth(date.getUTCMonth() + offset)
    setFocusDay(false)
    setActive(clamp(isoDay(date)))
  }

  function jump(nextYear, nextMonth) {
    setFocusDay(false)
    setActive(clamp(nextYear + '-' + String(nextMonth).padStart(2, '0') + '-01'))
  }

  function handleDayKey(event) {
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (!Object.hasOwn(offsets, event.key)) return
    event.preventDefault()
    const date = asDate(active)
    date.setUTCDate(date.getUTCDate() + offsets[event.key])
    setFocusDay(true)
    setActive(clamp(isoDay(date)))
  }

  return <dialog ref={dialog} className="date-calendar" aria-labelledby={heading} onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) dialog.current.close() }}>
    <div className="date-calendar-body">
      <div className="date-calendar-header">
        <h2 id={heading}>Calendário · {label}</h2>
        <button type="button" className="calendar-icon" aria-label="Fechar calendário" onClick={() => dialog.current.close()}><X size={16} /></button>
      </div>
      <div className="date-calendar-nav">
        <button type="button" className="calendar-icon" aria-label="Mês anterior" disabled={month <= lower.slice(0, 7)} onClick={() => moveMonth(-1)}><ChevronLeft size={16} /></button>
        <select aria-label="Mês" value={monthNumber} onChange={event => jump(year, Number(event.target.value))}>
          {months.map((name, index) => {
            const key = year + '-' + String(index + 1).padStart(2, '0')
            return <option key={name} value={index + 1} disabled={key < lower.slice(0, 7) || key > upper.slice(0, 7)}>{name}</option>
          })}
        </select>
        <select aria-label="Ano" value={year} onChange={event => jump(Number(event.target.value), monthNumber)}>
          {Array.from({ length: yearEnd - yearStart + 1 }, (_, index) => <option key={yearStart + index}>{yearStart + index}</option>)}
        </select>
        <button type="button" className="calendar-icon" aria-label="Próximo mês" disabled={month >= upper.slice(0, 7)} onClick={() => moveMonth(1)}><ChevronRight size={16} /></button>
      </div>
      <div className="date-calendar-grid" ref={grid} onKeyDown={handleDayKey}>
        {weekdays.map(day => <span className="calendar-weekday" key={day} aria-hidden="true">{day}</span>)}
        {Array.from({ length: firstDay }, (_, index) => <span key={'blank-' + index} />)}
        {Array.from({ length: days }, (_, index) => {
          const date = month + '-' + String(index + 1).padStart(2, '0')
          return <button type="button" className="calendar-day" key={date} disabled={date < lower || date > upper}
            aria-label={formatDate(date)} aria-pressed={date === selected} aria-current={date === localDay() ? 'date' : undefined}
            tabIndex={date === active ? 0 : -1} onClick={() => { onSelect(date); dialog.current.close() }}>{index + 1}</button>
        })}
      </div>
    </div>
  </dialog>
}
