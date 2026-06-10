import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import ObjectiveProgressBars from './ObjectiveProgressBars'
import useObjectiveProgress from './useObjectiveProgress'

function fmtNum(n) {
  if (n == null) return '—'
  return n.toLocaleString('es-AR')
}

function fmtK(n) {
  if (n == null) return '—'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000)    return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function gainColor(n) {
  if (n == null || n === 0) return 'text-gray-400'
  return n > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
}

function engColor(rate) {
  if (rate == null) return 'text-gray-400'
  if (rate >= 3)    return 'text-green-600 dark:text-green-400'
  if (rate >= 1)    return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-500 dark:text-red-400'
}

// Sparkline simple de seguidores
function FollowerSparkline({ logs }) {
  if (!logs || logs.length < 2) {
    return <p className="text-xs text-gray-400">Todavía no hay suficiente historial para graficar.</p>
  }
  const values = logs.map(l => l.followersCount)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const W = 280, H = 60
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W
    const y = H - ((v - min) / range) * H
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none">
      <path d={pts} fill="none" stroke="#a855f7" strokeWidth="2" />
    </svg>
  )
}

function Avatar({ url, fallback }) {
  const [err, setErr] = useState(false)
  if (url && !err) {
    return <img src={url} alt="" onError={() => setErr(true)} referrerPolicy="no-referrer" className="w-11 h-11 rounded-full object-cover border border-purple-200 dark:border-purple-800" />
  }
  return (
    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold">
      {(fallback || '?')[0].toUpperCase()}
    </div>
  )
}

function Metric({ label, value, valueClass = '' }) {
  return (
    <div className="text-center">
      <p className={`text-sm font-bold tabular-nums ${valueClass || 'text-gray-900 dark:text-white'}`}>{value}</p>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  )
}

