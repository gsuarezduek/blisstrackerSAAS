import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al enviar el correo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-700 to-primary-500 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">BlissTracker</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Recuperar contraseña</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="text-5xl">📧</div>
            <p className="text-gray-700 dark:text-gray-300 font-medium">
              Si el email está registrado, recibirás un enlace para cambiar tu contraseña.
            </p>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Revisá tu bandeja de entrada (y la carpeta de spam).
            </p>
            <Link
              to="/login"
              className="inline-block mt-4 text-primary-600 dark:text-primary-400 text-sm font-medium hover:underline"
            >
              ← Volver al login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Ingresá tu email y te enviaremos un enlace para restablecer tu contraseña.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="tu@blissmkt.ar"
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-2.5 transition-colors"
            >
              {loading ? 'Enviando...' : 'Enviar enlace'}
            </button>

            <div className="text-center">
              <Link to="/login" className="text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400">
                ← Volver al login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
