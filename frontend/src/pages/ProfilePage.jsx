import { useState } from 'react'
import { useLedger } from '../LedgerContext.jsx'

export default function ProfilePage() {
  const { user, busy, error, authenticate } = useLedger()
  const [message, setMessage] = useState('')
  const [validation, setValidation] = useState('')

  async function changePassword(event) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const newPassword = fields.get('newPassword')
    setMessage('')
    if (newPassword !== fields.get('confirmation')) {
      setValidation('A confirmação precisa ser igual à nova senha.')
      return
    }
    setValidation('')
    if (await authenticate('password', { currentPassword: fields.get('currentPassword'), newPassword })) {
      form.reset()
      setMessage('Senha atualizada. As sessões anteriores foram encerradas.')
    }
  }

  return <div className="ledger-stack">
    <h1>Meu Perfil</h1>
    <section className="panel detail-panel">
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </section>
    <details className="panel detail-panel" open={user.mustChangePassword || undefined}>
      <summary>Alterar senha</summary>
      {user.mustChangePassword && <p>Troque a senha inicial para acessar o espaço financeiro.</p>}
      <p>Use pelo menos 12 caracteres e até 72 bytes.</p>
      <form className="ledger-form" onSubmit={changePassword}>
        <fieldset disabled={busy}>
          <label>Senha atual<input type="password" name="currentPassword" autoComplete="current-password" required /></label>
          <label>Nova senha<input type="password" name="newPassword" autoComplete="new-password" minLength={12} required /></label>
          <label>Confirmar nova senha<input type="password" name="confirmation" autoComplete="new-password" minLength={12} required /></label>
          <div className="ledger-actions"><button className="action-button">{busy ? 'Salvando…' : 'Atualizar senha'}</button></div>
        </fieldset>
      </form>
      {(validation || error) && <p role="alert">{validation || error}</p>}
      {message && <p role="status">{message}</p>}
    </details>
  </div>
}
