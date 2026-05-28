import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'
import { avatarUrl } from '../../utils/avatarUrl'
import ProductivityByProjectTab from './ProductivityByProjectTab'

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60)    return 'hace un momento'
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  const days = Math.floor(diff / 86400)
  if (days === 1)   return 'ayer'
  if (days < 7)     return `hace ${days} días`
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

const fmtHours = h => (h >= 1 ? `${h}h` : h > 0 ? `${Math.round(h * 60)}m` : '—')

const STATUS = {
  inactive: { label: 'inactivo',  cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
  down:     { label: '↓ baja',    cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
  stuck:    { label: 'atascos',   cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
  up:       { label: '↑ alta',    cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
  ok:       { label: 'OK',        cls: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' },
  nodata:   { label: 'sin datos', cls: 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500' },
}

const PRIORITY = { inactive: 0, down: 1, stuck: 2, ok: 3, up: 4, nodata: 5 }

const ALERT_STYLE = {
  critical: 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200',
  warn:     'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200',
  info:     'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200',
}

// Δ porcentual (tareas / horas)
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

// Mini sparkline de 4 puntos (tasa de completado semanal)
function Sparkline({ series }) {
  const pts = (series || []).map(w => w.tasa ?? 0)
  if (pts.length < 2) return null
  const W = 80, H = 24, max = Math.max(...pts, 0.01)
  const step = W / (pts.length - 1)
  const coords = pts.map((v, i) => `${(i * step).toFixed(1)},${(H - (v / max) * H).toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1], prev = pts[pts.length - 2]
  const color = last < prev ? '#ef4444' : last > prev ? '#22c55e' : '#9ca3af'
  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(W).toFixed(1)} cy={(H - (last / max) * H).toFixed(1)} r="2.5" fill={color} />
    </svg>
  )
}

// Barras horizontales de tiempo por proyecto
function ProjectBars({ porProyecto }) {
  if (!porProyecto || porProyecto.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500 italic">Sin tiempo registrado por proyecto.</p>
  }
  const max = Math.max(...porProyecto.map(p => p.minutes), 1)
  return (
    <div className="space-y-1.5">
      {porProyecto.map(p => (
        <div key={p.projectId} className="flex items-center gap-2">
          <span className="text-xs text-gray-600 dark:text-gray-300 w-32 truncate shrink-0" title={p.name}>{p.name}</span>
          <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
            <div className="bg-primary-500 h-3 rounded-full" style={{ width: `${Math.round(p.minutes / max * 100)}%` }} />
          </div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-20 text-right shrink-0">
            {fmtHours(Math.round(p.minutes / 60 * 10) / 10)} · {p.completadas}t
          </span>
        </div>
      ))}
    </div>
  )
}

function PersonRow({ m, expanded, onToggle, onRefresh, refreshing }) {
  const st = STATUS[m.status] || STATUS.ok
  const s = m.stats
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer"
      >
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-2.5">
            <span className={`text-gray-300 dark:text-gray-600 transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
            <img src={avatarUrl(m.avatar)} alt={m.name} className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-600" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate leading-tight">{m.name}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{m.role || '—'}</p>
            </div>
          </div>
        </td>
        <td className="py-2.5 px-3 text-center text-sm text-gray-700 dark:text-gray-300 tabular-nums">{s.completed}</td>
        <td className="py-2.5 px-3 text-center text-sm text-gray-700 dark:text-gray-300 tabular-nums">{fmtHours(s.hours)}</td>
        <td className="py-2.5 px-3 text-center text-sm text-gray-700 dark:text-gray-300 tabular-nums">{s.hasData ? `${Math.round(s.tasaCompletado * 100)}%` : '—'}</td>
        <td className="py-2.5 px-3 text-center text-sm font-medium tabular-nums"><DeltaPct value={s.delta?.tareasPct} /></td>
        <td className="py-2.5 px-3 text-sm text-gray-600 dark:text-gray-400 hidden sm:table-cell">
          {s.topProject ? <span className="truncate">{s.topProject.name} <span className="text-gray-400">· {s.topProject.pct}%</span></span> : '—'}
        </td>
        <td className="py-2.5 px-3 text-center">
          <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-gray-50 dark:bg-gray-800/60">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Tiempo por proyecto */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Tiempo por proyecto (4 sem)</p>
                <ProjectBars porProyecto={s.porProyecto} />
              </div>

              {/* Evolución + IA */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Tasa semanal</p>
                    <Sparkline series={s.weeklySeries} />
                  </div>
                  {s.stuckTasks > 0 && (
                    <div className="ml-auto text-right">
                      <p className="text-lg font-bold text-amber-600 dark:text-amber-400 leading-none">{s.stuckTasks}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">atascadas &gt;7d</p>
                    </div>
                  )}
                </div>

                {/* Análisis IA — solo si hay contenido */}
                {m.insight ? (
                  <div className="space-y-2">
                    {m.insight.tendencias && (
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug"><span className="text-gray-400 dark:text-gray-500">Cambio:</span> {m.insight.tendencias}</p>
                    )}
                    {m.insight.fortalezas && (
                      <p className="text-sm text-green-700 dark:text-green-400 leading-snug"><span className="opacity-60">Fortaleza:</span> {m.insight.fortalezas}</p>
                    )}
                    {m.insight.areasDeAtencion && (
                      <p className="text-sm text-red-700 dark:text-red-400 leading-snug"><span className="opacity-60">Riesgo:</span> {m.insight.areasDeAtencion}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-gray-500 italic">Sin señales destacables — dentro del promedio.</p>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={e => { e.stopPropagation(); onRefresh(m.id) }}
                    disabled={refreshing}
                    className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-40 transition-colors flex items-center gap-1"
                  >
                    <span className={refreshing ? 'animate-spin inline-block' : ''}>↺</span>
                    {refreshing ? 'Generando análisis...' : 'Regenerar análisis IA'}
                  </button>
                  {m.insight?.updatedAt && (
                    <span className="text-[11px] text-gray-300 dark:text-gray-600">actualizado {timeAgo(m.insight.updatedAt)}</span>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function ByPersonView() {
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [refreshing, setRefreshing] = useState({})

  const fetchData = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/productivity')
      setData(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleRefresh(userId) {
    setRefreshing(prev => ({ ...prev, [userId]: true }))
    try {
      const { data: insight } = await api.post(`/admin/productivity/${userId}/refresh`)
      setData(prev => ({
        ...prev,
        members: prev.members.map(m => m.id === userId ? { ...m, insight } : m),
      }))
    } catch {
      // silently ignore
    } finally {
      setRefreshing(prev => ({ ...prev, [userId]: false }))
    }
  }

  const sorted = useMemo(() => {
    if (!data) return []
    return [...data.members].sort((a, b) => {
      const pa = PRIORITY[a.status] ?? 3, pb = PRIORITY[b.status] ?? 3
      if (pa !== pb) return pa - pb
      const da = a.stats.delta?.tareasPct ?? 0, db = b.stats.delta?.tareasPct ?? 0
      return da - db
    })
  }, [data])

  if (loading) return <LoadingSpinner className="py-16" />
  if (!data || data.members.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 dark:text-gray-500">
        <p className="text-sm">No hay miembros activos en el equipo.</p>
      </div>
    )
  }

  const b = data.benchmark

  return (
    <div>
      {/* Banda de alertas */}
      {data.alerts.length > 0 && (
        <div className="mb-5 space-y-2">
          {data.alerts.map((a, i) => (
            <button
              key={i}
              onClick={() => setExpandedId(a.userId)}
              className={`w-full text-left flex items-start gap-2 border rounded-lg px-3 py-2 text-sm transition-opacity hover:opacity-80 ${ALERT_STYLE[a.severity]}`}
            >
              <span className="font-bold leading-tight">{a.severity === 'info' ? '↑' : '!'}</span>
              <span className="leading-snug">{a.text}</span>
            </button>
          ))}
        </div>
      )}

      {/* Benchmark del equipo */}
      {b && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
          Mediana del equipo ({b.teamSize} con actividad): <strong className="text-gray-500 dark:text-gray-400">{Math.round(b.tasaCompletado * 100)}%</strong> completado · <strong className="text-gray-500 dark:text-gray-400">{b.tareasPorDia}</strong> tareas/día · <strong className="text-gray-500 dark:text-gray-400">{b.horas}h</strong>
        </p>
      )}

      {/* Tabla */}
      <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
              <th className="py-2 px-3 text-left font-semibold">Persona</th>
              <th className="py-2 px-3 text-center font-semibold">Hechas</th>
              <th className="py-2 px-3 text-center font-semibold">Horas</th>
              <th className="py-2 px-3 text-center font-semibold">Tasa</th>
              <th className="py-2 px-3 text-center font-semibold">Δ tareas</th>
              <th className="py-2 px-3 text-left font-semibold hidden sm:table-cell">Top proyecto</th>
              <th className="py-2 px-3 text-center font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(m => (
              <PersonRow
                key={m.id}
                m={m}
                expanded={expandedId === m.id}
                onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
                onRefresh={handleRefresh}
                refreshing={!!refreshing[m.id]}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
        Métricas de las últimas 4 semanas vs las 4 previas. El análisis IA se actualiza cada sábado o al regenerarlo.
      </p>
    </div>
  )
}

export default function ProductivityTab() {
  const [tab, setTab] = useState('person')

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Productividad del equipo</h2>
        <div className="flex gap-1 mt-3 border-b border-gray-200 dark:border-gray-700">
          {[['person', 'Por persona'], ['project', 'Por proyecto']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                tab === key
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'person' ? <ByPersonView /> : <ProductivityByProjectTab />}
    </div>
  )
}
