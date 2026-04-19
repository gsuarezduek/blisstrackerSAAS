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

export default function Register() {
  const [workspaceName, setWorkspaceName] = useState('')
  const [slug,          setSlug]          = useState('')
  const [ownerName,     setOwnerName]     = useState('')
  const [ownerEmail,    setOwnerEmail]    = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [error,         setError]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [emailExists,   setEmailExists]   = useState(false)
  const navigate = useNavigate()

  // Detectar si el email ya tiene cuenta (con debounce)
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
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 30)
    setSlug(auto)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/workspaces', { workspaceName, slug, ownerName, ownerEmail, ownerPassword })
      const domain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
      // Redirigir al subdominio recién creado
      if (window.location.hostname.includes(domain)) {
        window.location.href = `https://${slug}.${domain}/login`
      } else {
        // En desarrollo, solo ir al login
        navigate('/login')
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear el workspace')
    } finally {
      setLoading(false)
    }
  }

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
              Subdominio (slug)
            </label>
            <input
              type="text"
              required
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30))}
              placeholder="mi-empresa"
              title="Solo letras minúsculas, números y guiones (2-30 caracteres)"
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
            />
            <SlugPreview slug={slug} />
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
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {emailExists ? 'Tu contraseña actual' : 'Contraseña'}
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
            {emailExists && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1.5">
                Este email ya tiene una cuenta. Ingresá tu contraseña para crear el nuevo workspace.
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold rounded-xl px-4 py-2.5 transition-colors"
          >
            {loading ? 'Creando workspace...' : 'Crear workspace'}
          </button>

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
