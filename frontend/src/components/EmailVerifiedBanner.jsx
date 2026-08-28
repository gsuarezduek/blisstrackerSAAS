import { useState } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

/**
 * Banner global persistente (sin botón de cerrar) mientras el email primario
 * del usuario no esté verificado. Se monta en Navbar.jsx, igual que TrialBanner.
 */
export default function EmailVerifiedBanner() {
  const { user } = useAuth()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  if (!user || user.emailVerified !== false) return null

  async function handleResend() {
    setSending(true)
    setError('')
    try {
      await api.post('/auth/resend-verification')
      setSent(true)
      setTimeout(() => setSent(false), 60000)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo reenviar el email')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="relative z-40 px-4 py-2.5 text-sm flex items-center justify-center gap-3 bg-amber-500 text-white flex-wrap">
      <span className="text-center">
        📧 Todavía no verificaste tu email ({user.email}). Revisá tu casilla y hacé click en el enlace.
        {error && <span className="ml-2 opacity-90">{error}</span>}
      </span>
      <button
        onClick={handleResend}
        disabled={sending || sent}
        className="flex-shrink-0 underline font-semibold hover:opacity-80 disabled:opacity-70 disabled:no-underline"
      >
        {sent ? 'Enviado ✓' : sending ? 'Enviando…' : 'Reenviar email'}
      </button>
    </div>
  )
}
