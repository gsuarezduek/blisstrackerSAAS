import { useState, useMemo } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import BlissLogo from '../components/BlissLogo'
import PasswordInput from '../components/PasswordInput'
import MfaCodeInput from '../components/MfaCodeInput'
import { isWorkspaceSubdomain } from '../utils/domain'

// ── Selector de workspace post-login ──────────────────────────────────────────

function workspaceUrl(slug, token) {
  const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
  // En producción: subdominio real. En localhost: misma pestaña con ?ws= para conservar
  // el slug (mismo criterio que Register.jsx — "local" = dev server, no dominio raíz).
  const isLocal = window.location.hostname === 'localhost'
  if (isLocal) return `/auth?token=${token}&ws=${slug}`
  return `https://${slug}.${appDomain}/auth?token=${token}`
}

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
              href={workspaceUrl(ws.slug, ws.token)}
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

// ── Paso 2 del login: verificación en dos pasos ───────────────────────────────

// La contraseña ya validó pero el backend no entregó ninguna sesión: con el
// `mfaToken` en mano, este paso canjea el código por los tokens de workspace.
function MfaStep({ challenge, onVerified, onCancel }) {
  const [code,    setCode]    = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [useRecovery, setUseRecovery] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/mfa/verify`, {
        mfaToken: challenge.mfaToken,
        code,
      })
      onVerified(data.workspaces)
    } catch (err) {
      const res = err.response?.data
      // Desafío quemado o vencido: no tiene sentido dejarlo reintentar acá, el
      // mfaToken ya no sirve. Se vuelve al formulario de contraseña.
      if (res?.code === 'MFA_TOO_MANY_ATTEMPTS' || res?.code?.startsWith('MFA_CHALLENGE')) {
        onCancel(res.error)
        return
      }
      setError(res?.error || 'No se pudo verificar el código')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <BlissLogo variant="lockup" className="h-8 w-auto" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Verificación en dos pasos</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {useRecovery
              ? 'Ingresá uno de tus códigos de recuperación. Cada código sirve una sola vez.'
              : 'Ingresá el código de 6 dígitos que muestra tu app de autenticación.'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <MfaCodeInput
            autoFocus
            required
            value={code}
            onChange={setCode}
            placeholder={useRecovery ? 'A2BC-D3EF4G' : '123456'}
          />
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>
          )}
          <button type="submit" disabled={loading || !code.trim()}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold rounded-xl px-4 py-2.5 transition-colors">
            {loading ? 'Verificando…' : 'Verificar'}
          </button>
        </form>
        <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
          <button type="button" onClick={() => { setUseRecovery(v => !v); setCode(''); setError('') }}
            className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
            {useRecovery ? 'Usar el código de la app' : '¿Perdiste el dispositivo?'}
          </button>
          <button type="button" onClick={() => onCancel('')}
            className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
            Volver
          </button>
        </div>
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
  // Desafío de 2FA pendiente: { mfaToken, methods, recoveryCodesLeft }
  const [challenge,  setChallenge]  = useState(null)

  // Nonce para el botón de Google — generado una sola vez por sesión de login
  const nonce = useMemo(() => {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  }, [])

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
      // Con 2FA la respuesta no trae sesión: falta el segundo paso.
      if (data.mfaRequired) {
        setChallenge(data)
        return
      }
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
      const { data } = await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/google`, { credential, nonce })
      redirect(data.workspaces)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo iniciar sesión con Google')
    } finally {
      setLoading(false)
    }
  }

  if (challenge) {
    return (
      <MfaStep
        challenge={challenge}
        onVerified={redirect}
        onCancel={msg => { setChallenge(null); setPassword(''); setError(msg) }}
      />
    )
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
          <PasswordInput
            required value={password}
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
              nonce={nonce}
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

  if (!isWorkspaceSubdomain()) return <RootLogin />

  // En subdominio de workspace → redirigir al login central
  const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
  const theme = localStorage.getItem('theme') || 'light'
  window.location.replace(`https://${appDomain}/login?from=${slug}&theme=${theme}`)
  return null
}
