import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

const LedgerContext = createContext(null)
const api = (import.meta.env.VITE_LEDGER_API_URL || '/').replace(/\/$/, '')

async function request(path, { idempotencyKey, method = 'GET', body, signal } = {}) {
  const response = await fetch(api + '/api' + path, {
    method, signal, credentials: 'include', redirect: 'error',
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) {
    const error = new Error(data?.message ?? 'Não foi possível consultar a API financeira.')
    error.status = response.status
    throw error
  }
  return data
}

export function LedgerProvider({ children }) {
  const { key: locationKey } = useLocation()
  const [data, setData] = useState(null)
  const [user, setUser] = useState(null)
  const [auth, setAuth] = useState({ ready: false, recovery: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const active = useRef(false)
  const pendingCreates = useRef(new Map())
  const readLedger = useCallback(async (path, signal) => {
    try { return await request('/ledger' + path, { signal }) }
    catch (error) {
      if (error.status === 401) {
        pendingCreates.current.clear()
        setUser(null)
        setData(null)
      }
      throw error
    }
  }, [])

  useEffect(() => {
    if (!feedback || feedback.pending) return
    const timer = setTimeout(() => setFeedback(null), 4500)
    return () => clearTimeout(timer)
  }, [feedback])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    async function loadSession() {
      try {
        const session = await request('/auth/session', { signal })
        if (signal.aborted) return
        setUser(session.user)
        setAuth({ ready: true, recovery: session.recovery })
        if (session.user && !session.user.mustChangePassword) {
          const ledger = await request('/ledger', { signal })
          if (!signal.aborted) setData(ledger)
        }
      } catch (error) {
        if (signal.aborted) return
        setAuth(current => ({ ...current, ready: true }))
        if (error.status === 401) { setUser(null); setData(null) }
        else setError('Não foi possível carregar a sessão. Confira se o serviço está disponível.')
      }
    }
    void loadSession()
    return () => controller.abort()
  }, [])

  function clearSession() {
    pendingCreates.current.clear()
    setUser(null)
    setData(null)
  }

  async function run(operation) {
    if (active.current) return false
    active.current = true
    setBusy(true)
    setError('')
    try {
      return await operation()
    } catch (error) {
      setError(error instanceof TypeError ? 'O serviço está indisponível. Tente novamente em instantes.' : error.message)
      return false
    } finally {
      active.current = false
      setBusy(false)
    }
  }

  const authenticate = (action, body) => run(async () => {
    let result
    try { result = await request('/auth/' + action, { method: 'POST', body }) }
    catch (error) {
      if (action === 'password' && error.status === 401) clearSession()
      throw error
    }
    if (action === 'forgot') return result.message
    if (action === 'reset' || action === 'logout') {
      clearSession()
      return true
    }
    if (action === 'login') clearSession()
    setUser(result.user)
    if (!result.user.mustChangePassword && (action === 'login' || user?.mustChangePassword)) {
      setData(await request('/ledger'))
    }
    return true
  })

  const refresh = () => run(async () => {
    try {
      setData(await request('/ledger'))
    } catch (error) {
      if (error.status === 401) clearSession()
      throw error
    }
    return true
  })

  const mutate = (path, method, body) => run(async () => {
    const fingerprint = path + ':' + JSON.stringify(body)
    let idempotencyKey
    if (method === 'POST') {
      idempotencyKey = pendingCreates.current.get(fingerprint) ?? crypto.randomUUID()
      pendingCreates.current.set(fingerprint, idempotencyKey)
    }
    setFeedback({ locationKey, pending: true, text: 'Salvando…' })
    try {
      const result = await request('/ledger' + path, { method, body, idempotencyKey })
      const { mutation, ...ledger } = result
      setData(ledger)
      if (idempotencyKey) pendingCreates.current.delete(fingerprint)
      setFeedback({ locationKey, text: mutation?.message ?? (method === 'DELETE' ? 'Registro excluído.' : 'Alteração salva.') })
    } catch (error) {
      setFeedback(null)
      if (error.status === 401) clearSession()
      else if (error.status >= 400 && error.status < 500 && idempotencyKey) pendingCreates.current.delete(fingerprint)
      throw error
    }
    return true
  })

  return <LedgerContext.Provider value={{
    data, user, auth, busy, error, mutate, authenticate, refresh, readLedger,
    feedback: feedback?.locationKey === locationKey ? feedback.text : '',
  }}>{children}</LedgerContext.Provider>
}

export const useLedger = () => useContext(LedgerContext)
