import { useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import api from '../api/client'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Las contraseñas no coinciden')
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, password })
      navigate('/login?reset=ok')
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cambiar la contraseña')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-700 to-primary-500 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-8 text-center space-y-4">
          <div className="text-5xl">⚠️</div>
          <p className="text-gray-700 dark:text-gray-300 font-medium">Enlace inválido</p>
          <Link to="/login" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
            ← Volver al login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-700 to-primary-500 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">BlissTracker</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Nueva contraseña</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nueva contraseña</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirmar contraseña</label>
            <input
              type="password"
              required
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Repetí la contraseña"
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
            {loading ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
