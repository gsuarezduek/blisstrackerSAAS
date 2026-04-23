import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api/client'

function SlugPreview({ slug }) {
  const domain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
  if (!slug) return null
  return (
    <p className="text-xs text-gray-400 mt-1">
      Tu URL: <span className="font-medium text-primary-600">{slug}.{domain}</span>
    </p>
  )
}

// Estados de disponibilidad del slug
const SLUG_STATUS = {
  idle:      null,
  checking:  'checking',
  available: 'available',
  taken:     'taken',
  invalid:   'invalid',
}

export default function Register() {
  const [workspaceName,  setWorkspaceName]  = useState('')
  const [slug,           setSlug]           = useState('')
  const [ownerName,      setOwnerName]      = useState('')
  const [ownerEmail,     setOwnerEmail]     = useState('')
  const [ownerPassword,  setOwnerPassword]  = useState('')
  const [error,          setError]          = useState('')
  const [loading,        setLoading]        = useState(false)
  const [emailExists,    setEmailExists]    = useState(false)
  const [acceptedTerms,  setAcceptedTerms]  = useState(true)
  const [slugStatus,     setSlugStatus]     = useState(SLUG_STATUS.idle)
  const navigate = useNavigate()

  // Verificar disponibilidad de slug (con debounce)
  useEffect(() => {
    if (!slug || slug.length < 2) {
      setSlugStatus(SLUG_STATUS.idle)
      return
    }
    if (!/^[a-z0-9-]{2,30}$/.test(slug)) {
      setSlugStatus(SLUG_STATUS.invalid)
      return
    }
    setSlugStatus(SLUG_STATUS.checking)
    const t = setTimeout(() => {
      api.get(`/workspaces/check-slug?slug=${encodeURIComponent(slug)}`)
        .then(r => setSlugStatus(r.data.available ? SLUG_STATUS.available : SLUG_STATUS.taken))
        .catch(() => setSlugStatus(SLUG_STATUS.idle))
    }, 400)
    return () => clearTimeout(t)
  }, [slug])

  // Verificar si el email ya tiene cuenta (con debounce)
  useEffect(() => {
    if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
      setEmailExists(false)
      return
    }
    const t = setTimeout(() => {
      api.get(`/auth/check-email?email=${encodeURIComponent(ownerEmail)}`)
        .then(r => setEmailExists(r.data.exists))
        .catch(() => setEmailExists(false))
    }, 400)
    return () => clearTimeout(t)
  }, [ownerEmail])

  // Auto-generar slug desde el nombre del workspace
  function handleWorkspaceNameChange(val) {
    setWorkspaceName(val)
    const auto = val
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 30)
    setSlug(auto)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (slugStatus === SLUG_STATUS.taken) {
      setError('El subdominio ya está en uso. Elegí otro.')
      return
    }
    if (emailExists) return // el botón queda deshabilitado, pero por si acaso
    setError('')
    setLoading(true)
    try {
      await api.post('/workspaces', { workspaceName, slug, ownerName, ownerEmail, ownerPassword })

      // Conversión GA4: registro de workspace
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'sign_up', { method: 'email', workspace_slug: slug })
      }

      const domain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
      if (window.location.hostname.includes(domain)) {
        window.location.href = `https://${slug}.${domain}/login`
      } else {
        navigate('/login')
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear el workspace')
    } finally {
      setLoading(false)
    }
  }

  // Indicador visual del slug
  function SlugIndicator() {
    if (slugStatus === SLUG_STATUS.idle || !slug)    return null
    if (slugStatus === SLUG_STATUS.checking) return (
      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
        <span className="inline-block w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
        Verificando disponibilidad…
      </p>
    )
    if (slugStatus === SLUG_STATUS.available) return (
      <p className="text-xs text-green-600 dark:text-green-400 mt-1">✓ Subdominio disponible</p>
    )
    if (slugStatus === SLUG_STATUS.taken) return (
      <p className="text-xs text-red-500 mt-1">✗ Este subdominio ya está en uso</p>
    )
    if (slugStatus === SLUG_STATUS.invalid) return (
      <p className="text-xs text-amber-500 mt-1">Solo letras minúsculas, números y guiones</p>
    )
    return null
  }

  const canSubmit = !loading && acceptedTerms && !emailExists
    && slugStatus !== SLUG_STATUS.taken
    && slugStatus !== SLUG_STATUS.checking
    && slugStatus !== SLUG_STATUS.invalid

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-6 py-12">
      <div className="w-full max-w-md">

        <div className="flex items-center gap-3 mb-8">
          <img src="/blisstracker_logo.svg" alt="BlissTracker" className="w-10 h-10" />
          <span className="text-xl font-bold text-gray-900 dark:text-white">BlissTracker</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Crear workspace</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">
          14 días de prueba gratis. Sin tarjeta de crédito.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Nombre del workspace
            </label>
            <input
              type="text"
              required
              autoFocus
              value={workspaceName}
              onChange={e => handleWorkspaceNameChange(e.target.value)}
              placeholder="Mi Empresa"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Subdominio
            </label>
            <input
              type="text"
              required
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30))}
              placeholder="mi-empresa"
              className={`w-full border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:border-transparent transition-shadow dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 ${
                slugStatus === SLUG_STATUS.taken   ? 'border-red-400 focus:ring-red-400' :
                slugStatus === SLUG_STATUS.available ? 'border-green-400 focus:ring-green-400' :
                'border-gray-300 dark:border-gray-600 focus:ring-primary-500'
              }`}
            />
            <SlugIndicator />
            {slugStatus !== SLUG_STATUS.taken && <SlugPreview slug={slug} />}
          </div>

          <hr className="border-gray-200 dark:border-gray-700" />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Tu nombre
            </label>
            <input
              type="text"
              required
              value={ownerName}
              onChange={e => setOwnerName(e.target.value)}
              placeholder="Ana García"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Email
            </label>
            <input
              type="email"
              required
              value={ownerEmail}
              onChange={e => setOwnerEmail(e.target.value)}
              placeholder="ana@mi-empresa.com"
              className={`w-full border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:border-transparent transition-shadow dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 ${
                emailExists
                  ? 'border-amber-400 focus:ring-amber-400'
                  : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'
              }`}
            />
            {/* Si el email ya tiene cuenta → redirigir a login */}
            {emailExists && (
              <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
                <p className="text-xs text-amber-700 dark:text-amber-300 font-medium mb-1">
                  Este email ya tiene una cuenta en BlissTracker.
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Iniciá sesión en tu workspace y creá uno nuevo desde el selector de workspaces.
                </p>
                <Link
                  to="/login"
                  className="inline-block mt-2 text-xs font-semibold text-primary-600 hover:text-primary-700 underline underline-offset-2"
                >
                  Ir a iniciar sesión →
                </Link>
              </div>
            )}
          </div>

          {/* Contraseña solo si el email NO existe */}
          {!emailExists && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={ownerPassword}
                onChange={e => setOwnerPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
              />
            </div>
          )}

          {/* Aceptar términos */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={e => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer flex-shrink-0"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Acepto las{' '}
              <a href="/condiciones" target="_blank" rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700 underline underline-offset-2">
                condiciones de uso
              </a>
              {' '}y la{' '}
              <a href="/privacidad" target="_blank" rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700 underline underline-offset-2">
                política de privacidad
              </a>
            </span>
          </label>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {!emailExists && (
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold rounded-xl px-4 py-2.5 transition-colors"
            >
              {loading ? 'Creando workspace…' : 'Crear workspace'}
            </button>
          )}

        </form>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
          ¿Ya tenés cuenta?{' '}
          <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium transition-colors">
            Iniciá sesión
          </Link>
        </p>

      </div>
    </div>
  )
}
