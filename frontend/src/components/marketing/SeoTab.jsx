import { useState, useEffect } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useGoogleIntegration } from '../../hooks/useGoogleIntegration'
import SetupHintCard from '../SetupHintCard'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtNum = n => (n ?? 0).toLocaleString('es-AR')
const fmtPct = n => `${((n ?? 0) * 100).toFixed(1)}%`
const fmtPos = n => n != null ? parseFloat(n).toFixed(1) : '—'

function currentMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function prevMonthStr(month) {
  const [y, m] = month.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return `${py}-${String(pm).padStart(2, '0')}`
}
function nextMonthStr(month) {
  const [y, m] = month.split('-').map(Number)
  const nm = m === 12 ? 1  : m + 1
  const ny = m === 12 ? y + 1 : y
  return `${ny}-${String(nm).padStart(2, '0')}`
}
function monthLabel(month) {
  const [y, m] = month.split('-').map(Number)
  const names = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${names[m - 1]} ${y}`
}

// ─── Domain Rating (Ahrefs) ───────────────────────────────────────────────────
// Banda de color por valor: ≥60 fuerte, ≥30 medio, <30 débil
function drBand(dr) {
  if (dr == null)  return { text: 'text-gray-400',                    bg: 'bg-gray-300 dark:bg-gray-600',   label: 'Sin datos' }
  if (dr >= 60)    return { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500', label: 'Fuerte' }
  if (dr >= 30)    return { text: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-400',   label: 'Medio'  }
  return                  { text: 'text-red-600 dark:text-red-400',         bg: 'bg-red-500',     label: 'Débil'  }
}

function fmtDateShort(d) {
  if (!d) return null
  try { return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return null }
}

// Card de Domain Rating con botón de refresh (vista de proyecto)
function DomainRatingCard({ projectId }) {
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error,      setError]      = useState(null)

  useEffect(() => {
    if (!projectId) return
    const ctrl = new AbortController()
    setLoading(true)
    api.get(`/marketing/projects/${projectId}/domain-rating`, { signal: ctrl.signal })
      .then(r => setData(r.data))
      .catch(err => { if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [projectId])

  async function refresh() {
    setRefreshing(true)
    setError(null)
    try {
      const { data: r } = await api.post(`/marketing/projects/${projectId}/domain-rating/refresh`)
      setData(d => ({ ...d, ...r }))
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo actualizar el Domain Rating.')
    } finally { setRefreshing(false) }
  }

  if (loading) return null

  // Sin URL configurada: no hay Domain Rating posible → invitación a completarla.
  if (data && !data.hasUrl) return (
    <SetupHintCard
      icon="🌐"
      label="Domain Rating no disponible"
      hint="Agregá la URL del sitio para medir el Domain Rating (autoridad del dominio según Ahrefs)."
      to={`/my-projects/${projectId}?infoTab=info`}
      ctaLabel="Agregar URL en Info →"
    />
  )

  const dr   = data?.domainRating
  const band = drBand(dr)

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Domain Rating</span>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold ${band.text}`}>{dr != null ? Math.round(dr) : '—'}</span>
              <span className="text-xs text-gray-400">/100 · {band.label}</span>
            </div>
          </div>
          <div className="hidden sm:block w-32">
            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
              <div className={`h-2 rounded-full ${band.bg}`} style={{ width: `${dr != null ? Math.min(dr, 100) : 0}%` }} />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Fuerza del perfil de backlinks (Ahrefs)</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={refresh}
            disabled={refreshing || !data?.hasUrl}
            title={!data?.hasUrl ? 'El proyecto no tiene URL configurada' : ''}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {refreshing ? 'Actualizando…' : 'Actualizar DR'}
          </button>
          {data?.domainRatingAt && (
            <span className="text-[10px] text-gray-400">Actualizado {fmtDateShort(data.domainRatingAt)}</span>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  )
}

