import { useState, useEffect, useCallback, Fragment } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'
import { avatarUrl } from '../../utils/avatarUrl'
import ProductivityPeriodLabel from './ProductivityPeriodLabel'

const fmtHours = h => (h >= 1 ? `${h}h` : h > 0 ? `${Math.round(h * 60)}m` : '—')

function DeltaPct({ value }) {
  if (value === null || value === undefined) return <span className="text-gray-300 dark:text-gray-600">—</span>
  const p = Math.round(value * 100)
  if (p === 0) return <span className="text-gray-400">=</span>
  const up = p > 0
  return (
    <span className={up ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
      {up ? '↑' : '↓'}{Math.abs(p)}%
    </span>
  )
}

export default function ProductivityByProjectTab({ mode }) {
  const [projects, setProjects] = useState([])
  const [period, setPeriod]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/admin/productivity/by-project', { params: { mode } })
      setProjects(data.projects || [])
      setPeriod(data.period || null)
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <LoadingSpinner className="py-16" />
  if (projects.length === 0) {
    return (
      <div>
        <ProductivityPeriodLabel period={period} />
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <p className="text-sm">No hay tiempo registrado en proyectos en este período.</p>
        </div>
      </div>
    )
  }

  const maxHours = Math.max(...projects.map(p => p.hours), 1)

  return (
    <div>
      <ProductivityPeriodLabel period={period} />
      <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
              <th className="py-2 px-3 text-left font-semibold">Proyecto</th>
              <th className="py-2 px-3 text-left font-semibold w-1/3">Horas del equipo</th>
              <th className="py-2 px-3 text-center font-semibold">Tareas</th>
              <th className="py-2 px-3 text-center font-semibold">Personas</th>
              <th className="py-2 px-3 text-center font-semibold">Δ horas</th>
            </tr>
          </thead>
          <tbody>
            {projects.map(p => {
              const expanded = expandedId === p.projectId
              return (
                <Fragment key={p.projectId}>
                  <tr
                    onClick={() => setExpandedId(expanded ? null : p.projectId)}
                    className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer"
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-gray-300 dark:text-gray-600 transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                          <div className="bg-primary-500 h-3 rounded-full" style={{ width: `${Math.round(p.hours / maxHours * 100)}%` }} />
                        </div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-12 text-right">{fmtHours(p.hours)}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center text-sm text-gray-700 dark:text-gray-300 tabular-nums">{p.completed}</td>
                    <td className="py-2.5 px-3 text-center text-sm text-gray-700 dark:text-gray-300 tabular-nums">{p.contributors.length}</td>
                    <td className="py-2.5 px-3 text-center text-sm font-medium tabular-nums"><DeltaPct value={p.horasDeltaPct} /></td>
                  </tr>
                  {expanded && (
                    <tr className="bg-gray-50 dark:bg-gray-800/60">
                      <td colSpan={5} className="px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Quién aportó</p>
                        <div className="flex flex-wrap gap-x-5 gap-y-2">
                          {p.contributors.map(c => (
                            <div key={c.id} className="flex items-center gap-2">
                              <img src={avatarUrl(c.avatar)} alt={c.name} className="w-6 h-6 rounded-full object-cover border border-gray-200 dark:border-gray-600" />
                              <span className="text-sm text-gray-700 dark:text-gray-300">{c.name}</span>
                              <span className="text-xs font-medium text-gray-400 dark:text-gray-500">{fmtHours(c.hours)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
        Horas dedicadas por el equipo en el período. El Δ compara el ritmo por día logueado contra el período anterior, para neutralizar diferencias en la cantidad de días trabajados.
      </p>
    </div>
  )
}
