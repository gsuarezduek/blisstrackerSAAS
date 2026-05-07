import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

// ─── Iconos de integraciones ─────────────────────────────────────────────────

function IconGA() {
  return (
    <svg viewBox="0 0 20 18" className="w-3.5 h-3.5" aria-label="Google Analytics">
      <rect x="0" y="10" width="5" height="8" rx="1" fill="#E8710A"/>
      <rect x="7.5" y="5" width="5" height="13" rx="1" fill="#E8710A"/>
      <rect x="15" y="0" width="5" height="18" rx="1" fill="#E8710A"/>
    </svg>
  )
}

function IconGSC() {
  return (
    <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="none" aria-label="Search Console">
      <circle cx="8.5" cy="8.5" r="5.5" stroke="#1A73E8" strokeWidth="2"/>
      <line x1="12.5" y1="12.5" x2="18" y2="18" stroke="#1A73E8" strokeWidth="2" strokeLinecap="round"/>
      <line x1="6" y1="8.5" x2="11" y2="8.5" stroke="#1A73E8" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="8.5" y1="6" x2="8.5" y2="11" stroke="#1A73E8" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function IconInstagram() {
  return (
    <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" aria-label="Instagram">
      <defs>
        <linearGradient id="ig-grad" x1="0" y1="20" x2="20" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FCAF45"/>
          <stop offset="40%" stopColor="#E1306C"/>
          <stop offset="100%" stopColor="#833AB4"/>
        </linearGradient>
      </defs>
      <rect width="20" height="20" rx="5" fill="url(#ig-grad)"/>
      <circle cx="10" cy="10" r="3.5" stroke="white" strokeWidth="1.5" fill="none"/>
      <circle cx="14.5" cy="5.5" r="1" fill="white"/>
    </svg>
  )
}

function IconMetaAds() {
  return (
    <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" aria-label="Meta Ads">
      <rect width="20" height="20" rx="5" fill="#1877F2"/>
      <path d="M11.5 17v-6.5H13l.3-2H11.5V7.2c0-.6.2-1.2 1-1.2h1.3V4s-.9-.1-1.8-.1C10.1 3.9 9 5.2 9 7.2v1.3H7v2H9V17h2.5z" fill="white"/>
    </svg>
  )
}

function IconTikTok() {
  return (
    <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" aria-label="TikTok">
      <rect width="20" height="20" rx="5" fill="#010101"/>
      <path d="M14.5 4.8a3.5 3.5 0 01-2.3-.9v5.9a3.2 3.2 0 11-2.5-3.1v2a1.2 1.2 0 101.2 1.2V3h2c.2 1.1 1 2 1.6 1.8z" fill="white"/>
    </svg>
  )
}

function IconGoogleAds() {
  return (
    <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" aria-label="Google Ads">
      <circle cx="10" cy="10" r="9" fill="#4285F4"/>
      <path d="M13.5 10.2H10v1.8h2a2.5 2.5 0 01-2.5 2 3 3 0 110-6c.8 0 1.5.3 2 .8l1.3-1.3A5 5 0 105 10a5 5 0 007.5 4.3l1-1.4a3 3 0 00.5-1 3.1 3.1 0 00.05-1.4l-.55.7z" fill="white"/>
    </svg>
  )
}

const INTEGRATION_ICONS = {
  google_analytics:    { Icon: IconGA,         label: 'Google Analytics' },
  google_search_console: { Icon: IconGSC,      label: 'Search Console' },
  instagram:           { Icon: IconInstagram,  label: 'Instagram' },
  meta_ads:            { Icon: IconMetaAds,    label: 'Meta Ads' },
  tiktok:              { Icon: IconTikTok,     label: 'TikTok' },
  google_ads:          { Icon: IconGoogleAds,  label: 'Google Ads' },
}

const COUNT_CONFIG = [
  { key: 'IN_PROGRESS',    label: 'En curso',    bg: 'bg-primary-100 dark:bg-primary-900/30',  text: 'text-primary-700 dark:text-primary-400' },
  { key: 'BLOCKED',        label: 'Bloqueadas',  bg: 'bg-red-100 dark:bg-red-900/30',          text: 'text-red-700 dark:text-red-400' },
  { key: 'PAUSED',         label: 'Pausadas',    bg: 'bg-gray-100 dark:bg-gray-700',           text: 'text-gray-500 dark:text-gray-400' },
  { key: 'PENDING',        label: 'Pendientes',  bg: 'bg-gray-100 dark:bg-gray-700',           text: 'text-gray-600 dark:text-gray-400' },
  { key: 'COMPLETED_WEEK', label: 'Esta semana', bg: 'bg-green-100 dark:bg-green-900/30',      text: 'text-green-700 dark:text-green-400' },
]

const SORT_OPTIONS = [
  { key: 'name',    label: 'Nombre A–Z' },
  { key: 'newest',  label: 'Más nuevos' },
  { key: 'active',  label: 'Más activos' },
  { key: 'blocked', label: 'Bloqueadas primero' },
]

function sortProjects(projects, sort) {
  return [...projects].sort((a, b) => {
    const ca = a.taskCounts ?? {}
    const cb = b.taskCounts ?? {}
    switch (sort) {
      case 'newest': {
        const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        if (tB !== tA) return tB - tA
        return b.id - a.id  // fallback: mayor ID = creado después
      }
      case 'active': {
        const actA = (ca.COMPLETED_WEEK ?? 0) + (ca.IN_PROGRESS ?? 0)
        const actB = (cb.COMPLETED_WEEK ?? 0) + (cb.IN_PROGRESS ?? 0)
        if (actB !== actA) return actB - actA
        return a.name.localeCompare(b.name)
      }
      case 'blocked': {
        if ((cb.BLOCKED ?? 0) !== (ca.BLOCKED ?? 0)) return (cb.BLOCKED ?? 0) - (ca.BLOCKED ?? 0)
        return a.name.localeCompare(b.name)
      }
      default: // 'name'
        return a.name.localeCompare(b.name)
    }
  })
}

export default function MyProjects() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [sort,     setSort]     = useState('name')

  useEffect(() => {
    api.get('/projects')
      .then(r => setProjects(r.data))
      .finally(() => setLoading(false))
  }, [])

  const isAdmin = user?.role === 'ADMIN'

  const filtered = sortProjects(
    projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase())),
    sort
  )

  // Para "bloqueadas primero": resaltar el borde si tiene bloqueadas
  const hasBlocked = sort === 'blocked'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mis Proyectos</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {isAdmin
              ? `${projects.length} proyectos activos`
              : `Participás en ${projects.length} proyecto${projects.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {loading && <LoadingSpinner className="py-16" />}

        {!loading && projects.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📂</p>
            <p className="font-medium">No estás asignado a ningún proyecto todavía</p>
            <p className="text-sm mt-1">Pedile a un administrador que te agregue a un proyecto</p>
          </div>
        )}

        {!loading && projects.length > 0 && (
          <div className="space-y-3 mb-5">
            {/* Búsqueda */}
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar proyecto..."
                className="w-full pl-9 pr-9 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-xl py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                    <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                  </svg>
                </button>
              )}
            </div>

            {/* Ordenar por */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">Ordenar:</span>
              {SORT_OPTIONS.map(opt => {
                const isActive = sort === opt.key
                const isBlockedOpt = opt.key === 'blocked'
                return (
                  <button
                    key={opt.key}
                    onClick={() => setSort(opt.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      isActive
                        ? isBlockedOpt
                          ? 'bg-red-600 border-red-600 text-white'
                          : 'bg-primary-600 border-primary-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {!loading && search && filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">Sin resultados para "{search}"</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(p => {
            const counts      = p.taskCounts ?? {}
            const activePills = COUNT_CONFIG.filter(c => counts[c.key] > 0)
            const isBlocked   = (counts.BLOCKED ?? 0) > 0
            const integTypes  = (p.integrations ?? []).map(i => i.type)

            return (
              <div
                key={p.id}
                onClick={() => navigate(`/my-projects/${encodeURIComponent(p.name)}`)}
                className={`bg-white dark:bg-gray-800 rounded-2xl border p-5 flex flex-col gap-4 cursor-pointer hover:shadow-md transition-all ${
                  hasBlocked && isBlocked
                    ? 'border-red-300 dark:border-red-700 hover:border-red-400 dark:hover:border-red-600'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
                }`}
              >
                {/* Nombre + flecha */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isBlocked ? 'bg-red-500' : 'bg-green-500'}`} />
                    <h2 className="font-bold text-gray-900 dark:text-white text-lg leading-tight">{p.name}</h2>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0">
                    <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                  </svg>
                </div>

                {/* Pills de tareas */}
                {activePills.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {activePills.map(c => (
                      <span key={c.key} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${c.bg} ${c.text}`}>
                        {counts[c.key]} {c.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-gray-500 italic">Sin tareas pendientes esta semana</p>
                )}

                {/* Iconos de integraciones */}
                {integTypes.length > 0 && (
                  <div className="flex items-center gap-2 pt-1 border-t border-gray-100 dark:border-gray-700">
                    {integTypes.map(type => {
                      const cfg = INTEGRATION_ICONS[type]
                      if (!cfg) return null
                      const { Icon, label } = cfg
                      return (
                        <span key={type} title={label} className="flex items-center justify-center w-6 h-6 rounded-md bg-gray-50 dark:bg-gray-700 hover:scale-110 transition-transform">
                          <Icon />
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