// Lista cross-proyecto: todos los sitios ordenados por Domain Rating (vista sin proyecto)
function CrossProjectSeoPanel({ onSelectProject }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/marketing/summary/seo')
      .then(r => setData(r.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
  )
  if (!data?.length) return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
      <div className="text-4xl mb-3">🔍</div>
      <p className="text-sm text-gray-500 dark:text-gray-400">No hay sitios web cargados. Agregá la URL del sitio en la tab Info de un proyecto y seleccionalo para ver los datos de Search Console.</p>
    </div>
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
        Sitios por Domain Rating ({data.length}) <span className="font-normal text-gray-400">· Ahrefs</span>
      </h3>
      <div className="space-y-3">
        {data.map(p => {
          const band = drBand(p.domainRating)
          return (
            <div key={p.projectId} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <button
                    onClick={() => onSelectProject?.(String(p.projectId))}
                    className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
                  >
                    {p.projectName}
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className={`text-sm font-bold ${band.text}`}>{p.domainRating != null ? Math.round(p.domainRating) : '—'}</span>
                    <span className="text-xs text-gray-400">/100</span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${band.bg}`} style={{ width: `${p.domainRating != null ? Math.min(p.domainRating, 100) : 0}%` }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Barra de dispositivos ────────────────────────────────────────────────────
// Acepta tanto el array de GSC live [ {device, clicks} ]
// como el objeto de snapshot { DESKTOP:{clicks}, MOBILE:{clicks} }
function DeviceBar({ devices }) {
  if (!devices) return null

  let entries = []
  if (Array.isArray(devices)) {
    entries = devices.map(d => [d.device, { clicks: d.clicks }])
  } else {
    entries = Object.entries(devices)
  }
  if (!entries.length) return null

  const total = entries.reduce((s, [, v]) => s + (v.clicks ?? 0), 0) || 1
  const COLORS = { DESKTOP: 'bg-primary-500', MOBILE: 'bg-blue-500', TABLET: 'bg-purple-400' }
  const LABELS = { DESKTOP: 'Desktop', MOBILE: 'Mobile', TABLET: 'Tablet' }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Dispositivos</h3>
      <div className="flex rounded-full overflow-hidden h-3 mb-3">
        {entries.map(([device, v]) => (
          <div key={device}
            className={`${COLORS[device] ?? 'bg-gray-300'} transition-all`}
            style={{ width: `${((v.clicks ?? 0) / total) * 100}%` }}
            title={`${LABELS[device] ?? device}: ${fmtNum(v.clicks)} clicks`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {entries.map(([device, v]) => (
          <div key={device} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <span className={`w-2.5 h-2.5 rounded-full inline-block ${COLORS[device] ?? 'bg-gray-300'}`} />
            {LABELS[device] ?? device}
            <span className="font-medium text-gray-800 dark:text-gray-200">{fmtNum(v.clicks)}</span>
            <span className="text-gray-400">({(((v.clicks ?? 0) / total) * 100).toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Sparkline SVG ────────────────────────────────────────────────────────────
function Sparkline({ history }) {
  const points = history.filter(h => h.position !== null)
  if (points.length < 2) return <span className="text-xs text-gray-300 dark:text-gray-600">—</span>

  const positions = points.map(p => p.position)
  const min = Math.min(...positions)
  const max = Math.max(...positions)
  const range = max - min || 1
  const W = 60, H = 20

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W
    const y = ((p.position - min) / range) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const last  = points[points.length - 1].position
  const first = points[0].position
  const color = last < first ? '#22c55e' : last > first ? '#ef4444' : '#94a3b8'

  return (
    <svg width={W} height={H} className="overflow-visible inline-block align-middle">
      <polyline points={coords.join(' ')} fill="none" stroke={color}
        strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ─── Delta badge ──────────────────────────────────────────────────────────────
function DeltaBadge({ delta }) {
  if (delta == null || Math.abs(delta) < 0.5) return null
  const improved = delta < 0
  return (
    <span className={`ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
      improved ? 'text-green-600 bg-green-50 dark:bg-green-900/30'
               : 'text-red-500 bg-red-50 dark:bg-red-900/30'
    }`}>
      {improved ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}
    </span>
  )
}

// ─── Panel de error de Search Console (con acciones inline) ──────────────────
function GscErrorPanel({ error, loading, saving, siteUrlInput, setSiteUrlInput, onReconnect, onSaveSiteUrl }) {
  const code = error.code
  const type = error.type

  // Tipos donde mostramos botón de reconectar OAuth
  const canReconnect = ['no_integration', 'no_access', 'revoked', 'api_disabled'].includes(type)
  // Tipos donde mostramos opción de cambiar Site URL
  const canEditSiteUrl = ['no_access', 'bad_url', 'no_site_url'].includes(type)

  const title = {
    no_integration: 'Search Console no conectado',
    no_access:      'Sin acceso a esta propiedad',
    revoked:        'Token de Google expirado',
    bad_url:        'URL de sitio inválida',
    no_site_url:    'Falta configurar el Site URL',
    api_disabled:   'API de Search Console deshabilitada',
    generic:        'Error al cargar Search Console',
  }[type] ?? 'Error al cargar Search Console'

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="text-lg flex-shrink-0 mt-0.5">⚠️</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">{title}</p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">{error.msg}</p>
          {error.siteUrl && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Site URL probado: <span className="font-mono">{error.siteUrl}</span>
            </p>
          )}
        </div>
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap gap-2 pl-8">
        {canReconnect && (
          <button
            onClick={onReconnect}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {loading ? 'Conectando…' : type === 'no_integration' ? 'Conectar Search Console' : 'Reconectar con otra cuenta'}
          </button>
        )}
        {canEditSiteUrl && siteUrlInput === null && (
          <button
            onClick={() => setSiteUrlInput(error.siteUrl ?? '')}
            className="px-3 py-1.5 text-xs font-medium border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-200 rounded-lg transition-colors"
          >
            Cambiar Site URL
          </button>
        )}
      </div>

      {/* Input inline para Site URL */}
      {siteUrlInput !== null && (
        <div className="pl-8 space-y-2">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Probá una variante: con/sin <code className="font-mono">www</code>, con barra final, o como{' '}
            <code className="font-mono">sc-domain:ejemplo.com</code> (Domain property).
          </p>
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={siteUrlInput}
              onChange={e => setSiteUrlInput(e.target.value)}
              placeholder="https://ejemplo.com/ o sc-domain:ejemplo.com"
              className="flex-1 border border-amber-300 dark:border-amber-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
              onKeyDown={e => { if (e.key === 'Enter' && siteUrlInput.trim()) onSaveSiteUrl(siteUrlInput) }}
            />
            <button
              onClick={() => onSaveSiteUrl(siteUrlInput)}
              disabled={saving || !siteUrlInput.trim()}
              className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {saving ? '…' : 'Guardar'}
            </button>
            <button
              onClick={() => setSiteUrlInput(null)}
              className="px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300 hover:text-amber-900 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {code === 'TOKEN_EXPIRED' && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 pl-8">
          Si esto te pasa con frecuencia, verificá que la app OAuth de Google esté publicada (no en "Testing") — Google expira refresh tokens cada 7 días en modo Testing.
        </p>
      )}
    </div>
  )
}

// ─── Modal crear tarea ────────────────────────────────────────────────────────
function CreateTaskModal({ title, projectId, projectName, onClose }) {
  const { user }                      = useAuth()
  const [description, setDescription] = useState(`SEO - ${title}`)
  const [members, setMembers]         = useState([])
  const [assigneeId, setAssigneeId]   = useState('')
  const [saving, setSaving]           = useState(false)
  const [done, setDone]               = useState(false)

  useEffect(() => {
    api.get(`/projects/${projectId}/members`)
      .then(r => { setMembers(r.data); setAssigneeId(String(user?.id ?? '')) })
      .catch(() => {})
  }, [projectId, user])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!description.trim()) return
    setSaving(true)
    try {
      const body = { description: description.trim(), projectId: String(projectId) }
      if (assigneeId && assigneeId !== String(user?.id)) body.targetUserId = assigneeId
      await api.post('/tasks', body)
      setDone(true)
      setTimeout(onClose, 1200)
    } catch { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Crear tarea</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          Proyecto: <span className="font-medium text-gray-600 dark:text-gray-300">{projectName}</span>
        </p>
        {done ? (
          <div className="flex flex-col items-center py-6 gap-2">
            <span className="text-3xl">✅</span>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Tarea creada</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
              <textarea autoFocus rows={3} value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
            </div>
            {members.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Asignar a</label>
                <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  {members.map(m => (
                    <option key={m.id} value={String(m.id)}>
                      {m.name}{String(m.id) === String(user?.id) ? ' (yo)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={saving || !description.trim()}
                className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg py-2 text-sm font-medium transition-colors">
                {saving ? 'Guardando…' : 'Crear tarea'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Fila de query expandible ─────────────────────────────────────────────────
function QueryRow({ row, comparison, startDate, endDate, projectId }) {
  const [expanded, setExpanded] = useState(false)
  const [pages,    setPages]    = useState(null)
  const [loading,  setLoading]  = useState(false)

  async function toggle() {
    if (!expanded && pages === null) {
      setLoading(true)
      try {
        const { data } = await api.get(
          `/marketing/projects/${projectId}/search-console/query-pages`,
          { params: { query: row.query, startDate, endDate } }
        )
        setPages(data.pages)
      } catch { setPages([]) }
      finally { setLoading(false) }
    }
    setExpanded(e => !e)
  }

  const comp    = comparison?.find(c => c.query === row.query)
  const hasDrop = comp?.positionDelta != null && comp.positionDelta > 3
  const hasGain = comp?.positionDelta != null && comp.positionDelta < -3

  return (
    <>
      <tr onClick={toggle}
        className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer">
        <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">
          <span className="flex items-center gap-1.5">
            <span className="text-gray-400 text-[10px]">{expanded ? '▼' : '▶'}</span>
            {row.query}
          </span>
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-700 dark:text-gray-300">{fmtNum(row.clicks)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-700 dark:text-gray-300">{fmtNum(row.impressions)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-700 dark:text-gray-300">
          {fmtPos(row.position)}
          {hasDrop && <span className="ml-1.5 text-[10px] font-semibold text-red-500 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full">↓ {comp.positionDelta.toFixed(1)}</span>}
          {hasGain && <span className="ml-1.5 text-[10px] font-semibold text-green-600 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">↑ {Math.abs(comp.positionDelta).toFixed(1)}</span>}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-sm text-gray-700 dark:text-gray-300">{fmtPct(row.ctr)}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-700/20">
          <td colSpan={5} className="px-6 py-3">
            {loading
              ? <div className="flex items-center gap-2 text-xs text-gray-400"><div className="w-3 h-3 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />Cargando páginas…</div>
              : pages?.length > 0
              ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="text-left pb-1 font-medium">Página</th>
                      <th className="text-right pb-1 font-medium w-16">Clicks</th>
                      <th className="text-right pb-1 font-medium w-16">Pos.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pages.map((p, i) => (
                      <tr key={i}>
                        <td className="pr-4 py-1 text-primary-600 dark:text-primary-400 font-mono truncate max-w-[280px]">{p.page}</td>
                        <td className="py-1 text-right tabular-nums text-gray-600 dark:text-gray-400">{fmtNum(p.clicks)}</td>
                        <td className="py-1 text-right tabular-nums text-gray-600 dark:text-gray-400">{fmtPos(p.position)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
              : <p className="text-xs text-gray-400">Sin datos de páginas para esta query.</p>
            }
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function SeoTab({ projectId, projects, onSelectProject }) {
  const projectName = projects?.find(p => p.id === projectId)?.name ?? ''

  // Modo: 'live' | 'YYYY-MM'
  const [mode,       setMode]       = useState('live')
  const [snapMonth,  setSnapMonth]  = useState(prevMonthStr(currentMonthStr()))

  // Live data
  const [liveData,    setLiveData]    = useState(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError,   setLiveError]   = useState(null)

  // Integraciones Google — hook compartido para reconectar/editar Site URL inline
  const {
    connect: connectGoogle,
    savePropertyId,
    loading: integLoading,
    propSaving: integSaving,
  } = useGoogleIntegration(projectId, { enabled: true })

  // Reload trigger — incrementar para refetch de Search Console tras reconectar/cambiar Site URL
  const [reloadTick, setReloadTick] = useState(0)
  const [siteUrlInput, setSiteUrlInput] = useState(null)  // null = oculto, string = mostrando input

  // Snapshot data
  const [snap,       setSnap]       = useState(null)
  const [snapLoad,   setSnapLoad]   = useState(false)
  const [snapNotFound, setSnapNotFound] = useState(false)
  const [saving,     setSaving]     = useState(false)

  // AI insights
  const [aiData,     setAiData]     = useState(null)
  const [aiLoading,  setAiLoading]  = useState(false)
  const [aiError,    setAiError]    = useState(null)
  const [aiCooldown, setAiCooldown] = useState(0)

  // Keywords history (sparklines) — siempre
  const [kwHistory,  setKwHistory]  = useState(null)

  // Tarea modal
  const [taskModal,  setTaskModal]  = useState(null)

  const today = new Date()
  const liveEnd   = today.toISOString().slice(0, 10)
  const liveStart = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate()).toISOString().slice(0, 10)

  // ── Fetch live data ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return
    const ctrl = new AbortController()
    setLiveLoading(true)
    setLiveError(null)
    setLiveData(null)
    api.get(`/marketing/projects/${projectId}/search-console`, {
      params: { startDate: liveStart, endDate: liveEnd, compare: 'true' },
      signal: ctrl.signal,
    })
      .then(r => setLiveData(r.data))
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return
        const data = err.response?.data ?? {}
        const status = data.status
        const code   = data.code
        const knownTypes = ['no_site_url', 'no_integration', 'no_access', 'revoked', 'bad_url', 'api_disabled']
        setLiveError({
          type: knownTypes.includes(status) ? status : 'generic',
          code,
          siteUrl: data.siteUrl ?? null,
          msg: data.error ?? 'Error al cargar datos de Search Console.',
        })
      })
      .finally(() => setLiveLoading(false))
    return () => ctrl.abort()
  }, [projectId, reloadTick])

  // ── Fetch AI insights ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return
    const ctrl = new AbortController()
    api.get(`/marketing/projects/${projectId}/seo/ai-insights`, { signal: ctrl.signal })
      .then(r => { setAiData(r.data.insight); setAiCooldown(r.data.cooldownRemaining ?? 0) })
      .catch(err => { if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return })
    return () => ctrl.abort()
  }, [projectId])

  // ── Fetch snapshot cuando cambia mes ─────────────────────────────────────────
  useEffect(() => {
    if (!projectId || mode === 'live') return
    const ctrl = new AbortController()
    setSnapLoad(true)
    setSnap(null)
    setSnapNotFound(false)
    api.get(`/marketing/projects/${projectId}/seo/snapshot/${snapMonth}`, { signal: ctrl.signal })
      .then(r => setSnap(r.data))
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return
        if (err.response?.status === 404) setSnapNotFound(true)
      })
      .finally(() => setSnapLoad(false))
    return () => ctrl.abort()
  }, [projectId, snapMonth, mode])

  // ── Fetch keyword history (sparklines) ───────────────────────────────────────
  useEffect(() => {
    if (!projectId) return
    const ctrl = new AbortController()
    api.get(`/marketing/projects/${projectId}/keywords/history-batch`, {
      params: { months: 6 }, signal: ctrl.signal,
    })
      .then(r => setKwHistory(r.data))
      .catch(err => { if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return })
    return () => ctrl.abort()
  }, [projectId])

  async function generateAiInsights() {
    setAiLoading(true)
    setAiError(null)
    try {
      const { data: r } = await api.post(`/marketing/projects/${projectId}/seo/ai-insights`)
      setAiData(r.insight)
      setAiCooldown(r.cooldownRemaining ?? 60)
    } catch (err) {
      const d = err.response?.data
      if (d?.waitMins) { setAiCooldown(d.waitMins); setAiError(`Esperá ${d.waitMins} min antes de regenerar.`) }
      else setAiError(d?.error ?? 'Error al generar análisis')
    } finally { setAiLoading(false) }
  }

  async function handleSaveSnapshot() {
    setSaving(true)
    try {
      const { data } = await api.post(`/marketing/projects/${projectId}/seo/snapshots`, { month: snapMonth })
      setSnap(data)
      setSnapNotFound(false)
    } catch (err) {
      alert(err.response?.data?.error ?? 'No se pudo guardar el snapshot')
    } finally { setSaving(false) }
  }

  // ── Helpers de snapshot ───────────────────────────────────────────────────────
  const snapDevices = snap?.devices
    ? (typeof snap.devices === 'string' ? JSON.parse(snap.devices) : snap.devices)
    : null

  const impactColor = { alto: 'text-red-500', medio: 'text-orange-500', bajo: 'text-blue-500' }

  if (!projectId) {
    return <CrossProjectSeoPanel onSelectProject={onSelectProject} />
  }

  const isLive = mode === 'live'

  // ── KPIs a mostrar ────────────────────────────────────────────────────────────
  const kpis = isLive
    ? liveData?.overview
      ? [
          { label: 'Clicks',         value: fmtNum(liveData.overview.clicks)       },
          { label: 'Impresiones',    value: fmtNum(liveData.overview.impressions)  },
          { label: 'CTR promedio',   value: fmtPct(liveData.overview.ctr)          },
          { label: 'Posición media', value: fmtPos(liveData.overview.position), sub: 'más bajo = mejor' },
        ]
      : null
    : snap
      ? [
          { label: 'Clicks',         value: fmtNum(snap.clicks)       },
          { label: 'Impresiones',    value: fmtNum(snap.impressions)  },
          { label: 'CTR promedio',   value: fmtPct(snap.ctr)          },
          { label: 'Posición media', value: fmtPos(snap.avgPosition), sub: 'más bajo = mejor' },
        ]
      : null

  const devicesData = isLive ? liveData?.devices : snapDevices

  return (
    <div className="space-y-4">

      {/* ── Selector de modo ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden text-sm">
          <button
            onClick={() => setMode('live')}
            className={`px-4 py-2 transition-colors ${
              isLive
                ? 'bg-primary-600 text-white font-medium'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            En vivo · 30 días
          </button>
          <button
            onClick={() => setMode('month')}
            className={`px-4 py-2 transition-colors ${
              !isLive
                ? 'bg-primary-600 text-white font-medium'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Historial
          </button>
        </div>

        {/* Selector de mes (visible solo en modo historial) */}
        {!isLive && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSnapMonth(m => prevMonthStr(m))}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors text-xs"
            >◀</button>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[80px] text-center">
              {monthLabel(snapMonth)}
            </span>
            <button
              onClick={() => setSnapMonth(m => nextMonthStr(m))}
              disabled={snapMonth >= currentMonthStr()}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
            >▶</button>
          </div>
        )}
      </div>

      {/* ── Domain Rating (Ahrefs) — independiente de GSC ────────────────────── */}
      <DomainRatingCard projectId={projectId} />

      {/* ── Error (modo live) ────────────────────────────────────────────────── */}
      {isLive && liveError && (
        <GscErrorPanel
          error={liveError}
          loading={integLoading.google_search_console}
          saving={integSaving.google_search_console}
          siteUrlInput={siteUrlInput}
          setSiteUrlInput={setSiteUrlInput}
          onReconnect={async () => {
            const res = await connectGoogle('google_search_console', { forceOAuth: true })
            if (res?.ok) setReloadTick(t => t + 1)
          }}
          onSaveSiteUrl={async value => {
            const res = await savePropertyId('google_search_console', value.trim())
            if (res?.ok) {
              setSiteUrlInput(null)
              setReloadTick(t => t + 1)
            }
            return res
          }}
        />
      )}

      {/* ── Loading ──────────────────────────────────────────────────────────── */}
      {((isLive && liveLoading) || (!isLive && snapLoad)) && (
        <div className="flex items-center justify-center py-12">
          <div className="w-7 h-7 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Snapshot no encontrado ───────────────────────────────────────────── */}
      {!isLive && snapNotFound && !snapLoad && (
        <div className="bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            No hay snapshot guardado para <strong>{monthLabel(snapMonth)}</strong>
          </p>
          <button onClick={handleSaveSnapshot} disabled={saving}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors">
            {saving ? 'Guardando…' : 'Guardar snapshot ahora'}
          </button>
          <p className="text-xs text-gray-400 mt-2">Requiere Google Search Console conectado y activo</p>
        </div>
      )}

      {/* ── Contenido principal ──────────────────────────────────────────────── */}
      {kpis && !liveLoading && !snapLoad && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {kpis.map(k => (
              <div key={k.label} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{k.label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{k.value}</p>
                {k.sub && <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>}
              </div>
            ))}
          </div>

          {/* Dispositivos */}
          {devicesData && <DeviceBar devices={devicesData} />}

          {/* ── Contenido exclusivo del modo live ──────────────────────────── */}
          {isLive && liveData && (
            <>
              {/* AI Insights */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Sugerencias IA</h3>
                  <button onClick={generateAiInsights} disabled={aiLoading || aiCooldown > 0}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed">
                    {aiLoading ? 'Generando…' : aiCooldown > 0 ? `Disponible en ${aiCooldown} min` : aiData ? 'Regenerar' : 'Generar análisis IA'}
                  </button>
                </div>
                {aiError && <p className="text-xs text-orange-500 mb-3">{aiError}</p>}
                {!aiData && !aiLoading && (
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    Generá un análisis IA para obtener sugerencias accionables basadas en tus datos de Search Console.
                  </p>
                )}
                {aiLoading && (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                    <div className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                    Analizando datos con IA…
                  </div>
                )}
                {aiData && !aiLoading && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{aiData.titulo}</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{aiData.resumen}</p>
                    </div>
                    {aiData.oportunidades?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Oportunidades</p>
                        <div className="space-y-2">
                          {aiData.oportunidades.map((op, i) => (
                            <div key={i} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-700/40 rounded-lg p-3">
                              <span className={`text-xs font-bold mt-0.5 ${impactColor[op.impacto] ?? 'text-gray-500'}`}>
                                {op.impacto?.toUpperCase()}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">{op.pagina}</p>
                                <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{op.accion}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{op.razon}</p>
                              </div>
                              <button onClick={() => setTaskModal({ title: op.accion })}
                                className="flex-shrink-0 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-gray-200 dark:border-gray-600 hover:border-primary-400 rounded-lg px-2 py-0.5 transition-all">
                                + tarea
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {aiData.quickWins?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Quick wins</p>
                        <div className="space-y-2">
                          {aiData.quickWins.map((qw, i) => (
                            <div key={i} className="flex items-start gap-3 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/40 rounded-lg p-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{qw.titulo}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{qw.descripcion}</p>
                              </div>
                              <button onClick={() => setTaskModal({ title: qw.tarea })}
                                className="flex-shrink-0 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-gray-200 dark:border-gray-600 hover:border-primary-400 rounded-lg px-2 py-0.5 transition-all">
                                + tarea
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Top consultas */}
              {liveData.topQueries?.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top consultas</h3>
                    <span className="text-[10px] text-gray-400">Click en una fila para ver páginas</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700">
                          {['Consulta', 'Clicks', 'Impres.', 'Posición', 'CTR'].map((h, i) => (
                            <th key={h} className={`px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 ${i > 0 ? 'text-right' : 'text-left'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {liveData.topQueries.map((row, i) => (
                          <QueryRow key={i} row={row} comparison={liveData.topQueriesComparison}
                            startDate={liveStart} endDate={liveEnd} projectId={projectId} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Oportunidades de CTR */}
              {liveData.opportunityPages?.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Oportunidades de CTR</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Páginas con muchas impresiones y CTR bajo (&lt;5%)</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700">
                          {['Página', 'Impresiones', 'CTR actual', 'Posición', ''].map((h, i) => (
                            <th key={i} className={`px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {liveData.opportunityPages.map((row, i) => (
                          <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                            <td className="px-4 py-2.5 font-mono text-xs text-gray-700 dark:text-gray-300 max-w-[200px] truncate">{row.page}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtNum(row.impressions)}</td>
                            <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${row.ctr < 0.03 ? 'text-red-500' : 'text-orange-500'}`}>{fmtPct(row.ctr)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{fmtPos(row.position)}</td>
                            <td className="px-4 py-2.5 text-right">
                              <button onClick={() => setTaskModal({ title: `Mejorar title/meta de ${row.page}` })}
                                className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-gray-200 dark:border-gray-600 hover:border-primary-400 rounded-lg px-2 py-0.5 transition-all">
                                + tarea
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Top páginas */}
              {liveData.topPages?.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top páginas</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700">
                          {['Página', 'Clicks', 'Impres.', 'CTR', 'Posición'].map((h, i) => (
                            <th key={h} className={`px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {liveData.topPages.map((row, i) => (
                          <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                            <td className="px-4 py-2.5 font-mono text-xs text-gray-700 dark:text-gray-300 max-w-[220px] truncate">{row.page}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtNum(row.clicks)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtNum(row.impressions)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtPct(row.ctr)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtPos(row.position)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Top países */}
              {liveData.countries?.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top países</h3>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {liveData.countries.map((row, i) => (
                        <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                          <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 uppercase text-xs font-medium">{row.country}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-400">{fmtNum(row.clicks)} clicks</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{fmtNum(row.impressions)} impres.</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {liveData.siteUrl && (
                <p className="text-xs text-gray-400 text-right">
                  Sitio: <span className="font-mono">{liveData.siteUrl}</span>
                  {' · '}{liveStart} → {liveEnd}
                </p>
              )}
            </>
          )}

          {/* ── Botón actualizar snapshot (modo historial) ───────────────────── */}
          {!isLive && snap && (
            <div className="flex justify-end">
              <button onClick={handleSaveSnapshot} disabled={saving}
                className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-gray-200 dark:border-gray-600 hover:border-primary-400 rounded-lg px-3 py-1.5 transition-all disabled:opacity-50">
                {saving ? 'Actualizando…' : 'Actualizar snapshot'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Keywords con sparklines (siempre visibles) ───────────────────────── */}
      {kwHistory?.keywords?.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Keywords trackeadas</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Posición mensual — últimos {kwHistory.months?.length ?? 6} meses
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-left">Keyword</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Posición actual</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">vs mes ant.</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Tendencia</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {kwHistory.keywords.map(kw => {
                  const last  = kw.history[kw.history.length - 1]
                  const prev  = kw.history[kw.history.length - 2]
                  const delta = last?.position != null && prev?.position != null
                    ? parseFloat((prev.position - last.position).toFixed(2))
                    : null
                  return (
                    <tr key={kw.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-[180px] truncate font-medium">{kw.query}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {last?.position != null ? parseFloat(last.position).toFixed(1) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {delta != null
                          ? <DeltaBadge delta={-delta} />
                          : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right"><Sparkline history={kw.history} /></td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500">{fmtNum(last?.clicks ?? 0)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal tarea */}
      {taskModal && (
        <CreateTaskModal title={taskModal.title} projectId={projectId}
          projectName={projectName} onClose={() => setTaskModal(null)} />
      )}
    </div>
  )
}
