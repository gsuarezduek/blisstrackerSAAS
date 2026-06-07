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

// Cada entrada tiene [clave, label en estado normal, label al togglear]
const SORT_OPTIONS = [
  { key: 'name',    toggle: 'name_desc', label: 'Nombre A–Z',        labelAlt: 'Nombre Z–A'    },
  { key: 'newest',  toggle: 'oldest',    label: 'Más nuevos',         labelAlt: 'Más antiguos'  },
  { key: 'active',  toggle: 'inactive',  label: 'Más activos',        labelAlt: 'Más inactivos' },
  { key: 'blocked', toggle: null,        label: 'Bloqueadas primero',  labelAlt: null            },
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
        return b.id - a.id
      }
      case 'oldest': {
        const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        if (tB !== tA) return tA - tB
        return a.id - b.id
      }
      case 'active': {
        const actA = (ca.COMPLETED_WEEK ?? 0) + (ca.IN_PROGRESS ?? 0)
        const actB = (cb.COMPLETED_WEEK ?? 0) + (cb.IN_PROGRESS ?? 0)
        if (actB !== actA) return actB - actA
        return a.name.localeCompare(b.name)
      }
      case 'inactive': {
        const actA = (ca.COMPLETED_WEEK ?? 0) + (ca.IN_PROGRESS ?? 0)
        const actB = (cb.COMPLETED_WEEK ?? 0) + (cb.IN_PROGRESS ?? 0)
        if (actA !== actB) return actA - actB
        return a.name.localeCompare(b.name)
      }
      case 'blocked': {
        if ((cb.BLOCKED ?? 0) !== (ca.BLOCKED ?? 0)) return (cb.BLOCKED ?? 0) - (ca.BLOCKED ?? 0)
        return a.name.localeCompare(b.name)
      }
      case 'name_desc':
        return b.name.localeCompare(a.name)
      default: // 'name'
        return a.name.localeCompare(b.name)
    }
  })
}

