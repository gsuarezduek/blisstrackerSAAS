import { useEffect, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()
  const { user, updateUser } = useAuth()

  // status: 'loading' | 'ok' | 'error'
  const [status, setStatus] = useState(token ? 'loading' : 'error')
  const [message, setMessage] = useState(token ? '' : 'Enlace inválido')

  useEffect(() => {
    if (!token) return
    api.post('/auth/verify-email', { token })
      .then(({ data }) => {
        setStatus('ok')
        setMessage(data.message || 'Email verificado correctamente')
        // Si ya hay una sesión activa (el owner quedó auto-logueado al crear el
        // workspace), reflejamos el cambio al instante y volvemos al dashboard
        // en vez de dejarlo en esta pantalla intermedia.
        if (user) {
          updateUser({ emailVerified: true })
          setTimeout(() => navigate('/', { replace: true }), 1500)
        }
      })
      .catch(err => {
        setStatus('error')
        setMessage(err.response?.data?.error || 'No se pudo verificar el email')
      })
  }, [token])

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-700 to-primary-500 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-8 text-center space-y-4">
        <div className="text-5xl">
          {status === 'loading' ? '⏳' : status === 'ok' ? '✅' : '⚠️'}
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {status === 'loading' ? 'Confirmando...' : status === 'ok' ? 'Email verificado' : 'No se pudo verificar'}
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
        {status === 'ok' && user && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Redirigiendo a tu workspace…</p>
        )}
        {status === 'ok' && !user && (
          <Link to="/login" className="inline-block text-sm text-primary-600 dark:text-primary-400 hover:underline">
            Ir a iniciar sesión →
          </Link>
        )}
        {status === 'error' && (
          <Link to="/" className="inline-block text-sm text-primary-600 dark:text-primary-400 hover:underline">
            ← Volver
          </Link>
        )}
      </div>
    </div>
  )
}
