import { useState, useEffect } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'

function CreateTaskModal({ title, projectId, projectName, onClose }) {
  const { user } = useAuth()
  const [description, setDescription] = useState(`Analytics - ${title}`)
  const [members,     setMembers]     = useState([])
  const [assigneeId,  setAssigneeId]  = useState('')
  const [saving,      setSaving]      = useState(false)
  const [done,        setDone]        = useState(false)

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
        <p className="text-xs text-gray-400 mb-4">
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
              <textarea
                autoFocus
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>
            {members.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Asignar a</label>
                <select
                  value={assigneeId}
                  onChange={e => setAssigneeId(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
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

const PRESET_RANGES = [
  { value: 'thisMonth',  label: 'Este mes' },
  { value: 'lastMonth',  label: 'Mes anterior' },
  { value: '90daysAgo',  label: 'Últimos 90 días' },
  { value: 'custom',     label: 'Personalizado' },
]

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function getDateParams(range, customStart, customEnd) {
  const now       = new Date()
  const year      = now.getFullYear()
  const month     = now.getMonth() // 0-indexed

  if (range === 'thisMonth') {
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`
    return { startDate: start, endDate: todayStr() }
  }
  if (range === 'lastMonth') {
    const lm     = month === 0 ? 11 : month - 1
    const lmYear = month === 0 ? year - 1 : year
    const lastDay = new Date(lmYear, lm + 1, 0).getDate()
    const pad = n => String(n).padStart(2, '0')
    return {
      startDate: `${lmYear}-${pad(lm + 1)}-01`,
      endDate:   `${lmYear}-${pad(lm + 1)}-${pad(lastDay)}`,
    }
  }
  if (range === '90daysAgo') {
    return { startDate: '90daysAgo', endDate: 'today' }
  }
  // custom
  return { startDate: customStart || todayStr(), endDate: customEnd || todayStr() }
}

function formatDateLabel(range, customStart, customEnd) {
  const { startDate, endDate } = getDateParams(range, customStart, customEnd)
  if (range === 'thisMonth')  return 'Este mes'
  if (range === 'lastMonth')  return 'Mes anterior'
  if (range === '90daysAgo')  return 'Últimos 90 días'
  const fmt = d => {
    if (!d || d === 'today' || d === 'yesterday') return d
    const [y, m, dd] = d.split('-')
    return `${dd}/${m}/${y}`
  }
  return `${fmt(startDate)} → ${fmt(endDate)}`
}

const DEVICE_ICONS = { desktop: '🖥️', mobile: '📱', tablet: '📲' }
const CHANNEL_COLORS = [
  'bg-primary-500', 'bg-blue-500', 'bg-green-500',
  'bg-purple-500',  'bg-yellow-500', 'bg-pink-500',
  'bg-indigo-500',  'bg-teal-500',
]

function fmt(n, decimals = 0) {
  if (n == null || n === '' || isNaN(n)) return '—'
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: decimals })
}
function fmtDuration(seconds) {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${String(s).padStart(2, '0')}s`
}
function pct(value, total) {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

function MetricCard({ label, value, icon, sub, highlight, delta, deltaPositivo }) {
  const hasDelta = delta != null && delta !== 0
  return (
    <div className={`rounded-xl p-4 ${highlight
      ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800'
      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'}`
    }>
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        {icon && <span className="text-base">{icon}</span>}
      </div>
      <p className={`text-2xl font-bold ${highlight
        ? 'text-primary-700 dark:text-primary-300'
        : 'text-gray-900 dark:text-white'}`}
      >
        {value ?? '—'}
      </p>
      <div className="flex items-center gap-2 mt-1">
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
        {hasDelta && (
          <span className={`text-xs font-medium ${deltaColor(delta, deltaPositivo)}`}>
            {deltaIcon(delta, deltaPositivo)} {Math.abs(delta)}%
          </span>
        )}
      </div>
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
      {children}
    </h3>
  )
}

const CONVERSION_RECOMMENDATIONS = [
  {
    event:    'generate_lead',
    label:    'Formulario de contacto',
    desc:     'Marcá el envío de formularios como conversión. Es el más valioso para negocios de servicios.',
    priority: 'alta',
  },
  {
    event:    'purchase',
    label:    'Compra / Transacción',
    desc:     'Si tenés e-commerce, activá el seguimiento de compras con el parámetro value.',
    priority: 'alta',
  },
  {
    event:    'click',
    label:    'Click en WhatsApp o teléfono',
    desc:     'Trackeá clicks en el botón de WhatsApp o en el número de teléfono.',
    priority: 'alta',
  },
  {
    event:    'file_download',
    label:    'Descarga de catálogo o PDF',
    desc:     'Si ofrecés material descargable, cada descarga es una señal de interés.',
    priority: 'media',
  },
  {
    event:    'scroll',
    label:    'Scroll al 90%',
    desc:     'Usuarios que leyeron casi toda la página. Activalo en GA4 desde Medición mejorada.',
    priority: 'media',
  },
  {
    event:    'view_item',
    label:    'Vista de producto o servicio clave',
    desc:     'Marcá como conversión cuando alguien llega a una página de servicio o producto específico.',
    priority: 'baja',
  },
]

const PRIORITY_STYLES = {
  alta:  'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  media: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  baja:  'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
}

function ConversionsBlock({ conversions, sessions }) {
  if (!conversions) return null

  if (conversions.hasConversions) {
    const topRate = conversions.events[0]?.conversionRate
    return (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <SectionTitle>Conversiones</SectionTitle>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-green-700 dark:text-green-300">
                {fmt(conversions.total)}
              </span>
              <span className="text-sm text-green-600 dark:text-green-400">
                conversiones totales
              </span>
            </div>
            {sessions > 0 && (
              <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                Tasa global: {fmt((conversions.total / sessions) * 100, 2)}% de las sesiones
              </p>
            )}
          </div>
          <span className="text-3xl">🎯</span>
        </div>

        <div className="space-y-2">
          {conversions.events.map((ev, i) => {
            const maxConv = conversions.events[0]?.conversions || 1
            const p = Math.round((ev.conversions / maxConv) * 100)
            return (
              <div key={i}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-mono text-gray-700 dark:text-gray-300">{ev.eventName}</span>
                  <span className="text-gray-500 tabular-nums">
                    {fmt(ev.conversions)}
                  </span>
                </div>
                <div className="h-1.5 bg-green-100 dark:bg-green-900/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${p}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Sin conversiones → recomendaciones
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-start justify-between mb-1">
        <SectionTitle>Conversiones</SectionTitle>
        <span className="text-2xl">🎯</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        No hay conversiones configuradas en este período. Las conversiones te permiten medir acciones
        clave de tus visitantes. Estas son las más recomendadas:
      </p>
      <div className="space-y-3">
        {CONVERSION_RECOMMENDATIONS.map((rec, i) => (
          <div key={i} className="flex gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                  {rec.label}
                </span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${PRIORITY_STYLES[rec.priority]}`}>
                  {rec.priority}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{rec.desc}</p>
              <p className="text-[11px] font-mono text-gray-400 mt-1">{rec.event}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-4">
        Para configurarlas: Google Analytics → Administrar → Eventos → marcar como conversión.
      </p>
    </div>
  )
}

function currentMonthStr() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}
function prevMonthStr(month) {
  const [y, m] = month.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return `${py}-${String(pm).padStart(2, '0')}`
}
// Mes que representa la selección actual (solo para opciones mensuales)
function getActiveMonth(preset) {
  if (preset === 'thisMonth') return currentMonthStr()
  if (preset === 'lastMonth') return prevMonthStr(currentMonthStr())
  return null
}
function deltaColor(delta, positivo) {
  if (delta == null) return 'text-gray-400'
  return positivo ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
}
function deltaIcon(delta, positivo) {
  if (delta == null || delta === 0) return '—'
  const up = delta > 0
  return up ? '▲' : '▼'
}

// ─── Helpers de PageSpeed ─────────────────────────────────────────────────────

const PS_SCORE_COLOR = score => {
  if (score == null) return 'text-gray-400'
  if (score >= 90)   return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 50)   return 'text-amber-500 dark:text-amber-400'
  return 'text-red-500 dark:text-red-400'
}
const PS_SCORE_BG = score => {
  if (score == null) return 'bg-gray-100 dark:bg-gray-700'
  if (score >= 90)   return 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
  if (score >= 50)   return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
  return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
}
const RATING_DOT = rating => {
  if (rating === 'good')             return 'bg-emerald-500'
  if (rating === 'needs-improvement') return 'bg-amber-400'
  return 'bg-red-500'
}
const METRIC_LABELS = {
  lcp:  { label: 'LCP',  title: 'Largest Contentful Paint' },
  fcp:  { label: 'FCP',  title: 'First Contentful Paint' },
  tbt:  { label: 'TBT',  title: 'Total Blocking Time' },
  cls:  { label: 'CLS',  title: 'Cumulative Layout Shift' },
  si:   { label: 'SI',   title: 'Speed Index' },
  ttfb: { label: 'TTFB', title: 'Time to First Byte' },
}

function PageSpeedSection({ websiteUrl, strategy, onStrategyChange, result, history, running, onRun, projectId, projectName }) {
  const metrics       = result?.metrics       ?? {}
  const opportunities = result?.opportunities ?? []
  const diagnostics   = result?.diagnostics   ?? []
  const score         = result?.performanceScore
  const [taskModal, setTaskModal] = useState(null)

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 space-y-5">

      {/* Cabecera */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            🚀 Performance
          </h3>
          {websiteUrl && (
            <p className="text-xs text-gray-400 mt-0.5 font-mono truncate max-w-[240px]">
              {websiteUrl}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle mobile/desktop */}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden text-xs">
            {['mobile', 'desktop'].map(s => (
              <button
                key={s}
                onClick={() => onStrategyChange(s)}
                className={`px-3 py-1.5 capitalize transition-colors ${
                  strategy === s
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {s === 'mobile' ? '📱' : '🖥️'} {s}
              </button>
            ))}
          </div>
          <button
            onClick={onRun}
            disabled={running}
            className="px-3 py-1.5 text-xs bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center gap-1.5"
          >
            {running
              ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Analizando…</>
              : '▶ Analizar'}
          </button>
        </div>
      </div>

      {/* Historial de scores */}
      {history.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">Historial:</span>
          {history.map((h, i) => (
            <span
              key={h.id}
              title={new Date(h.createdAt).toLocaleString('es-AR')}
              className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                i === 0 ? 'ring-2 ring-primary-400' : 'opacity-60'
              } ${PS_SCORE_BG(h.performanceScore)}`}
            >
              <span className={PS_SCORE_COLOR(h.performanceScore)}>{h.performanceScore ?? '?'}</span>
            </span>
          ))}
        </div>
      )}

      {/* Loading */}
      {running && !result && (
        <div className="flex items-center gap-3 text-sm text-gray-400 py-4">
          <div className="w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          Analizando performance con PageSpeed Insights… puede tardar hasta 30 segundos.
        </div>
      )}

      {/* Resultado */}
      {result && result.status === 'done' && (
        <>
          {/* Score + métricas */}
          <div className="flex flex-wrap gap-4 items-start">
            {/* Score grande */}
            <div className={`flex-shrink-0 rounded-2xl border p-5 text-center min-w-[110px] ${PS_SCORE_BG(score)}`}>
              <p className={`text-5xl font-black leading-none ${PS_SCORE_COLOR(score)}`}>
                {score ?? '—'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Performance</p>
              <p className="text-[10px] text-gray-400 capitalize mt-0.5">{result.strategy}</p>
            </div>

            {/* Métricas CWV */}
            <div className="flex-1 min-w-[220px] grid grid-cols-2 gap-2">
              {Object.entries(METRIC_LABELS).map(([key, { label, title }]) => {
                const m = metrics[key]
                if (!m) return null
                return (
                  <div key={key} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl px-3 py-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${RATING_DOT(m.rating)}`} />
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400 font-medium" title={title}>{label}</p>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                        {m.displayValue ?? '—'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Leyenda de colores */}
          <div className="flex items-center gap-4 text-[11px] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Bueno</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Mejorar</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Crítico</span>
          </div>

          {/* Oportunidades + Diagnósticos */}
          {(opportunities.length > 0 || diagnostics.length > 0) && (
            <div className="space-y-4">
              {opportunities.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Oportunidades de mejora
                  </p>
                  <div className="space-y-2">
                    {opportunities.map((op, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{op.title}</p>
                          {op.description && (
                            <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{op.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {op.savingsMs > 0 && (
                            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                              ~{op.savingsMs >= 1000 ? `${(op.savingsMs / 1000).toFixed(1)}s` : `${op.savingsMs}ms`}
                            </span>
                          )}
                          <button
                            onClick={() => setTaskModal({ title: op.title })}
                            title="Crear tarea"
                            className="flex-shrink-0 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-gray-200 dark:border-gray-600 hover:border-primary-400 rounded-lg px-2 py-0.5 transition-all"
                          >
                            + tarea
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {diagnostics.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Diagnósticos
                  </p>
                  <div className="space-y-2">
                    {diagnostics.map((d, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{d.title}</p>
                          {d.description && (
                            <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{d.description}</p>
                          )}
                        </div>
                        <button
                          onClick={() => setTaskModal({ title: d.title })}
                          title="Crear tarea"
                          className="flex-shrink-0 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-gray-200 dark:border-gray-600 hover:border-primary-400 rounded-lg px-2 py-0.5 transition-all"
                        >
                          + tarea
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="text-[11px] text-gray-400 text-right">
            Analizado: {new Date(result.createdAt).toLocaleString('es-AR')}
          </p>
        </>
      )}

      {result?.status === 'error' && (
        <p className="text-sm text-red-500">{result.errorMsg || 'Error al analizar'}</p>
      )}

      {!result && !running && (
        <p className="text-xs text-gray-400">
          Hacé click en "Analizar" para obtener el score de performance, métricas Core Web Vitals y oportunidades de mejora de {websiteUrl || 'la URL del proyecto'}.
        </p>
      )}

      {taskModal && (
        <CreateTaskModal
          title={taskModal.title}
          projectId={projectId}
          projectName={projectName}
          onClose={() => setTaskModal(null)}
        />
      )}
    </div>
  )
}

const SOURCE_COLORS = {
  google:    'bg-blue-500',
  facebook:  'bg-blue-700',
  instagram: 'bg-pink-500',
  email:     'bg-orange-500',
  direct:    'bg-gray-400',
  cpc:       'bg-purple-500',
  organic:   'bg-green-500',
}
function sourceColor(source, medium) {
  if (medium === 'organic' || medium === 'organic search') return SOURCE_COLORS.organic
  if (medium === 'cpc' || medium === 'ppc')                 return SOURCE_COLORS.cpc
  if (medium === 'email')                                   return SOURCE_COLORS.email
  if (source === '(direct)')                                return SOURCE_COLORS.direct
  const key = source?.toLowerCase()
  return SOURCE_COLORS[key] ?? 'bg-indigo-400'
}

export default function WebTab({ subtab = 'analytics', projectId, projects }) {
  const [rangePreset,  setRangePreset]  = useState('thisMonth')
  const [customStart,  setCustomStart]  = useState(todayStr())
  const [customEnd,    setCustomEnd]    = useState(todayStr())
  const [appliedRange, setAppliedRange] = useState({ preset: 'thisMonth', start: '', end: '' })
  const [compare,      setCompare]      = useState(true)
  const [analytics,    setAnalytics]    = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [errorStatus,  setErrorStatus]  = useState(null)
  const [error,        setError]        = useState('')

  // Snapshot del mes anterior (para deltas)
  const [prevSnap,     setPrevSnap]     = useState(null)

  // Insight IA
  const [insight,      setInsight]      = useState(null)
  const [insightLoading, setInsightLoading] = useState(false)
  const [savingSnap,   setSavingSnap]   = useState(false)
  const [snapSaved,    setSnapSaved]    = useState(false)

  // Modal crear tarea desde recomendación IA
  const [taskModal,    setTaskModal]    = useState(null) // { title }

  // PageSpeed
  const [psStrategy,   setPsStrategy]   = useState('mobile')
  const [psResult,     setPsResult]     = useState(null)   // último resultado done
  const [psHistory,    setPsHistory]    = useState([])     // historial de scores
  const [psRunning,    setPsRunning]    = useState(false)
  const [psPollId,     setPsPollId]     = useState(null)

  function handlePresetChange(val) {
    setRangePreset(val)
    if (val !== 'custom') setAppliedRange({ preset: val, start: '', end: '' })
  }

  function handleApplyCustom() {
    if (!customStart || !customEnd || customStart > customEnd) return
    setAppliedRange({ preset: 'custom', start: customStart, end: customEnd })
  }

  // Fetch principal: analytics en tiempo real
  useEffect(() => {
    if (!projectId) return
    const { startDate, endDate } = getDateParams(appliedRange.preset, appliedRange.start, appliedRange.end)
    setLoading(true)
    setError('')
    setErrorStatus(null)
    setAnalytics(null)
    setPrevSnap(null)
    setInsight(null)
    setSnapSaved(false)

    const isMonthlyPreset = appliedRange.preset === 'thisMonth' || appliedRange.preset === 'lastMonth'
    const useCompare = compare && isMonthlyPreset
    api.get(`/marketing/projects/${projectId}/analytics?startDate=${startDate}&endDate=${endDate}&compare=${useCompare}`)
      .then(r => setAnalytics(r.data))
      .catch(e => {
        const status = e.response?.status
        const body   = e.response?.data
        if (status === 404)                                              setErrorStatus('no_integration')
        else if (body?.status === 'no_property')                        setErrorStatus('no_property')
        else if (body?.code === 'TOKEN_EXPIRED' || body?.status === 'revoked' || body?.status === 'error') setErrorStatus('revoked')
        else setError(body?.error || 'Error al cargar datos')
      })
      .finally(() => setLoading(false))
  }, [projectId, appliedRange])

  // Cuando hay analytics y el período es mensual: cargar snapshot anterior + insight
  useEffect(() => {
    if (!analytics || !projectId) return
    const activeMonth = getActiveMonth(appliedRange.preset)
    if (!activeMonth) return

    const compMonth = prevMonthStr(activeMonth)

    // Snapshot del mes anterior para deltas
    api.get(`/marketing/projects/${projectId}/snapshots?month=${compMonth}`)
      .then(r => setPrevSnap(r.data))
      .catch(() => setPrevSnap(null))

    // Insight IA existente
    api.get(`/marketing/projects/${projectId}/insights/${activeMonth}`)
      .then(r => setInsight(r.data))
      .catch(() => setInsight(null))
  }, [analytics, projectId, appliedRange])

  // Cargar último resultado PageSpeed + historial cuando cambia proyecto o estrategia
  useEffect(() => {
    if (!projectId) return
    setPsResult(null)
    setPsHistory([])
    api.get(`/marketing/projects/${projectId}/pagespeed?strategy=${psStrategy}&limit=6`)
      .then(r => {
        setPsHistory(r.data)
        if (r.data.length > 0) {
          api.get(`/marketing/projects/${projectId}/pagespeed/${r.data[0].id}`)
            .then(r2 => setPsResult(r2.data))
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [projectId, psStrategy])

  // Limpiar polling al desmontar
  useEffect(() => () => { if (psPollId) clearInterval(psPollId) }, [psPollId])

  async function handleRunPageSpeed() {
    if (!projectId || psRunning) return
    setPsRunning(true)
    setPsResult(null)
    try {
      const { data } = await api.post(`/marketing/projects/${projectId}/pagespeed`, { strategy: psStrategy })
      const resultId = data.resultId
      // Polling cada 3s hasta que el análisis termine
      const intervalId = setInterval(async () => {
        try {
          const { data: res } = await api.get(`/marketing/projects/${projectId}/pagespeed/${resultId}`)
          if (res.status === 'done') {
            clearInterval(intervalId)
            setPsPollId(null)
            setPsResult(res)
            setPsRunning(false)
            setPsHistory(prev => [{ id: res.id, performanceScore: res.performanceScore, strategy: res.strategy, createdAt: res.createdAt }, ...prev].slice(0, 6))
          } else if (res.status === 'error') {
            clearInterval(intervalId)
            setPsPollId(null)
            setPsRunning(false)
            alert(res.errorMsg || 'Error en el análisis de PageSpeed')
          }
        } catch { /* continuar polling */ }
      }, 3000)
      setPsPollId(intervalId)
    } catch (e) {
      setPsRunning(false)
      alert(e.response?.data?.error || 'Error al iniciar el análisis')
    }
  }

  async function handleSaveSnapshot() {
    const activeMonth = getActiveMonth(appliedRange.preset)
    if (!activeMonth || !projectId) return
    setSavingSnap(true)
    try {
      await api.post(`/marketing/projects/${projectId}/snapshots`, { month: activeMonth })
      setSnapSaved(true)
      setTimeout(() => setSnapSaved(false), 3000)
    } catch (e) {
      alert(e.response?.data?.error || 'Error al guardar snapshot')
    } finally {
      setSavingSnap(false)
    }
  }

  async function handleGenerateInsight() {
    const activeMonth = getActiveMonth(appliedRange.preset)
    if (!activeMonth || !projectId) return
    setInsightLoading(true)
    try {
      const { data } = await api.post(`/marketing/projects/${projectId}/insights/${activeMonth}`)
      setInsight(data)
    } catch (e) {
      alert(e.response?.data?.error || 'Error al generar insight')
    } finally {
      setInsightLoading(false)
    }
  }

  const ov              = analytics?.overview ?? {}
  const totalSessions   = analytics?.channels?.reduce((s, c) => s + c.sessions, 0) || 0
  const selectedProject = projects.find(p => String(p.id) === projectId)
  const websiteUrlForPS = selectedProject?.websiteUrl ?? analytics?.websiteUrl
  const dateLabel     = formatDateLabel(appliedRange.preset, appliedRange.start, appliedRange.end)
  const activeMonth   = getActiveMonth(appliedRange.preset)
  const isMonthly     = !!activeMonth

  // Deltas: preferir analytics.comparison (de GA4), fallback a prevSnap
  const gaComp = analytics?.comparison
  function snapDelta(curr, prevVal) {
    if (prevVal == null || prevVal === 0 || curr == null) return null
    return Math.round(((curr - prevVal) / prevVal) * 100)
  }
  const deltas = gaComp ? {
    sessions:    gaComp.sessionsDelta,
    activeUsers: gaComp.activeUsersDelta,
    newUsers:    gaComp.newUsersDelta,
    pageviews:   gaComp.screenPageViewsDelta,
    bounceRate:  gaComp.bounceRateDelta,
    avgDuration: gaComp.averageSessionDurationDelta,
  } : prevSnap ? {
    sessions:    snapDelta(ov.sessions,              prevSnap.sessions),
    activeUsers: snapDelta(ov.activeUsers,            prevSnap.activeUsers),
    newUsers:    snapDelta(ov.newUsers,               prevSnap.newUsers),
    pageviews:   snapDelta(ov.screenPageViews,        prevSnap.pageviews),
    bounceRate:  snapDelta(ov.bounceRate,             prevSnap.bounceRate),
    avgDuration: snapDelta(ov.averageSessionDuration, prevSnap.avgDuration),
  } : {}

  return (
    <div className="space-y-5">

      {/* Controles */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap gap-4 items-end">
        {subtab === 'analytics' && <div className="flex flex-wrap items-end gap-2">
          <div className="w-[180px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Período
            </label>
            <select
              value={rangePreset}
              onChange={e => handlePresetChange(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {PRESET_RANGES.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* Inputs de fecha personalizada */}
          {rangePreset === 'custom' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  Desde
                </label>
                <input
                  type="date"
                  value={customStart}
                  max={customEnd || todayStr()}
                  onChange={e => setCustomStart(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  Hasta
                </label>
                <input
                  type="date"
                  value={customEnd}
                  min={customStart}
                  max={todayStr()}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <button
                onClick={handleApplyCustom}
                disabled={!customStart || !customEnd || customStart > customEnd}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Aplicar
              </button>
            </>
          )}
        </div>}
        {subtab === 'analytics' && (appliedRange.preset === 'thisMonth' || appliedRange.preset === 'lastMonth') && (
          <label className="flex items-center gap-2 cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={compare}
              onChange={e => setCompare(e.target.checked)}
              className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
            />
            <span className="text-xs text-gray-600 dark:text-gray-400">Comparar con período anterior</span>
          </label>
        )}
        {subtab === 'analytics' && analytics?.websiteUrl && (
          <a
            href={/^https?:\/\//i.test(analytics.websiteUrl) ? analytics.websiteUrl : `https://${analytics.websiteUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 hover:underline pb-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
            </svg>
            Ver sitio
          </a>
        )}
      </div>

      {/* Estados de error — solo Analytics */}
      {subtab === 'analytics' && errorStatus === 'no_integration' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-8 text-center">
          <div className="text-3xl mb-3">📊</div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
            Google Analytics no está conectado para este proyecto
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Conectalo desde <strong>Mis Proyectos → [Proyecto] → Info</strong>
          </p>
        </div>
      )}
      {subtab === 'analytics' && errorStatus === 'no_property' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-8 text-center">
          <div className="text-3xl mb-3">🔢</div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
            Falta el GA4 Property ID
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Ingresalo en <strong>Mis Proyectos → [Proyecto] → Info → Integraciones Google</strong>
          </p>
        </div>
      )}
      {subtab === 'analytics' && errorStatus === 'revoked' && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-2xl p-8 text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">
            La conexión con Google Analytics expiró
          </p>
          <p className="text-xs text-red-500 dark:text-red-400">
            Desconectá y volvé a conectar desde la tab Info del proyecto
          </p>
        </div>
      )}
      {subtab === 'analytics' && error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-2xl p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading — solo Analytics */}
      {subtab === 'analytics' && loading && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="inline-block w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-gray-400">Cargando datos de Google Analytics…</p>
        </div>
      )}

      {/* Dashboard — solo Analytics */}
      {subtab === 'analytics' && analytics && !loading && (
        <>
          {/* Banner de caída de tráfico */}
          {gaComp?.sessionsDelta != null && gaComp.sessionsDelta < -20 && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-xl flex-shrink-0">⚠️</span>
              <p className="text-sm text-orange-700 dark:text-orange-300">
                Las sesiones cayeron <strong>{Math.abs(gaComp.sessionsDelta)}%</strong> respecto al período anterior.
              </p>
            </div>
          )}

          {/* Métricas principales */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>Resumen · {dateLabel}</SectionTitle>
              {prevSnap && (
                <span className="text-xs text-gray-400">vs mes anterior</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <MetricCard
                label="Sesiones"
                value={fmt(ov.sessions)}
                icon="📈"
                highlight
                delta={deltas.sessions}
                deltaPositivo={deltas.sessions >= 0}
              />
              <MetricCard
                label="Usuarios activos"
                value={fmt(ov.activeUsers)}
                icon="👥"
                delta={deltas.activeUsers}
                deltaPositivo={deltas.activeUsers >= 0}
              />
              <MetricCard
                label="Nuevos usuarios"
                value={fmt(ov.newUsers)}
                icon="✨"
                sub={ov.sessions ? `${pct(ov.newUsers, ov.sessions)}% del total` : undefined}
                delta={deltas.newUsers}
                deltaPositivo={deltas.newUsers >= 0}
              />
              <MetricCard
                label="Páginas vistas"
                value={fmt(ov.screenPageViews)}
                icon="📄"
                sub={ov.sessions ? `${fmt(ov.screenPageViews / ov.sessions, 1)} por sesión` : undefined}
                delta={deltas.pageviews}
                deltaPositivo={deltas.pageviews >= 0}
              />
              <MetricCard
                label="Tasa de rebote"
                value={ov.bounceRate != null ? `${fmt(ov.bounceRate * 100, 1)}%` : '—'}
                icon="↩️"
                delta={deltas.bounceRate}
                deltaPositivo={deltas.bounceRate <= 0}
              />
              <MetricCard
                label="Duración media"
                value={fmtDuration(ov.averageSessionDuration)}
                icon="⏱️"
                delta={deltas.avgDuration}
                deltaPositivo={deltas.avgDuration >= 0}
              />
            </div>
          </div>

          {/* Conversiones */}
          <ConversionsBlock conversions={analytics.conversions} sessions={ov.sessions} />

          {/* Canales + Dispositivos */}
          <div className="grid sm:grid-cols-5 gap-4">

            {/* Canales — 3/5 */}
            {analytics.channels?.length > 0 && (
              <div className="sm:col-span-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                <SectionTitle>Canales de tráfico</SectionTitle>
                <div className="space-y-3">
                  {analytics.channels.map((ch, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-medium">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${CHANNEL_COLORS[i % CHANNEL_COLORS.length]}`} />
                          {ch.channel || 'Directo'}
                        </span>
                        <span className="text-gray-500 tabular-nums">
                          {fmt(ch.sessions)} ses.
                          <span className="ml-1.5 text-gray-400">
                            ({pct(ch.sessions, totalSessions)}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${CHANNEL_COLORS[i % CHANNEL_COLORS.length]}`}
                          style={{ width: `${pct(ch.sessions, totalSessions)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dispositivos — 2/5 */}
            {analytics.devices?.length > 0 && (
              <div className="sm:col-span-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                <SectionTitle>Dispositivos</SectionTitle>
                <div className="space-y-4">
                  {analytics.devices.map((d, i) => {
                    const totalDev = analytics.devices.reduce((s, x) => s + x.sessions, 0)
                    const p = pct(d.sessions, totalDev)
                    const icon = DEVICE_ICONS[d.channel?.toLowerCase()] ?? '💻'
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-gray-700 dark:text-gray-300 capitalize flex items-center gap-1.5">
                            <span>{icon}</span>
                            {d.channel}
                          </span>
                          <span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums">
                            {p}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${p}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 text-right tabular-nums">
                          {fmt(d.sessions)} sesiones
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Fuentes de tráfico detalladas */}
          {analytics.trafficSources?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <SectionTitle>Fuentes de tráfico</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
                      <th className="pb-2 font-medium">Fuente</th>
                      <th className="pb-2 font-medium">Medium</th>
                      <th className="pb-2 font-medium text-right w-20">Sesiones</th>
                      <th className="pb-2 font-medium text-right w-14">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {analytics.trafficSources.map((src, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-3">
                          <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sourceColor(src.source, src.medium)}`} />
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              {src.source || '(direct)'}
                            </span>
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">{src.medium || '—'}</td>
                        <td className="py-2 text-right font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                          {fmt(src.sessions)}
                        </td>
                        <td className="py-2 text-right text-gray-400 tabular-nums">
                          {src.pct != null ? `${src.pct}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top páginas */}
          {analytics.topPages?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <SectionTitle>Top páginas</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
                      <th className="pb-2 font-medium w-6">#</th>
                      <th className="pb-2 font-medium">Página</th>
                      <th className="pb-2 font-medium text-right w-20">Vistas</th>
                      <th className="pb-2 font-medium text-right w-20">Sesiones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {analytics.topPages.map((page, i) => (
                      <tr key={i} className="group">
                        <td className="py-2.5 text-gray-400">{i + 1}</td>
                        <td className="py-2.5 pr-4">
                          <p className="font-mono text-gray-700 dark:text-gray-300 truncate max-w-[280px]">
                            {page.path}
                          </p>
                          {page.title && page.title !== page.path && (
                            <p className="text-gray-400 truncate max-w-[280px]">{page.title}</p>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                          {fmt(page.pageviews)}
                        </td>
                        <td className="py-2.5 text-right text-gray-500 tabular-nums">
                          {fmt(page.sessions)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Snapshot + Insight IA — solo para períodos mensuales */}
          {isMonthly && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Análisis IA · {dateLabel}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Guardá un snapshot del período y generá un análisis mensual con IA.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={handleSaveSnapshot}
                    disabled={savingSnap}
                    className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    {savingSnap ? 'Guardando…' : snapSaved ? '✓ Guardado' : '💾 Guardar snapshot'}
                  </button>
                  <button
                    onClick={handleGenerateInsight}
                    disabled={insightLoading}
                    className="px-3 py-1.5 text-xs bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                  >
                    {insightLoading ? 'Analizando…' : insight ? '🔄 Regenerar' : '✨ Analizar con IA'}
                  </button>
                </div>
              </div>

              {insightLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <div className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                  Generando análisis con IA…
                </div>
              )}

              {insight && !insightLoading && (
                <div className="space-y-4">
                  {/* Título y resumen */}
                  <div>
                    <p className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">
                      {insight.content?.titulo}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                      {insight.content?.resumen}
                    </p>
                  </div>

                  {/* Tendencias */}
                  {insight.content?.tendencias?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Tendencias
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {insight.content.tendencias.map((t, i) => (
                          <span
                            key={i}
                            className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium
                              ${t.positivo
                                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                              }`}
                          >
                            {t.delta != null ? (t.delta > 0 ? '▲' : '▼') : '–'}
                            {t.metrica}
                            {t.delta != null && ` ${Math.abs(t.delta)}%`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recomendaciones */}
                  {insight.content?.recomendaciones?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Recomendaciones
                      </p>
                      <ul className="space-y-1.5">
                        {insight.content.recomendaciones.map((rec, i) => (
                          <li key={i} className="flex items-start justify-between gap-2">
                            <span className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                              <span className="text-primary-500 mt-0.5 flex-shrink-0">→</span>
                              {rec}
                            </span>
                            <button
                              onClick={() => setTaskModal({ title: rec })}
                              title="Crear tarea a partir de esta recomendación"
                              className="flex-shrink-0 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-gray-200 dark:border-gray-600 hover:border-primary-400 rounded-lg px-2 py-0.5 transition-all"
                            >
                              + tarea
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-[11px] text-gray-400">
                    Generado: {new Date(insight.generatedAt).toLocaleString('es-AR')}
                  </p>
                </div>
              )}

              {!insight && !insightLoading && (
                <p className="text-xs text-gray-400">
                  Guardá un snapshot del período actual y hacé click en "Analizar con IA" para obtener un resumen inteligente con comparaciones y recomendaciones.
                </p>
              )}
            </div>
          )}

          {/* Footer */}
          <p className="text-xs text-gray-400 text-right">
            Datos de Google Analytics · Actualizado:{' '}
            {analytics.fetchedAt
              ? new Date(analytics.fetchedAt).toLocaleString('es-AR')
              : '—'}
          </p>
        </>
      )}

      {/* ── PageSpeed Insights — solo Performance ── */}
      {subtab === 'performance' && (
        <PageSpeedSection
          websiteUrl={websiteUrlForPS}
          strategy={psStrategy}
          onStrategyChange={s => setPsStrategy(s)}
          result={psResult}
          history={psHistory}
          running={psRunning}
          onRun={handleRunPageSpeed}
          projectId={projectId}
          projectName={selectedProject?.name ?? analytics?.projectName ?? ''}
        />
      )}

      {/* Modal crear tarea desde recomendación IA */}
      {taskModal && (
        <CreateTaskModal
          title={taskModal.title}
          projectId={projectId}
          projectName={analytics?.projectName ?? ''}
          onClose={() => setTaskModal(null)}
        />
      )}
    </div>
  )
}
