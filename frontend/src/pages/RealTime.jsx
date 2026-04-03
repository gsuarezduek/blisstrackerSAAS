import { useState, useEffect, useCallback } from 'react'
import Navbar from '../components/Navbar'
import { linkify } from '../utils/linkify'
import api from '../api/client'
import useRoles from '../hooks/useRoles'
import UserTasksModal from '../components/UserTasksModal'
import { fmtMins } from '../utils/format'

const ROLE_COLORS_LIST = [
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-yellow-100 text-yellow-700',
  'bg-blue-100 text-blue-700',
  'bg-cyan-100 text-cyan-700',
  'bg-green-100 text-green-700',
  'bg-orange-100 text-orange-700',
]

function roleColor(name) {
  let hash = 0
  for (const c of (name || '')) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return ROLE_COLORS_LIST[hash % ROLE_COLORS_LIST.length]
}

const REFRESH_INTERVAL = 30 // seconds

function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

function elapsed(startedAt, now) {
  if (!startedAt) return null
  const totalSecs = Math.floor((now - new Date(startedAt)) / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function Avatar({ user }) {
  return (
    <img
      src={`/perfiles/${user.avatar ?? 'bee.png'}`}
      alt={user.name}
      className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0"
    />
  )
}

function UserCard({ entry, now }) {
  const { user, workDay, currentTask, stats } = entry
  const { labelFor } = useRoles()
  const isActive = !workDay.endedAt
  const hasTask = !!currentTask

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border-2 p-5 flex flex-col gap-4 transition-all ${
      hasTask ? 'border-primary-300 shadow-md shadow-primary-50/30' :
      isActive ? 'border-gray-200 dark:border-gray-600' : 'border-gray-100 dark:border-gray-700 opacity-60'
    }`}>
      {/* User header */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar user={user} />
          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 ${
            !isActive ? 'bg-gray-300' :
            hasTask ? 'bg-primary-500 animate-pulse' : 'bg-green-400'
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white truncate">{user.name}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor(user.role)}`}>
            {labelFor(user.role)}
          </span>
        </div>
        <div className="text-right flex-shrink-0">
          {!isActive && <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">Finalizó</span>}
          {isActive && !hasTask && <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">Disponible</span>}
          {hasTask && (
            <div className="text-right">
              <p className="text-xs text-gray-400 dark:text-gray-500">En tarea hace</p>
              <p className="text-sm font-bold text-primary-600 tabular-nums">{elapsed(currentTask.startedAt, now)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Current task */}
      {hasTask && (
        <div className="bg-primary-50 dark:bg-primary-900/20 rounded-xl px-4 py-3">
          <div className="flex items-start gap-2">
            <span className="text-primary-400 mt-0.5">▶</span>
            <div>
              <p className="text-sm font-medium text-primary-900 dark:text-primary-300">{linkify(currentTask.description)}</p>
              <span className="text-xs bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-700 rounded px-2 py-0.5 mt-1 inline-block">
                {currentTask.project.name}
              </span>
            </div>
          </div>
        </div>
      )}

      {!hasTask && isActive && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500">Sin tarea activa en este momento</p>
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 border-t dark:border-gray-700 pt-3">
        <div className="flex gap-4">
          <span>✓ <strong className="text-gray-700 dark:text-gray-300">{stats.completed}</strong> completadas</span>
          <span>⏳ <strong className="text-gray-700 dark:text-gray-300">{stats.pending}</strong> pendientes</span>
          {stats.blocked > 0 && (
            <span>⚠ <strong className="text-red-600 dark:text-red-400">{stats.blocked}</strong> bloqueadas</span>
          )}
        </div>
        <span className="font-medium text-gray-600 dark:text-gray-400">{fmtMins(stats.totalMinutes)} registradas</span>
      </div>

      {/* Workday elapsed */}
      {isActive && (
        <p className="text-xs text-gray-400 dark:text-gray-500 -mt-2">
          Jornada iniciada hace {elapsed(workDay.startedAt, now)}
        </p>
      )}
    </div>
  )
}

export default function RealTime() {
  const { labelFor } = useRoles()
  const [entries, setEntries] = useState([])
  const [notStarted, setNotStarted] = useState([])
  const [loading, setLoading] = useState(true)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const now = useNow()

  const load = useCallback(async () => {
    try {
      const { data: res } = await api.get('/realtime')
      const sorted = [...res.entries].sort((a, b) => {
        const rank = e => e.currentTask ? 0 : !e.workDay.endedAt ? 1 : 2
        return rank(a) - rank(b) || a.user.name.localeCompare(b.user.name)
      })
      setEntries(sorted)
      setNotStarted(res.notStarted)
      setLastUpdate(new Date())
    } finally {
      setLoading(false)
      setCountdown(REFRESH_INTERVAL)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-refresh countdown
  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { load(); return REFRESH_INTERVAL }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [load])

  const active = entries.filter(e => !e.workDay.endedAt)
  const finished = entries.filter(e => e.workDay.endedAt)
  const workingNow = active.filter(e => e.currentTask).length

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse inline-block" />
              Actividad en tiempo real del equipo
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
              {new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="text-right">
            <button
              onClick={load}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              Actualizar ahora
            </button>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Auto-refresh en {countdown}s
              {lastUpdate && ` · Última actualización ${lastUpdate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
            </p>
          </div>
        </div>

        {/* Summary pills */}
        <div className="flex gap-3 mb-8 flex-wrap">
          <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{workingNow} trabajando ahora</span>
          </div>
          <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{active.length} activos hoy</span>
          </div>
          {finished.length > 0 && (
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-gray-300 rounded-full" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{finished.length} finalizaron jornada</span>
            </div>
          )}
          {notStarted.length > 0 && (
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-gray-200 rounded-full" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{notStarted.length} sin jornada</span>
            </div>
          )}
        </div>

        {loading && (
          <div className="text-center py-20 text-gray-400">Cargando...</div>
        )}

        {/* Active users grid */}
        {active.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">Activos ahora</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {active.map(entry => (
                <button key={entry.user.id} className="text-left" onClick={() => setSelectedUser(entry.user)}>
                  <UserCard entry={entry} now={now} />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Finished users */}
        {finished.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">Finalizaron jornada</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {finished.map(entry => (
                <button key={entry.user.id} className="text-left" onClick={() => setSelectedUser(entry.user)}>
                  <UserCard entry={entry} now={now} />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Not started */}
        {notStarted.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">No iniciaron jornada</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {notStarted.map(user => (
                <button key={user.id} className="text-left" onClick={() => setSelectedUser(user)}>
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-100 dark:border-gray-700 opacity-50 p-5 flex items-center gap-3">
                    <Avatar user={user} />
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white truncate">{user.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor(user.role)}`}>
                        {labelFor(user.role)}
                      </span>
                    </div>
                    <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full flex-shrink-0">Sin jornada</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      {selectedUser && (
        <UserTasksModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  )
}
