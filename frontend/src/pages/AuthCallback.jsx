/**
 * /auth?token=JWT
 * Recibe el token generado en blisstracker.app/login,
 * lo guarda en localStorage y redirige al dashboard.
 */
import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import BlissLogo from '../components/BlissLogo'

export default function AuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { loginWithToken } = useAuth()

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) { navigate('/login', { replace: true }); return }

    // En desarrollo, el workspace elegido viene como ?ws=slug
    const ws = searchParams.get('ws')
    if (ws) localStorage.setItem('workspaceSlug', ws)

    // Limpiar la URL antes de continuar
    window.history.replaceState({}, '', '/auth')

    localStorage.setItem('token', token)

    // Obtener datos frescos del usuario y registrar el ingreso.
    // IMPORTANTE: esperar a que loginWithToken termine (setUser) antes de navegar —
    // si no, PrivateRoute puede renderizar con user=null (loading ya resuelto en falso
    // desde el mount inicial, sin token) y rebotar a /login antes de que la sesión esté lista.
    api.get('/auth/me')
      .then(async r => {
        await loginWithToken(token, r.data)
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
