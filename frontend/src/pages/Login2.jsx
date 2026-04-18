import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'

// ── Slides ─────────────────────────────────────────────────────────────────────

const SLIDES = [
  {
    tag: 'Filosofía',
    title: 'No más cosas. Mejores cosas.',
    body: 'El sistema no es para tener una lista más larga. Es para trabajar con claridad — saber qué hacés, por qué lo hacés, y cerrarlo bien.',
    highlight: '"Si no está en el sistema, no existe."',
  },
  {
    tag: 'Foco',
    title: 'Una tarea a la vez, siempre.',
    body: 'Solo podés tener una tarea en curso. Nada de multitasking. Cuando la terminás, pasás a la siguiente. Así funciona el foco real.',
    highlight: 'Mejor calidad, menos errores, menos estrés.',
  },
  {
    tag: 'Prioridades',
    title: 'Elegí 3 cosas importantes por día.',
    body: 'No 10. No 20. Tres a cinco tareas que realmente importen. Una lista infinita no es productividad — es ansiedad disfrazada de trabajo.',
    highlight: 'Hacé menos, mejor.',
  },
  {
    tag: 'Tareas claras',
    title: 'Una buena tarea tiene resultado visible.',
    body: '"Trabajar en cliente" no es una tarea. "Diseñar 3 placas para Instagram de Cliente X" sí lo es. Si no podés saber cuándo termina, reescribila.',
    highlight: 'Accionable + específica + con un dueño.',
  },
  {
    tag: 'Bloqueos',
    title: 'Bloqueada no es "no tengo ganas".',
    body: 'Usá el estado Bloqueada solo cuando hay un impedimento real: esperás material, aprobación, o acceso. Siempre con motivo. Siempre avisa al equipo.',
    highlight: 'Un bloqueo sin motivo no ayuda a nadie.',
  },
  {
    tag: 'Cierre del día',
    title: 'Cerrá el día con el sistema al día.',
    body: 'Antes de finalizar tu jornada: completá lo que terminaste, pausá lo pendiente, bloqueá lo que no podés avanzar. Las tareas pendientes aparecen solas mañana.',
    highlight: 'Finalizá la jornada con todo registrado.',
  },
  {
    tag: 'IA + Equipo',
    title: 'Tu semana, analizada por IA.',
    body: 'Cada viernes recibís un resumen de tu semana generado por inteligencia artificial: qué hiciste, cómo lo hiciste, y qué mejorar. Podés activarlo o desactivarlo desde Preferencias.',
    highlight: 'Aprendé de tu propio ritmo de trabajo.',
  },
  {
    tag: 'Equipo',
    title: 'El equipo se ve en tiempo real.',
    body: 'En Actividad podés ver qué está haciendo cada persona del equipo en este momento. Cuando alguien completa o bloquea una tarea de tu proyecto, recibís una notificación.',
    highlight: 'Coordinación sin reuniones innecesarias.',
  },
]

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Panel izquierdo ────────────────────────────────────────────────────────────

function SlidePanel() {
  const [order]   = useState(() => shuffle(SLIDES.map((_, i) => i)))
  const [current, setCurrent] = useState(0)
  const [visible, setVisible] = useState(true)
  const timer = useRef(null)

  function goTo(idx) {
    if (idx === current) return
    setVisible(false)
    setTimeout(() => {
      setCurrent(idx)
      setVisible(true)
    }, 250)
  }

  useEffect(() => {
    timer.current = setTimeout(() => {
      goTo((current + 1) % order.length)
    }, 7000)
    return () => clearTimeout(timer.current)
  }, [current, order.length])

  const slide = SLIDES[order[current]]

  return (
    <div className="flex flex-col justify-center h-full px-12 py-12 gap-10">

      {/* Logo */}
      <div className="flex items-center gap-4">
        <img src="/blisstracker_logo.svg" alt="BlissTracker" className="w-14 h-14" />
        <span className="text-2xl font-bold text-white tracking-tight">BlissTracker</span>
      </div>

      {/* Slide */}
      <div
        className="flex flex-col gap-5"
        style={{ transition: 'opacity 0.25s ease', opacity: visible ? 1 : 0 }}
      >
        {/* Tag */}
        <span className="text-xs font-semibold tracking-widest uppercase text-primary-400">
          {slide.tag}
        </span>

        {/* Title */}
        <h2 className="text-3xl font-bold text-white leading-tight">
          {slide.title}
        </h2>

        {/* Body */}
        <p className="text-gray-400 text-base leading-relaxed">
          {slide.body}
        </p>

        {/* Highlight */}
        <div className="border-l-2 border-primary-500 pl-4">
          <p className="text-gray-300 text-sm italic">{slide.highlight}</p>
        </div>
      </div>

      {/* Dots */}
      <div className="flex items-center gap-2">
        {order.map((_, idx) => (
          <button
            key={idx}
            onClick={() => goTo(idx)}
            className={`rounded-full transition-all duration-300 ${
              idx === current
                ? 'w-6 h-2 bg-primary-500'
                : 'w-2 h-2 bg-gray-600 hover:bg-gray-400'
            }`}
          />
        ))}
      </div>

    </div>
  )
}

// ── Login desde dominio raíz (sin workspace) ──────────────────────────────────

