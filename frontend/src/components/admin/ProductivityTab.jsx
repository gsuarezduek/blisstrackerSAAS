import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60)    return 'hace un momento'
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  const days = Math.floor(diff / 86400)
  if (days === 1)   return 'hace 1 día'
  if (days < 7)     return `hace ${days} días`
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function StatPill({ label, value, color = 'gray' }) {
  const colors = {
    green:  'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
    amber:  'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
    blue:   'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
    gray:   'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  }
  return (
    <div className={`rounded-lg px-3 py-2 text-center ${colors[color]}`}>
      <p className="text-lg font-bold leading-tight">{value}</p>
      <p className="text-xs mt-0.5 opacity-75">{label}</p>
    </div>
  )
}

export default function ProductivityTab() {
  const [users,     setUsers]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState({}) // userId → true/false

  const fetchUsers = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/productivity')
      setUsers(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function handleRefresh(userId) {
    setRefreshing(prev => ({ ...prev, [userId]: true }))
    try {
      const { data } = await api.post(`/admin/productivity/${userId}/refresh`)
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, insightMemory: data } : u
      ))
    } catch {
      // silently ignore
    } finally {
      setRefreshing(prev => ({ ...prev, [userId]: false }))
    }
  }

  if (loading) {
    return <LoadingSpinner className="py-16" />
  }

  const withMemory    = users.filter(u => u.insightMemory)
  const withoutMemory = users.filter(u => !u.insightMemory)

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Productividad del equipo</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Basado en las últimas 4 semanas de actividad · Se actualiza automáticamente cada sábado
          </p>
        </div>
      </div>

      {/* Users with memory */}
      <div className="space-y-4">
        {withMemory.map(u => {
          const mem   = u.insightMemory
          const stats = mem.estadisticas || {}
          const tasa  = typeof stats.tasaCompletado === 'number'
            ? Math.round(stats.tasaCompletado * 100)
            : null
          const tasaColor = tasa === null ? 'gray' : tasa >= 70 ? 'green' : tasa >= 40 ? 'amber' : 'amber'
          const isRefreshing = !!refreshing[u.id]

          return (
            <div key={u.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <img
                    src={`/perfiles/${u.avatar ?? '2bee.png'}`}
                    alt={u.name}
                    className="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{u.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{u.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Actualizado {timeAgo(mem.updatedAt)}
                  </span>
                  <button
                    onClick={() => handleRefresh(u.id)}
                    disabled={isRefreshing}
                    className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-40 transition-colors flex items-center gap-1"
                    title="Regenerar análisis"
                  >
                    <span className={isRefreshing ? 'animate-spin inline-block' : ''}>↺</span>
                    <span>{isRefreshing ? 'Generando...' : 'Actualizar'}</span>
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="px-4 pt-3 pb-2 grid grid-cols-3 gap-2">
                <StatPill
                  label="Completado"
                  value={tasa !== null ? `${tasa}%` : '—'}
                  color={tasaColor}
                />
                <StatPill
                  label="Tareas / día"
                  value={stats.promedioTareasPorDia ?? '—'}
                  color="blue"
                />
                <StatPill
                  label="Proyectos / día"
                  value={stats.proyectosSimultaneos ?? '—'}
                  color="gray"
                />
              </div>

              {/* Insights */}
              <div className="px-4 pb-4 space-y-2.5 mt-1">
                {mem.tendencias && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">Tendencias</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">{mem.tendencias}</p>
                  </div>
                )}
                {mem.fortalezas && (
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600 dark:text-green-400 mb-0.5">Fortalezas</p>
                    <p className="text-sm text-green-800 dark:text-green-300 leading-snug">{mem.fortalezas}</p>
                  </div>
                )}
                {mem.areasDeAtencion && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-0.5">Áreas de atención</p>
                    <p className="text-sm text-amber-800 dark:text-amber-300 leading-snug">{mem.areasDeAtencion}</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Users without memory */}
      {withoutMemory.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">
            Sin datos aún
          </p>
          <div className="space-y-2">
            {withoutMemory.map(u => (
              <div key={u.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={`/perfiles/${u.avatar ?? '2bee.png'}`}
                    alt={u.name}
                    className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{u.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{u.role}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleRefresh(u.id)}
                  disabled={!!refreshing[u.id]}
                  className="text-xs bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                >
                  {refreshing[u.id] ? 'Generando...' : 'Generar análisis'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {users.length === 0 && (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <p className="text-2xl mb-2">📊</p>
          <p className="text-sm">No hay usuarios activos en el equipo.</p>
        </div>
      )}
    </div>
  )
}
