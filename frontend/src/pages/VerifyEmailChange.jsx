import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import api from '../api/client'

export default function VerifyEmailChange() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  // status: 'loading' | 'ok' | 'error'
  const [status, setStatus] = useState(token ? 'loading' : 'error')
  const [message, setMessage] = useState(token ? '' : 'Enlace inválido')
  const [newEmail, setNewEmail] = useState('')

  useEffect(() => {
    if (!token) return
    api.post('/auth/verify-email-change', { token })
      .then(({ data }) => {
        setStatus('ok')
        setNewEmail(data.email || '')
        setMessage(data.message || 'Email actualizado correctamente')
      })
      .catch(err => {
        setStatus('error')
        setMessage(err.response?.data?.error || 'No se pudo confirmar el cambio de email')
      })
  }, [token])

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-700 to-primary-500 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-8 text-center space-y-4">
        <div className="text-5xl">
          {status === 'loading' ? '⏳' : status === 'ok' ? '✅' : '⚠️'}
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {status === 'loading' ? 'Confirmando...' : status === 'ok' ? 'Email actualizado' : 'No se pudo confirmar'}
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
        {status === 'ok' && newEmail && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Ahora iniciás sesión con <strong>{newEmail}</strong>.
          </p>
        )}
        {status !== 'loading' && (
          <Link to="/login" className="inline-block text-sm text-primary-600 dark:text-primary-400 hover:underline">
            ← Ir al login
          </Link>
        )}
      </div>
    </div>
  )
}
