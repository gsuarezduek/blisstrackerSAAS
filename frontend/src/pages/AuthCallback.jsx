/**
 * /auth?code=...
 * Canjea el código de un solo uso (emitido en el dominio de origen) por el JWT,
 * lo guarda en localStorage y redirige al dashboard. El código se saca de la
 * URL antes de cualquier request, así no queda en el historial ni se lo lleva
 * un script de la página.
 */
import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import BlissLogo from '../components/BlissLogo'

// El código es de un solo uso. En desarrollo React monta el efecto dos veces
// (StrictMode) y el segundo canje llegaría vencido y sacaría la sesión que
// acaba de crear el primero. La promesa se comparte por código.
const exchanges = new Map()

function exchangeCode(code) {
  if (!exchanges.has(code)) {
    exchanges.set(code, axios.post(`${import.meta.env.VITE_API_URL}/api/auth/handoff/exchange`, { code }))
  }
  return exchanges.get(code)
}

export default function AuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { loginWithToken } = useAuth()

  useEffect(() => {
    const code = searchParams.get('code')
    const ws = searchParams.get('ws')
    if (ws) localStorage.setItem('workspaceSlug', ws)
    window.history.replaceState({}, '', '/auth')

    if (!code) { navigate('/login', { replace: true }); return }

    exchangeCode(code)
      .then(async ({ data }) => {
        localStorage.setItem('token', data.token)
        // Esperar a que loginWithToken termine (setUser) antes de navegar: si no,
        // PrivateRoute puede renderizar con user=null y rebotar a /login.
        const me = await api.get('/auth/me')
        await loginWithToken(data.token, me.data)
        api.post('/auth/record-login').catch(() => {})
        navigate('/', { replace: true })
      })
      .catch(() => {
        localStorage.removeItem('token')
        navigate('/login', { replace: true })
      })
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center space-y-3">
        <BlissLogo variant="loading" className="w-16 h-16 mx-auto" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Iniciando sesión…</p>
      </div>
    </div>
  )
}