function WorkspacePicker({ workspaces }) {
  const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-3">
          <img src="/blisstracker_logo.svg" alt="BlissTracker" className="w-10 h-10" />
          <span className="text-xl font-bold text-gray-900 dark:text-white">BlissTracker</span>
        </div>
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

function RootLogin() {
  const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [workspaces, setWorkspaces] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/login`, { email, password })
      if (data.workspaces?.length === 1) {
        window.location.href = `https://${data.workspaces[0].slug}.${appDomain}/auth?token=${data.workspaces[0].token}`
      } else {
        setWorkspaces(data.workspaces)
      }
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
      if (data.workspaces?.length === 1) {
        window.location.href = `https://${data.workspaces[0].slug}.${appDomain}/auth?token=${data.workspaces[0].token}`
      } else {
        setWorkspaces(data.workspaces)
      }
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
        <div className="flex items-center gap-3">
          <img src="/blisstracker_logo.svg" alt="BlissTracker" className="w-10 h-10" />
          <span className="text-xl font-bold text-gray-900 dark:text-white">BlissTracker</span>
        </div>
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
        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          ¿No tenés cuenta?{' '}
          <a href={`https://${appDomain}/register`} className="text-primary-600 hover:text-primary-700 font-medium">
            Crear workspace
          </a>
        </p>
      </div>
    </div>
  )
}

// ── Google OAuth via popup ─────────────────────────────────────────────────────

function GoogleOAuthButton({ slug, onSuccess, onError, disabled }) {
  function handleClick() {
    const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
    const base = window.location.hostname.includes(appDomain)
      ? `https://${appDomain}`
      : window.location.origin
    const url = `${base}/oauth?workspace=${encodeURIComponent(slug)}`
    const popup = window.open(url, 'google-oauth', 'width=500,height=600,left=200,top=100')
    if (!popup) { onError('El navegador bloqueó la ventana emergente. Permitila e intentá de nuevo.'); return }

    function onMessage(e) {
      if (e.data?.type === 'GOOGLE_CREDENTIAL') {
        window.removeEventListener('message', onMessage)
        onSuccess(e.data.credential)
      } else if (e.data?.type === 'GOOGLE_AUTH_ERROR') {
        window.removeEventListener('message', onMessage)
        onError(e.data.error)
      }
    }
    window.addEventListener('message', onMessage)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="flex items-center gap-3 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-60 transition-colors text-sm font-medium text-gray-700 dark:text-gray-200 w-full justify-center"
    >
      <svg width="18" height="18" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
      Continuar con Google
    </button>
  )
}

// ── Página ─────────────────────────────────────────────────────────────────────

export default function Login2() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const { login, loginWithToken, user } = useAuth()
  const { workspace, notFound, suspended, slug } = useWorkspace()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const resetOk = searchParams.get('reset') === 'ok'

  if (user) {
    navigate('/', { replace: true })
    return null
  }

  if (!slug) {
    return <RootLogin />
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-6">
        <div className="text-center max-w-sm">
          <p className="text-5xl mb-4">🔍</p>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Workspace no encontrado</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No existe ningún workspace con el nombre <strong>{slug}</strong>. Verificá la URL o pedile a tu equipo que te invite.
          </p>
        </div>
      </div>
    )
  }

  if (suspended) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-6">
        <div className="text-center max-w-sm">
          <p className="text-5xl mb-4">🔒</p>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Acceso suspendido</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            El workspace <strong>{slug}</strong> está suspendido. Contactá al administrador para regularizar el pago.
          </p>
        </div>
      </div>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Izquierda ── */}
      <div className="hidden lg:flex lg:w-1/2 bg-gray-900">
        <SlidePanel />
      </div>

      {/* ── Derecha ── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white dark:bg-gray-900 px-8 py-12">
        <div className="w-full max-w-sm">

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {workspace ? `Bienvenido a ${workspace.name}` : 'Bienvenido'}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Entrá y empezá tu día con foco</p>
          </div>

          {resetOk && (
            <div className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm rounded-xl px-4 py-3 mb-6">
              Contraseña actualizada. Ya podés iniciar sesión.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                placeholder="tu@blissmkt.ar"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Contraseña</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold rounded-xl px-4 py-2.5 transition-colors mt-1"
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>

            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
              <span className="text-xs text-gray-400 dark:text-gray-500">o</span>
              <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
            </div>

            <div className="flex justify-center">
              <GoogleOAuthButton
                slug={slug}
                onSuccess={async (credential) => {
                  setError('')
                  setLoading(true)
                  try {
                    // Llamada directa con el slug conocido — no depende del interceptor
                    const { data } = await axios.post(
                      `${import.meta.env.VITE_API_URL}/api/auth/google`,
                      { credential },
                      { headers: { 'X-Workspace': slug } }
                    )
                    loginWithToken(data.token, data.user)
                    navigate('/', { replace: true })
                  } catch (err) {
                    setError(err.response?.data?.error || 'No se pudo iniciar sesión con Google')
                  } finally {
                    setLoading(false)
                  }
                }}
                onError={setError}
                disabled={loading}
              />
            </div>

            <div className="text-center pt-1">
              <Link
                to="/forgot-password"
                className="text-sm text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          </form>

        </div>
      </div>

    </div>
  )
}