function CompetitorCard({ projectId, c, onChanged }) {
  const [refreshing, setRefreshing] = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [expanded,   setExpanded]   = useState(false)
  const [history,    setHistory]    = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [err,        setErr]        = useState(null)

  async function handleRefresh() {
    setRefreshing(true); setErr(null)
    try {
      await api.post(`/marketing/projects/${projectId}/competitors/${c.id}/refresh`)
      onChanged()
      if (expanded) loadHistory(true)
    } catch (e) {
      setErr(e.response?.data?.error || 'No se pudo actualizar.')
    } finally { setRefreshing(false) }
  }

  async function handleDelete() {
    if (!window.confirm(`¿Quitar a @${c.username} de competidores?`)) return
    setDeleting(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/competitors/${c.id}`)
      onChanged()
    } catch (e) {
      alert(e.response?.data?.error || 'No se pudo eliminar.')
      setDeleting(false)
    }
  }

  const loadHistory = useCallback(async (force = false) => {
    if (history && !force) return
    setHistoryLoading(true)
    try {
      const { data } = await api.get(`/marketing/projects/${projectId}/competitors/${c.id}/history`, { params: { months: 6 } })
      setHistory(data)
    } catch { /* silencioso */ }
    finally { setHistoryLoading(false) }
  }, [projectId, c.id, history])

  function toggleHistory() {
    const next = !expanded
    setExpanded(next)
    if (next) loadHistory()
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <Avatar url={c.profilePicUrl} fallback={c.username} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <a
                href={`https://www.instagram.com/${c.username}/`}
                target="_blank" rel="noopener noreferrer"
                className="font-semibold text-gray-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 truncate block"
              >
                @{c.username}
              </a>
              {c.displayName && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.displayName}</p>}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button onClick={handleRefresh} disabled={refreshing} className="text-xs text-purple-500 hover:text-purple-600 dark:text-purple-400 disabled:opacity-50 transition-colors">
                {refreshing ? 'Actualizando…' : '↻'}
              </button>
              <button onClick={handleDelete} disabled={deleting} className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors">
                {deleting ? '…' : '✕'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mt-3">
            <Metric label="Seguidores" value={fmtK(c.followersCount)} />
            <Metric
              label="Nuevos/mes"
              value={c.monthlyGain != null ? `${c.monthlyGain > 0 ? '+' : ''}${fmtNum(c.monthlyGain)}` : '—'}
              valueClass={gainColor(c.monthlyGain)}
            />
            <Metric label="Posts/mes" value={c.postsCount != null ? fmtNum(c.postsCount) : '—'} />
            <Metric
              label="Engagement"
              value={c.engagementRate != null ? `${c.engagementRate}%` : '—'}
              valueClass={engColor(c.engagementRate)}
            />
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-3 text-xs text-gray-400">
              {c.avgLikes != null && <span>❤️ {fmtK(Math.round(c.avgLikes))}</span>}
              {c.avgComments != null && <span>💬 {fmtK(Math.round(c.avgComments))}</span>}
            </div>
            <button onClick={toggleHistory} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline underline-offset-2">
              {expanded ? 'Ocultar historial' : 'Ver historial'}
            </button>
          </div>

          {err && <p className="text-xs text-red-500 mt-2">{err}</p>}

          {expanded && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              {historyLoading ? (
                <p className="text-xs text-gray-400">Cargando historial…</p>
              ) : (
                <>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Seguidores (últimos registros)</p>
                  <FollowerSparkline logs={history?.followerLogs} />
                  {history?.snapshots?.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {history.snapshots.slice().reverse().map(s => (
                        <div key={s.month} className="flex items-center justify-between text-xs">
                          <span className="text-gray-500 dark:text-gray-400">{s.month}</span>
                          <span className="flex gap-3 text-gray-400">
                            <span className="text-gray-700 dark:text-gray-300 font-medium">{fmtK(s.followersCount)} seg.</span>
                            {s.postsCount != null && <span>{s.postsCount} posts</span>}
                            {s.engagementRate != null && <span className={engColor(s.engagementRate)}>{s.engagementRate}%</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {c.lastUpdated && (
                    <p className="text-[10px] text-gray-400 mt-2">Última actualización: {new Date(c.lastUpdated).toLocaleString('es-AR')}</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CompetitorsTab({ projectId, onSelectProject }) {
  const objectives = useObjectiveProgress(projectId).filter(o => o.metric === 'competidores')
  const [list,    setList]    = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [input,   setInput]   = useState('')
  const [adding,  setAdding]  = useState(false)

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true); setError(null)
    try {
      const { data } = await api.get(`/marketing/projects/${projectId}/competitors`, { params: { platform: 'instagram' } })
      setList(data)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al cargar competidores.')
    } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function handleAdd() {
    if (!input.trim()) { setError('Pegá el usuario o la URL del perfil.'); return }
    setAdding(true); setError(null)
    try {
      await api.post(`/marketing/projects/${projectId}/competitors`, { url: input.trim(), platform: 'instagram' })
      setInput('')
      load()
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo agregar el competidor.')
    } finally { setAdding(false) }
  }

  if (!projectId) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
        <div className="text-4xl mb-3">🏁</div>
        <p className="text-sm text-gray-500 dark:text-gray-400">Seleccioná un proyecto para trackear competidores.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Alta de competidor */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">🏁</span>
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Competidores de Instagram</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Seguí cuentas públicas de la competencia por scraping.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            placeholder="@competidor o https://instagram.com/competidor"
            className="flex-1 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !input.trim()}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity whitespace-nowrap"
          >
            {adding ? 'Agregando…' : 'Agregar'}
          </button>
        </div>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>

      {/* Objetivos de competidores del proyecto */}
      <ObjectiveProgressBars objectives={objectives} title="🎯 Objetivos vs competidores" />

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : list.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">Todavía no agregaste competidores. Pegá un usuario o URL arriba para empezar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {list.map(c => (
            <CompetitorCard key={c.id} projectId={projectId} c={c} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  )
}