export default function MyProjects() {
  const { user } = useAuth()
  const navigate       = useNavigate()
  const [projects,     setProjects]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [sort,         setSort]         = useState('name')
  const [filterService, setFilterService] = useState('')
  const [filterPerson,  setFilterPerson]  = useState('')

  useEffect(() => {
    api.get('/projects')
      .then(r => setProjects(r.data))
      .finally(() => setLoading(false))
  }, [])

  // Destacar / quitar destacado (preferencia personal). Optimista + revierte si falla.
  function toggleStar(e, project) {
    e.stopPropagation()
    const next = !project.starred
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, starred: next } : p))
    api.patch(`/projects/${project.id}/star`).catch(() => {
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, starred: !next } : p))
    })
  }

  // Derivar listas únicas de servicios y personas del workspace
  const allServices = [...new Map(
    projects.flatMap(p => (p.services ?? []).map(ps => [ps.service.id, ps.service]))
  ).values()].sort((a, b) => a.name.localeCompare(b.name))

  const allMembers = [...new Map(
    projects.flatMap(p => (p.members ?? []).map(pm => [pm.user.id, pm.user]))
  ).values()].sort((a, b) => a.name.localeCompare(b.name))

  const filtered = sortProjects(
    projects.filter(p => {
      if (!p.name.toLowerCase().includes(search.toLowerCase())) return false
      if (filterService && !(p.services ?? []).some(ps => String(ps.service.id) === filterService)) return false
      if (filterPerson  && !(p.members  ?? []).some(pm => String(pm.user.id)    === filterPerson))  return false
      return true
    }),
    sort
  )

  // Tres grupos: Destacados (estrella, preferencia personal), Mis proyectos (donde
  // soy del equipo) y Otros del workspace. ProjectMember es solo la etiqueta de
  // equipo; ver y aportar tareas está abierto a todos. Un destacado se saca de su
  // grupo original y sube a Destacados.
  const myId = user?.id
  const isMine = p => (p.members ?? []).some(pm => pm.user.id === myId)
  const starredProjects = filtered.filter(p => p.starred)
  const mineProjects    = filtered.filter(p => !p.starred && isMine(p))
  const otherProjects   = filtered.filter(p => !p.starred && !isMine(p))

  // Para "bloqueadas primero": resaltar el borde si tiene bloqueadas
  const hasBlocked = sort === 'blocked'

  const renderCard = p => {
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
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={e => toggleStar(e, p)}
              title={p.starred ? 'Quitar de destacados' : 'Destacar proyecto'}
              className="flex-shrink-0 -m-1 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {p.starred ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-yellow-400">
                  <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L10 18.354 5.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.005z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" className="w-5 h-5 text-gray-300 dark:text-gray-500 hover:text-yellow-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                </svg>
              )}
            </button>
            {isBlocked && (
              <span title="Tiene tareas bloqueadas" className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
            )}
            <h2 className="font-bold text-gray-900 dark:text-white text-lg leading-tight truncate">{p.name}</h2>
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
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mis Proyectos</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {projects.length} proyecto{projects.length !== 1 ? 's' : ''} en el workspace
          </p>
        </div>

        {loading && <LoadingSpinner className="py-16" />}

        {!loading && projects.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📂</p>
            <p className="font-medium">No hay proyectos en este workspace todavía</p>
            <p className="text-sm mt-1">Pedile a un administrador que cree el primero</p>
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

            {/* Filtros por Servicio y Persona */}
            {(allServices.length > 0 || allMembers.length > 0) && (
              <div className="flex items-center gap-2 flex-wrap">
                {allServices.length > 0 && (
                  <div className="relative">
                    <select
                      value={filterService}
                      onChange={e => setFilterService(e.target.value)}
                      className={`pl-3 pr-7 py-1.5 text-xs font-medium rounded-lg border appearance-none cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                        filterService
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                    >
                      <option value="">Servicio</option>
                      {allServices.map(s => (
                        <option key={s.id} value={String(s.id)}>{s.name}</option>
                      ))}
                    </select>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                      className={`w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${filterService ? 'text-white' : 'text-gray-400'}`}>
                      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                {allMembers.length > 0 && (
                  <div className="relative">
                    <select
                      value={filterPerson}
                      onChange={e => setFilterPerson(e.target.value)}
                      className={`pl-3 pr-7 py-1.5 text-xs font-medium rounded-lg border appearance-none cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                        filterPerson
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                    >
                      <option value="">Persona</option>
                      {allMembers.map(m => (
                        <option key={m.id} value={String(m.id)}>{m.name}</option>
                      ))}
                    </select>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                      className={`w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${filterPerson ? 'text-white' : 'text-gray-400'}`}>
                      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
            )}

            {/* Ordenar por */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">Ordenar:</span>
              {SORT_OPTIONS.map(opt => {
                const isActive   = sort === opt.key || sort === opt.toggle
                const isAltState = sort === opt.toggle
                const isBlockedOpt = opt.key === 'blocked'
                return (
                  <button
                    key={opt.key}
                    onClick={() => {
                      if (!isActive) {
                        setSort(opt.key)
                      } else if (opt.toggle) {
                        setSort(isAltState ? opt.key : opt.toggle)
                      }
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      isActive
                        ? isBlockedOpt
                          ? 'bg-red-600 border-red-600 text-white'
                          : 'bg-primary-600 border-primary-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    {isAltState ? opt.labelAlt : opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {!loading && filtered.length === 0 && (search || filterService || filterPerson) && (
          <p className="text-sm text-gray-400 text-center py-8">Sin resultados para los filtros aplicados</p>
        )}

        {starredProjects.length > 0 && (
          <section className="mb-8">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-yellow-400">
                <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L10 18.354 5.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.005z" clipRule="evenodd" />
              </svg>
              Proyectos destacados
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {starredProjects.map(renderCard)}
            </div>
          </section>
        )}

        {mineProjects.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Mis proyectos
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {mineProjects.map(renderCard)}
            </div>
          </section>
        )}

        {otherProjects.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Otros proyectos del workspace
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {otherProjects.map(renderCard)}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
