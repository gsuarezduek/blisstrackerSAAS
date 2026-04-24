import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import BlissLogo from '../components/BlissLogo'

// ── Helpers ───────────────────────────────────────────────────────────────────

const RESERVED_SLUGS = ['www', 'app', 'api', 'mail', 'static', 'cdn']

function isRealWorkspaceSubdomain() {
  const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
  const hostname  = window.location.hostname
  const match = hostname.match(new RegExp(`^([a-z0-9-]+)\\.${appDomain.replace(/\./g, '\\.')}$`))
  return !!(match && !RESERVED_SLUGS.includes(match[1]))
}

// ── Selector de workspace post-login ──────────────────────────────────────────

function WorkspacePicker({ workspaces }) {
  const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-6">
      <div className="w-full max-w-sm space-y-6">
        <BlissLogo variant="lockup" className="h-8 w-auto" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Tus workspaces</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Elegí a cuál querés ingresar.</p>
        </div>
        <div className="space-y-2">
          {workspaces.map(ws => (
            <a
              key={ws.slug}
              href={`https://${ws.slug}.${appDomain}/auth?token=${ws.token}`}
              className="flex items-center justify-between w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors group"
            >
              <div>
                <p className="font-medium text-gray-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-400">
                  {ws.name}
                </p>
                <p className="text-xs text-gray-400">{ws.slug}.{appDomain}</p>
              </div>
              <svg className="w-4 h-4 text-gray-400 group-hover:text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          ))}
        </div>
        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          ¿No ves tu workspace?{' '}
          <a href={`https://${appDomain}/register`} className="text-primary-600 hover:text-primary-700 font-medium">
            Crear uno nuevo
          </a>
        </p>
      </div>
    </div>
  )
}

// ── Login central (raíz o localhost) ──────────────────────────────────────────

function RootLogin() {
  const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
  const fromSlug  = new URLSearchParams(window.location.search).get('from')

  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [workspaces, setWorkspaces] = useState(null)

  function redirect(workspaces) {
    const target = fromSlug
      ? workspaces.find(w => w.slug === fromSlug) ?? workspaces[0]
      : workspaces.length === 1 ? workspaces[0] : null

    if (target) {
      window.location.href = `https://${target.slug}.${appDomain}/auth?token=${target.token}`
    } else {
      setWorkspaces(workspaces)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/login`, { email, password })
      redirect(data.workspaces)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSuccess({ credential }) {
    setError('')
    setLoading(true)
    try {
      const { data } = await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/google`, { credential })
      redirect(data.workspaces)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo iniciar sesión con Google')
    } finally {
      setLoading(false)
    }
  }

  if (workspaces) return <WorkspacePicker workspaces={workspaces} />

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <BlissLogo variant="lockup" className="h-8 w-auto" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Bienvenido</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Iniciá sesión para continuar.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email" required autoFocus value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="tu@empresa.com"
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
          />
          <input
            type="password" required value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Contraseña"
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
          />
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>
          )}
          <button type="submit" disabled={loading}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold rounded-xl px-4 py-2.5 transition-colors">
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
            <span className="text-xs text-gray-400">o</span>
            <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
          </div>
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError('No se pudo iniciar sesión con Google')}
              useOneTap={false} text="continue_with" locale="es"
            />
          </div>
        </form>
        <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
          <Link to="/forgot-password" className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
            ¿Olvidaste tu contraseña?
          </Link>
          <a href={`https://${appDomain}/register`} className="text-primary-600 hover:text-primary-700 font-medium">
            Crear workspace
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Exportación principal ─────────────────────────────────────────────────────

export default function Login2() {
  const { user } = useAuth()
  const { slug } = useWorkspace()
  const navigate = useNavigate()

  if (user) {
    navigate('/', { replace: true })
    return null
  }

  if (!isRealWorkspaceSubdomain()) return <RootLogin />

  // En subdominio de workspace → redirigir al login central
  const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
  window.location.replace(`https://${appDomain}/login?from=${slug}`)
  return null
}
