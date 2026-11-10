import { createContext, useContext, useEffect, useRef, useState } from 'react'

const LedgerContext = createContext(null)
const base = import.meta.env.VITE_LEDGER_API_URL
const api = base?.replace(/\/$/, '')

async function request(path, { key, idempotencyKey, method = 'GET', body, signal } = {}) {
  const response = await fetch(api + '/api' + path, {
    method, signal, credentials: 'include', redirect: 'error',
    headers: {
      ...(key && { Authorization: 'Bearer ' + key }),
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
  const enabled = Boolean(base)
  const [key, setKey] = useState('')
  const [data, setData] = useState(null)
  const [user, setUser] = useState(null)
  const [auth, setAuth] = useState({ ready: !enabled, recovery: false, localAccess: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(false)
  const pendingCreates = useRef(new Map())

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const { signal } = controller
    async function loadSession() {
      try {
        const session = await request('/auth/session', { signal })
        if (signal.aborted) return
        setUser(session.user)
        setAuth({ ready: true, recovery: session.recovery, localAccess: session.localAccess })
        if (session.user) {
          const ledger = await request('/ledger', { signal })
          if (!signal.aborted) setData(ledger)
        }
      } catch {
        if (signal.aborted) return
        setAuth(current => ({ ...current, ready: true }))
        setError('Não foi possível carregar a sessão. Confira se o serviço está disponível.')
      }
    }
    void loadSession()
    return () => controller.abort()
  }, [enabled])

  function clearSession() {
    pendingCreates.current.clear()
    setKey('')
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

  const connect = access => run(async () => {
    setData(await request('/ledger', { key: access }))
    setKey(access)
    return true
  })

  const authenticate = (action, body) => run(async () => {
    const result = await request('/auth/' + action, { method: 'POST', body })
    if (action === 'forgot') return result.message
    if (action === 'reset' || action === 'logout') {
      clearSession()
      return true
    }
    clearSession()
    setUser(result.user)
    setData(await request('/ledger'))
    return true
  })

  const refresh = () => run(async () => {
    try {
      setData(await request('/ledger', { key }))
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
    try {
      setData(await request('/ledger' + path, { key, method, body, idempotencyKey }))
      if (idempotencyKey) pendingCreates.current.delete(fingerprint)
    } catch (error) {
      if (error.status === 401) clearSession()
      else if (error.status >= 400 && error.status < 500 && idempotencyKey) pendingCreates.current.delete(fingerprint)
      throw error
    }
    return true
  })

  const disconnect = () => {
    if (active.current) return
    pendingCreates.current.clear()
    setKey('')
    setData(null)
    setError('')
  }

  return <LedgerContext.Provider value={{
    enabled, data, user, auth, busy, error, connect, disconnect, mutate, authenticate, refresh,
    localConnected: Boolean(key),
  }}>{children}</LedgerContext.Provider>
}

export const useLedger = () => useContext(LedgerContext)
