import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import useRoles from '../hooks/useRoles'
import useMembers from '../hooks/useMembers'
import UserLink from '../components/UserLink'
import { avatarUrl } from '../utils/avatarUrl'
import LoadingSpinner from '../components/LoadingSpinner'
import { renderMarkdown } from '../utils/processMarkdown'
import { printProcess } from '../utils/printProcess'
import WikiTab from '../components/docs/WikiTab'

const BASE_TABS = [
  { id: 'filosofia', label: 'Filosofía' },
  { id: 'wiki',      label: 'Wiki' },
  { id: 'roles',     label: 'Roles' },
]

// ── Filosofía ──────────────────────────────────────────────────────────────

function FilosofiaTab() {
  const principles = [
    {
      icon: '🚫',
      title: 'Sin prioridades artificiales',
      body: 'En la práctica, todo termina siendo "alta prioridad" y las listas crecen sin control. En lugar de eso: elegir pocas tareas importantes por día y ejecutarlas bien.',
      accent: 'border-red-200 dark:border-red-800',
      iconBg: 'bg-red-50 dark:bg-red-900/30',
    },
    {
      icon: '📅',
      title: 'Sin fechas ni deadlines complejos',
      body: 'Las fechas generan sobrecarga mental y sensación constante de atraso. Trabajamos por día, no por acumulación futura. Las tareas no completadas se trasladan al siguiente día (carry-over).',
      accent: 'border-amber-200 dark:border-amber-800',
      iconBg: 'bg-amber-50 dark:bg-amber-900/30',
    },
    {
      icon: '⚡',
      title: 'Menos ruido, más acción',
      body: 'Cada funcionalidad extra tiene un costo. Por eso el sistema es simple: crear tareas es rápido, entender qué hacer es inmediato, ejecutar es lo principal.',
      accent: 'border-blue-200 dark:border-blue-800',
      iconBg: 'bg-blue-50 dark:bg-blue-900/30',
    },
    {
      icon: '🎯',
      title: 'Foco en ejecución, no en organización',
      body: 'Muchos sistemas optimizan la planificación. Nosotros optimizamos la ejecución: menos tiempo gestionando tareas, más tiempo haciendo trabajo real.',
      accent: 'border-green-200 dark:border-green-800',
      iconBg: 'bg-green-50 dark:bg-green-900/30',
    },
    {
      icon: '🧠',
      title: 'Una forma de trabajo más humana',
      body: 'El trabajo real no es lineal ni perfectamente planificable. Este sistema se adapta: permite reorganizarse diariamente y hace visible el progreso real.',
      accent: 'border-purple-200 dark:border-purple-800',
      iconBg: 'bg-purple-50 dark:bg-purple-900/30',
    },
  ]

  return (
    <div className="space-y-6">

      {/* Hero */}
      <div className="bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl p-7 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-200 mb-2">Filosofía de trabajo</p>
        <h2 className="text-2xl font-bold leading-snug mb-3">Simplicidad + Foco Diario</h2>
        <p className="text-primary-100 text-sm leading-relaxed mb-4">
          En lugar de usar múltiples etiquetas, prioridades, fechas y configuraciones complejas, el sistema está diseñado para responder una sola pregunta:
        </p>
        <div className="bg-white/15 rounded-xl px-4 py-3 text-center">
          <p className="text-lg font-semibold">¿Qué es lo importante que tengo que hacer hoy?</p>
        </div>
      </div>

      {/* Principios */}
      <div className="space-y-3">
        {principles.map(p => (
          <div key={p.title} className={`bg-white dark:bg-gray-800 border ${p.accent} rounded-2xl p-5 flex gap-4`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl ${p.iconBg}`}>
              {p.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{p.title}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{p.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Cierre */}
      <div className="bg-gray-900 dark:bg-gray-700 rounded-2xl p-6 text-center">
        <p className="text-white font-semibold text-base leading-relaxed">
          No buscamos hacer más cosas.<br />Buscamos hacer mejor las cosas importantes.
        </p>
        <p className="text-primary-400 font-medium mt-3 text-sm">Y para eso, menos es más.</p>
      </div>
    </div>
  )
}

// ── Roles ──────────────────────────────────────────────────────────────────

const FREQ_GROUPS = {
  monday:     { label: 'Lunes',                icon: '📅', color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' },
  daily:      { label: 'Lunes a viernes',      icon: '🔄', color: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' },
  friday:     { label: 'Viernes',              icon: '📅', color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' },
  weekly:     { label: 'Semanal',              icon: '📆', color: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300' },
  first_week: { label: 'Primera semana',       icon: '🗓️', color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300' },
  monthly:    { label: 'Mensual',              icon: '📊', color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' },
}

function RolesTab({ processes, onOpenProcess, selectedRole, onSelectRole }) {
  const { user } = useAuth()
  const isAdmin = user?.isAdmin === true
  const { roles, labelFor } = useRoles()
  const { members } = useMembers()
  const [expectations, setExpectations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/role-expectations/all').then(r => setExpectations(r.data)).finally(() => setLoading(false))
  }, [])

  const expByName = useMemo(() => {
    const map = new Map()
    for (const e of expectations) map.set(e.roleName, e)
    return map
  }, [expectations])

  const processesByRole = useMemo(() => {
    const map = new Map()
    for (const p of processes) {
      if (!p.ownerRole) continue
      if (!map.has(p.ownerRole)) map.set(p.ownerRole, [])
      map.get(p.ownerRole).push(p)
    }
    return map
  }, [processes])

  const membersByRole = useMemo(() => {
    const map = new Map()
    for (const m of members) {
      if (!m.role || m.active === false) continue
      if (!map.has(m.role)) map.set(m.role, [])
      map.get(m.role).push(m)
    }
    return map
  }, [members])

  // Rol activo: el de la URL si es válido, si no el propio, si no el primero del catálogo.
  const activeRoleName = useMemo(() => {
    if (roles.length === 0) return null
    if (selectedRole && roles.some(r => r.name === selectedRole)) return selectedRole
    if (user?.role && roles.some(r => r.name === user.role)) return user.role
    return roles[0].name
  }, [roles, selectedRole, user])

  if (loading) return (
    <LoadingSpinner className="py-16" />
  )

  if (roles.length === 0) return (
    <div className="text-center py-16 text-gray-400 dark:text-gray-500">
      <p className="text-3xl mb-3">🎯</p>
      <p className="text-sm">No hay roles configurados todavía.</p>
    </div>
  )

  const exp = expByName.get(activeRoleName)
  const results  = Array.isArray(exp?.expectedResults) ? exp.expectedResults : []
  const resps    = Array.isArray(exp?.operationalResponsibilities) ? exp.operationalResponsibilities : []
  const tasks    = Array.isArray(exp?.recurrentTasks) ? exp.recurrentTasks : []
  const training = Array.isArray(exp?.training) ? exp.training : []
  const skills   = Array.isArray(exp?.skills) ? exp.skills : []
  const tools    = Array.isArray(exp?.tools) ? exp.tools : []
  const guides   = Array.isArray(exp?.guides) ? exp.guides : []
  const hasCompetencia = !!(exp?.educationLevel || exp?.experienceRequired)
  const roleProcesses = processesByRole.get(activeRoleName) ?? []
  const rolePeople     = membersByRole.get(activeRoleName) ?? []
  const hasContent = !!exp?.description || hasCompetencia || training.length > 0 || skills.length > 0
    || results.length > 0 || resps.length > 0 || tasks.length > 0 || roleProcesses.length > 0
    || tools.length > 0 || !!exp?.roleTestUrl || guides.length > 0
  const isMine = activeRoleName === user?.role
  const label  = labelFor(activeRoleName)

  return (
    <div>
      {/* Selector de rol */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {roles.map(r => {
          const active = r.name === activeRoleName
          const mine   = r.name === user?.role
          return (
            <button
              key={r.id}
              onClick={() => onSelectRole(r.name)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                active
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-primary-300 dark:hover:border-primary-700'
              }`}
            >
              {r.label}
              {mine && (
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-white' : 'bg-primary-500'}`} title="Tu rol" />
              )}
            </button>
          )
        })}
      </div>

      {/* Ficha del rol activo */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 sm:px-7 pt-6 pb-5 border-b border-gray-100 dark:border-gray-700 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl font-bold ${
              isMine
                ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}>
              {label.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{label}</h2>
                {isMine && (
                  <span className="text-xs bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 rounded-full px-2.5 py-0.5 font-medium">
                    Tu rol
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {rolePeople.length} persona{rolePeople.length !== 1 ? 's' : ''} con este rol
              </p>
            </div>
          </div>
          {isAdmin && (
            <a
              href={`/admin?tab=roles&role=${encodeURIComponent(activeRoleName)}`}
              className="inline-flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 px-2.5 py-1.5 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex-shrink-0"
              title="Editar este rol en el panel de Admin"
            >
              Editar rol →
            </a>
          )}
        </div>

        {!hasContent && rolePeople.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-10">
            Este rol todavía no tiene información cargada.
          </p>
        )}

        {/* Personas con este rol */}
        {rolePeople.length > 0 && (
          <div className="px-6 sm:px-7 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">👥</span>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Personas con este rol</p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {rolePeople.map(p => (
                <UserLink
                  key={p.id}
                  userId={p.id}
                  as="div"
                  className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/40 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full pl-1.5 pr-3.5 py-1.5 transition-colors"
                >
                  <img src={avatarUrl(p.avatar)} alt={p.name} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{p.name}</span>
                </UserLink>
              ))}
            </div>
          </div>
        )}

        {/* Propósito */}
        {exp?.description && (
          <div className="px-6 sm:px-7 pt-5">
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed italic border-l-2 border-gray-200 dark:border-gray-600 pl-3">
              {exp.description}
            </p>
          </div>
        )}

        {/* Competencia mínima del puesto */}
        {hasCompetencia && (
          <div className="px-6 sm:px-7 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">🎓</span>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Competencia mínima del puesto</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {exp.educationLevel && (
                <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-gray-400 dark:text-gray-500">Grado de estudio</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{exp.educationLevel}</p>
                </div>
              )}
              {exp.experienceRequired && (
                <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-gray-400 dark:text-gray-500">Experiencia</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{exp.experienceRequired}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Formación (conocimientos específicos) */}
        {training.length > 0 && (
          <div className="px-6 sm:px-7 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">📚</span>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Formación (conocimientos específicos)</p>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {training.map((t, i) => (
                <li key={i} className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-1.5">{t}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Habilidades */}
        {skills.length > 0 && (
          <div className="px-6 sm:px-7 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">✨</span>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Habilidades</p>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {skills.map((s, i) => (
                <li key={i} className="text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/15 rounded-lg px-3 py-1.5">{s}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Resultados esperados */}
        {results.length > 0 && (
          <div className="px-6 sm:px-7 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">🎯</span>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Resultados esperados</p>
            </div>
            <div className="space-y-2">
              {results.map((r, i) => (
                <div key={i} className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-900/10 rounded-xl px-3 py-2.5">
                  <span className="text-blue-400 dark:text-blue-500 flex-shrink-0 font-bold text-xs mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                  <p className="text-sm text-blue-900 dark:text-blue-200 leading-snug">{r}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Responsabilidades operativas */}
        {resps.length > 0 && (
          <div className="px-6 sm:px-7 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">⚙️</span>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Responsabilidades operativas</p>
            </div>
            <div className="space-y-3">
              {resps.map((r, i) => (
                <div key={i} className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1.5">{r.category}</p>
                  {Array.isArray(r.items) && r.items.length > 0 && (
                    <ul className="space-y-1">
                      {r.items.map((item, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 flex-shrink-0 mt-2" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tareas recurrentes */}
        {tasks.length > 0 && (
          <div className="px-6 sm:px-7 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">🔁</span>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Tareas recurrentes</p>
            </div>
            <div className="space-y-2">
              {tasks.map((t, i) => {
                const freq = FREQ_GROUPS[t.frequency] || { label: t.frequency, icon: '📌', color: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' }
                return (
                  <div key={i} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl px-3 py-3">
                    <span className={`text-xs font-medium rounded-lg px-2 py-1 flex-shrink-0 whitespace-nowrap ${freq.color}`}>
                      {freq.icon} {freq.label}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.task}</p>
                      {t.detail && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.detail}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Procesos asociados */}
        {roleProcesses.length > 0 && (
          <div className="px-6 sm:px-7 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">⚙️</span>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Procesos asociados</p>
            </div>
            <div className="space-y-2">
              {roleProcesses.map(p => (
                <button
                  key={p.id}
                  onClick={() => onOpenProcess(p.id)}
                  className="w-full flex items-center justify-between gap-3 bg-emerald-50 dark:bg-emerald-900/10 hover:bg-emerald-100 dark:hover:bg-emerald-900/20 rounded-xl px-3 py-2.5 transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-emerald-500 dark:text-emerald-400 flex-shrink-0">⚙️</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200 truncate">{p.name}</p>
                      <p className="text-xs text-emerald-700/70 dark:text-emerald-400/70">{p.steps.length} paso{p.steps.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-500 dark:text-emerald-400 flex-shrink-0">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Herramientas y conocimientos */}
        {tools.length > 0 && (
          <div className="px-6 sm:px-7 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">🛠️</span>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Herramientas y conocimientos</p>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {tools.map((t, i) => (
                <li key={i} className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-1.5">{t}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Test del rol + Guías asociadas */}
        {(exp?.roleTestUrl || guides.length > 0) && (
          <div className="px-6 sm:px-7 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">📖</span>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Guías y evaluación del rol</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {exp?.roleTestUrl && (
                <a
                  href={exp.roleTestUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/40 border border-primary-100 dark:border-primary-800 rounded-lg px-3 py-1.5 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
                    <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9zM4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                  </svg>
                  📝 Test del rol
                </a>
              )}
              {guides.map((g, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <a
                    href={g.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-100 dark:border-emerald-800 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
                      <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                      <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                    </svg>
                    {g.label}
                  </a>
                  {g.testUrl && (
                    <a
                      href={g.testUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Test de ${g.label}`}
                      className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/40 border border-primary-100 dark:border-primary-800 rounded-lg px-2.5 py-1.5 transition-colors"
                    >
                      📝 Test
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="h-6" />
      </div>
    </div>
  )
}

// ── Procesos ───────────────────────────────────────────────────────────────

function ProcesosTab({ processes, roles, expandedId, onExpand, onOpenRole }) {
  const { user } = useAuth()
  const isAdmin = user?.isAdmin === true

  const sorted = [...processes].sort((a, b) => a.order - b.order)
  const roleOf = roleName => roles.find(r => r.name === roleName)?.label ?? roleName

  return (
    <div>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">⚙️</span>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide">Procesos del negocio</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Cómo hacemos las cosas. Los procesos centrales que todos seguimos para que el negocio funcione bien.
        </p>
      </div>

      <div className="space-y-3">
        {sorted.map(p => {
          const isOpen = expandedId === p.id
          const roleLabel = p.ownerRole ? roleOf(p.ownerRole) : null
          const steps = [...p.steps].sort((a, b) => a.order - b.order)

          return (
            <div key={p.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
              {/* Header */}
              <button
                onClick={() => onExpand(isOpen ? null : p.id)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 text-lg">
                    ⚙️
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-gray-900 dark:text-white truncate">{p.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {roleLabel ? (
                        <span className="text-xs text-gray-500 dark:text-gray-400">{roleLabel}</span>
                      ) : (
                        <span className="text-xs text-gray-300 dark:text-gray-600 italic">Sin rol asignado</span>
                      )}
                      <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">{steps.length} paso{steps.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                  className={`w-5 h-5 text-gray-400 flex-shrink-0 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>

              {/* Contenido */}
              {isOpen && (
                <div className="border-t border-gray-100 dark:border-gray-700 px-5 pt-5 pb-5 space-y-5">
                  {/* Meta: rol + acciones */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {roleLabel && p.ownerRole ? (
                      <button
                        onClick={() => onOpenRole(p.ownerRole)}
                        className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12.735 14c.618 0 1.093-.561.872-1.139a6.002 6.002 0 0 0-11.215 0c-.22.578.254 1.139.872 1.139h9.47Z" />
                        </svg>
                        Rol: <span className="font-medium underline-offset-2 hover:underline">{roleLabel}</span>
                      </button>
                    ) : <span />}

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => printProcess(p, roles)}
                        className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 px-2.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        title="Imprimir / Guardar como PDF"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                          <path fillRule="evenodd" d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.046.752.097 1.126.153A2.212 2.212 0 0 1 18 8.653v4.097A2.25 2.25 0 0 1 15.75 15h-.241l.305 1.984A1.75 1.75 0 0 1 14.084 19H5.915a1.75 1.75 0 0 1-1.73-2.016L4.49 15H4.25A2.25 2.25 0 0 1 2 12.75V8.653c0-1.082.775-2.034 1.874-2.198.374-.056.749-.107 1.126-.153V2.75Zm4.5 13.5h1l-.307-2H9.807l-.307 2Z" clipRule="evenodd" />
                        </svg>
                        Imprimir
                      </button>
                      {isAdmin && (
                        <a
                          href="/admin/eos?tab=procesos"
                          className="inline-flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 px-2.5 py-1 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                          title="Editar este proceso en el módulo EOS"
                        >
                          Editar en EOS →
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Descripción */}
                  {p.description?.trim() && (
                    <div className="bg-gray-50 dark:bg-gray-700/40 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-3">
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                        {p.description}
                      </p>
                    </div>
                  )}

                  {/* Pasos */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                      Pasos del proceso
                    </p>
                    {steps.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500 italic">Sin pasos documentados todavía.</p>
                    ) : (
                      <ol className="space-y-3">
                        {steps.map((s, i) => (
                          <li key={s.id} className="flex items-start gap-3">
                            <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug">{s.title}</p>
                              {s.description?.trim() && (
                                <div className="mt-1.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 px-3 py-2">
                                  {renderMarkdown(s.description)}
                                </div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────

export default function Docs() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [processes, setProcesses] = useState([])
  const [processRoles, setProcessRoles] = useState([])
  const [procesosLoaded, setProcesosLoaded] = useState(false)

  useEffect(() => {
    api.get('/processes').then(r => {
      setProcesses(r.data.processes ?? [])
      setProcessRoles(r.data.roles ?? [])
    }).catch(() => {
      setProcesses([])
      setProcessRoles([])
    }).finally(() => setProcesosLoaded(true))
  }, [])

  const tabs = useMemo(() => (
    processes.length > 0
      ? [...BASE_TABS, { id: 'procesos', label: 'Procesos' }]
      : BASE_TABS
  ), [processes.length])

  // Back-compat: el viejo tab 'manual' ahora es el Wiki.
  const requestedTab = searchParams.get('tab') === 'manual' ? 'wiki' : searchParams.get('tab')
  const tab = tabs.find(t => t.id === requestedTab) ? requestedTab : 'filosofia'

  const expandedProcessId = Number(searchParams.get('id')) || null
  const wikiArticleId = searchParams.get('article') || null
  const selectedRole = searchParams.get('role') || null

  function setTab(id, extra) {
    const next = { tab: id }
    if (extra) Object.assign(next, extra)
    setSearchParams(next)
  }

  function openWikiArticle(articleId) {
    setSearchParams({ tab: 'wiki', article: articleId })
  }

  function openProcess(id) {
    setSearchParams({ tab: 'procesos', id: String(id) })
  }

  function openRole(roleName) {
    setSearchParams({ tab: 'roles', role: roleName })
  }

  function setExpandedProcess(id) {
    if (id == null) setSearchParams({ tab: 'procesos' })
    else            setSearchParams({ tab: 'procesos', id: String(id) })
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Docs</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Guías y referencias del equipo</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-8 w-fit flex-wrap">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'filosofia' && <FilosofiaTab />}
        {tab === 'wiki'      && <WikiTab articleId={wikiArticleId} onSelect={openWikiArticle} />}
        {tab === 'roles'     && (
          procesosLoaded
            ? <RolesTab processes={processes} onOpenProcess={openProcess} selectedRole={selectedRole} onSelectRole={r => setSearchParams({ tab: 'roles', role: r })} />
            : <LoadingSpinner className="py-16" />
        )}
        {tab === 'procesos'  && (
          <ProcesosTab
            processes={processes}
            roles={processRoles}
            expandedId={expandedProcessId}
            onExpand={setExpandedProcess}
            onOpenRole={openRole}
          />
        )}
      </div>
    </div>
  )
}
