import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import SetupHintCard from '../SetupHintCard'

// Techo del polling de auditorías async: si el job no terminó en este tiempo, se
// asume colgado y se deja de pollear en vez de reintentar indefinidamente.
const MAX_POLL_MS = 5 * 60 * 1000

// ─── AI Traffic ───────────────────────────────────────────────────────────────

const AI_META = {
  chatgpt:    { label: 'ChatGPT',    icon: '🤖', color: 'bg-green-500' },
  gemini:     { label: 'Gemini',     icon: '✨', color: 'bg-blue-500' },
  claude:     { label: 'Claude',     icon: '🟠', color: 'bg-orange-500' },
  grok:       { label: 'Grok',       icon: '𝕏',  color: 'bg-gray-800 dark:bg-gray-300' },
  metaAi:     { label: 'Meta AI',    icon: '🔵', color: 'bg-blue-600' },
  perplexity: { label: 'Perplexity', icon: '🔍', color: 'bg-teal-500' },
  copilot:    { label: 'Copilot',    icon: '💠', color: 'bg-indigo-500' },
}

// Mini gráfico de barras SVG para el histórico
function AiBarChart({ history }) {
  if (!history?.length) return null

  // Calcular totales por mes
  const months = history.map(h => {
    const total = Object.entries(h)
      .filter(([k]) => k !== 'month')
      .reduce((s, [, v]) => s + (v || 0), 0)
    return { month: h.month, total }
  })

  const maxVal = Math.max(...months.map(m => m.total), 1)
  const W = 400
  const H = 80
  const barW = Math.max(Math.floor((W - 20) / months.length) - 4, 8)

  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" preserveAspectRatio="none">
      {months.map((m, i) => {
        const x    = 10 + i * ((W - 20) / months.length)
        const barH = Math.max(Math.round((m.total / maxVal) * H), 2)
        const y    = H - barH
        const label = m.month.slice(5) // "MM"
        return (
          <g key={m.month}>
            <rect x={x} y={y} width={barW} height={barH} rx="2" className="fill-primary-400 dark:fill-primary-500 opacity-80" />
            <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize="7" className="fill-gray-400 dark:fill-gray-500">
              {label}
            </text>
            {m.total > 0 && (
              <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize="7" className="fill-gray-500 dark:fill-gray-400">
                {m.total}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function AiTrafficSection({ projectId }) {
  const [data,    setData]    = useState(null)   // { live, history }
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    api.get(`/marketing/projects/${projectId}/ai-traffic`)
      .then(r => setData(r.data))
      .catch(err => {
        const code = err.response?.data?.code
        if (code !== 'NO_INTEGRATION') setError(err.response?.data?.error ?? 'Error al cargar tráfico de IAs')
        // Si no tiene GA4 conectado → simplemente no mostrar la sección
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin inline-block" />
        Cargando tráfico desde IAs…
      </div>
    </div>
  )

  if (!data || error) return null   // Sin GA4 o error → no renderizar

  const live    = data.live    ?? {}
  const history = data.history ?? []

  // Filtrar fuentes con sesiones > 0
  const activeSources = Object.entries(live)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)

  const totalLive = activeSources.reduce((s, [, v]) => s + v, 0)

  if (totalLive === 0 && history.length === 0) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          🤖 Tráfico desde IAs
        </h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">Últimos 30 días</span>
      </div>

      {/* Tarjetas live (solo fuentes con > 0 sesiones) */}
      {activeSources.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {activeSources.map(([key, sessions]) => {
            const meta = AI_META[key] ?? { label: key, icon: '🤖', color: 'bg-gray-400' }
            const pct  = totalLive > 0 ? Math.round((sessions / totalLive) * 100) : 0
            return (
              <div key={key} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.color}`} />
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{meta.label}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">
                  {sessions.toLocaleString('es-AR')}
                </p>
                <div className="flex items-center gap-1">
                  <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-1">
                    <div className={`h-1 rounded-full ${meta.color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{pct}%</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">
          Sin visitas desde IAs en los últimos 30 días.
        </p>
      )}

      {/* Total */}
      {totalLive > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Total: <strong className="text-gray-600 dark:text-gray-300">{totalLive.toLocaleString('es-AR')} sesiones</strong> referidas desde IAs en los últimos 30 días.
        </p>
      )}

      {/* Histórico */}
      {history.length >= 2 && (
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Evolución mensual (sesiones totales desde IAs)</p>
          <AiBarChart history={history} />
        </div>
      )}
    </div>
  )
}

const COMPONENTS_META = [
  { key: 'citability',     icon: '🧠', label: 'Citabilidad IA',     desc: 'Qué tan probable es que la IA cite tu sitio' },
  { key: 'brandAuthority', icon: '🏷',  label: 'Autoridad de Marca', desc: 'Reconocimiento y consistencia de la marca' },
  { key: 'eeat',           icon: '🎓', label: 'E-E-A-T',            desc: 'Experiencia, autoridad y confiabilidad' },
  { key: 'technical',      icon: '⚙️', label: 'Técnico',            desc: 'Rendimiento, accesibilidad y rastreo' },
  { key: 'schema',         icon: '📋', label: 'Schema Markup',      desc: 'Datos estructurados y metadatos' },
  { key: 'platforms',      icon: '🤖', label: 'Plataformas IA',     desc: 'Acceso para crawlers de IA (GPTBot, etc.)' },
]

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 }
const SEVERITY_LABELS = { high: 'Alta', medium: 'Media', low: 'Baja' }
const SEVERITY_COLORS = {
  high:   'bg-red-100    dark:bg-red-900/30  text-red-700    dark:text-red-400',
  medium: 'bg-amber-100  dark:bg-amber-900/30 text-amber-700  dark:text-amber-400',
  low:    'bg-blue-100   dark:bg-blue-900/30  text-blue-700   dark:text-blue-400',
}

// Bandas basadas en investigación Princeton KDD 2024
function scoreBand(score) {
  if (score == null) return null
  if (score >= 86) return { label: 'Excelente', color: 'emerald' }
  if (score >= 68) return { label: 'Bueno',     color: 'green'   }
  if (score >= 36) return { label: 'Base',       color: 'amber'   }
  return                  { label: 'Crítico',    color: 'red'     }
}

function scoreColor(score) {
  const band = scoreBand(score)
  if (!band) return 'text-gray-400'
  return { emerald: 'text-emerald-500', green: 'text-green-500', amber: 'text-amber-500', red: 'text-red-500' }[band.color]
}

function scoreRing(score) {
  const band = scoreBand(score)
  if (!band) return 'border-gray-200 dark:border-gray-700'
  return { emerald: 'border-emerald-400', green: 'border-green-400', amber: 'border-amber-400', red: 'border-red-400' }[band.color]
}

function scoreLabel(score) {
  return scoreBand(score)?.label ?? ''
}

function scoreBarColor(score) {
  const band = scoreBand(score)
  if (!band) return 'bg-gray-300'
  return { emerald: 'bg-emerald-400', green: 'bg-green-400', amber: 'bg-amber-400', red: 'bg-red-400' }[band.color]
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function ComponentCard({ meta, score }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{meta.icon}</span>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{meta.label}</span>
        </div>
        {score != null && (
          <span className={`text-lg font-bold ${scoreColor(score)}`}>{score}</span>
        )}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">{meta.desc}</p>
      {score != null && (
        <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all duration-700 ${scoreBarColor(score)}`}
            style={{ width: `${score}%` }}
          />
        </div>
      )}
    </div>
  )
}

function CreateTaskModal({ title, projectId, projectName, onClose }) {
  const { user } = useAuth()
  const [description, setDescription] = useState(`GEO - ${title}`)
  const [members, setMembers]         = useState([])
  const [assigneeId, setAssigneeId]   = useState('')
  const [saving, setSaving]           = useState(false)
  const [done, setDone]               = useState(false)

  useEffect(() => {
    api.get(`/projects/${projectId}/members`)
      .then(r => {
        setMembers(r.data)
        setAssigneeId(String(user?.id ?? ''))
      })
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
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Crear tarea</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Proyecto: <span className="font-medium text-gray-600 dark:text-gray-300">{projectName}</span></p>

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

// ─── Timeline de scores ───────────────────────────────────────────────────────

function ScoreTimeline({ audits }) {
  const completed = audits.filter(a => a.status === 'completed' && a.score != null)
  if (completed.length < 2) return null

  const pts = [...completed].reverse() // cronológico
  const W = 320, H = 80, PAD = 16
  const scores = pts.map(a => a.score)
  const minS = Math.min(...scores), maxS = Math.max(...scores)
  const range = maxS - minS || 1

  const toX = i  => PAD + (i / (pts.length - 1)) * (W - PAD * 2)
  const toY = s  => PAD + ((maxS - s) / range) * (H - PAD * 2)

  const pathD = pts.map((a, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(a.score)}`).join(' ')

  function dotColor(score) {
    if (score >= 86) return '#10b981'
    if (score >= 68) return '#22c55e'
    if (score >= 36) return '#f59e0b'
    return '#ef4444'
  }

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Evolución del score
      </p>
      <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`}>
        <rect width={W} height={H} rx="8" className="fill-gray-50 dark:fill-gray-700/50" />
        <path d={pathD} fill="none" stroke="#f97316" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((a, i) => (
          <g key={a.id}>
            <circle cx={toX(i)} cy={toY(a.score)} r="4" fill={dotColor(a.score)} />
            <text x={toX(i)} y={H - 2} textAnchor="middle" fontSize="8" fill="#94a3b8">
              {new Date(a.createdAt).toLocaleDateString('es-AR', { month: 'short', day: '2-digit' })}
            </text>
            <text x={toX(i)} y={toY(a.score) - 7} textAnchor="middle" fontSize="9" fill="#374151" className="dark:fill-gray-200 font-medium">
              {a.score}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// ─── Impresión de audit GEO ───────────────────────────────────────────────────

function printGeoAudit(audit, findings, negativeSignals, projectName) {
  const COMP_LABELS = {
    citability:     'Citabilidad IA',
    brandAuthority: 'Autoridad de Marca',
    eeat:           'E-E-A-T',
    technical:      'Técnico',
    schema:         'Schema Markup',
    platforms:      'Plataformas IA',
  }
  const SEV_LABELS  = { high: 'Alta', medium: 'Media', low: 'Baja' }
  const SEV_COLORS  = { high: '#fee2e2', medium: '#fef9c3', low: '#f0fdf4' }
  const SEV_TEXT    = { high: '#991b1b', medium: '#92400e', low: '#166534' }

  const bandLabel = audit.score >= 86 ? 'Excelente' : audit.score >= 68 ? 'Bueno' : audit.score >= 36 ? 'Base' : 'Crítico'
  const bandColor = audit.score >= 86 ? '#10b981' : audit.score >= 68 ? '#22c55e' : audit.score >= 36 ? '#f59e0b' : '#ef4444'

  const compsHtml = Object.entries(COMP_LABELS).map(([key, label]) => {
    const val = audit[key] ?? '—'
    const c = typeof val === 'number'
      ? (val >= 80 ? '#10b981' : val >= 55 ? '#f59e0b' : '#ef4444')
      : '#9ca3af'
    return `<div class="comp-card">
      <div class="comp-score" style="color:${c}">${val}</div>
      <div class="comp-label">${label}</div>
    </div>`
  }).join('')

  const findingsHtml = findings.map(f => `
    <div class="finding">
      <span class="sev-badge" style="background:${SEV_COLORS[f.severity] ?? '#f9fafb'};color:${SEV_TEXT[f.severity] ?? '#374151'}">${SEV_LABELS[f.severity] ?? f.severity}</span>
      <div class="finding-body">
        <p class="finding-title">${f.title ?? ''}</p>
        ${f.description ? `<p class="finding-desc">${f.description}</p>` : ''}
        ${f.action     ? `<p class="finding-action">→ ${f.action}</p>` : ''}
        ${f.impact     ? `<p class="finding-impact">${f.impact}</p>` : ''}
      </div>
    </div>`).join('')

  const negHtml = negativeSignals.length ? `
    <div class="section-title neg-title">⚠️ Señales negativas (${negativeSignals.length})</div>
    ${negativeSignals.map(s => `
      <div class="neg-item">
        <p class="neg-name">${s.title ?? ''}</p>
        ${s.description ? `<p class="neg-desc">${s.description}</p>` : ''}
      </div>`).join('')}` : ''

  const date = new Date(audit.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Análisis GEO — ${projectName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;
         color: #111827; background: #fff; padding: 32px 40px; line-height: 1.5; }
  .print-btn { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 28px;
               padding: 8px 16px; background: #111827; color: #fff; border: none;
               border-radius: 8px; font-size: 13px; cursor: pointer; font-family: inherit; }
  .print-btn:hover { background: #1f2937; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
  .header-left h1 { font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 4px; }
  .header-left .url { font-size: 12px; color: #6b7280; margin-bottom: 2px; }
  .header-left .date { font-size: 12px; color: #9ca3af; }
  .score-bubble { text-align: center; min-width: 90px; }
  .score-num { font-size: 40px; font-weight: 800; line-height: 1; color: ${bandColor}; }
  .score-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .band-badge { display: inline-block; margin-top: 6px; padding: 2px 10px; border-radius: 99px;
                background: ${bandColor}22; color: ${bandColor}; font-weight: 600; font-size: 12px; }
  .section-title { font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase;
                   letter-spacing: .05em; margin: 24px 0 12px; }
  .neg-title { color: #b91c1c; }
  .comps-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .comp-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; text-align: center; }
  .comp-score { font-size: 22px; font-weight: 700; }
  .comp-label { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .finding { display: flex; gap: 10px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
  .finding:last-child { border-bottom: none; }
  .sev-badge { flex-shrink: 0; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; white-space: nowrap; }
  .finding-body { flex: 1; }
  .finding-title { font-weight: 600; font-size: 13px; color: #1f2937; }
  .finding-desc { font-size: 12px; color: #6b7280; margin-top: 3px; }
  .finding-action { font-size: 12px; color: #059669; margin-top: 4px; }
  .finding-impact { font-size: 11px; color: #9ca3af; margin-top: 3px; font-style: italic; }
  .neg-item { padding: 8px 0; border-bottom: 1px solid #fef2f2; }
  .neg-item:last-child { border-bottom: none; }
  .neg-name { font-weight: 600; font-size: 13px; color: #991b1b; }
  .neg-desc { font-size: 12px; color: #b91c1c; margin-top: 2px; }
  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb;
            font-size: 11px; color: #9ca3af; text-align: right; }
  @media print {
    body { padding: 20px 28px; }
    .no-print { display: none !important; }
  }
</style></head><body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
  <div class="header">
    <div class="header-left">
      <h1>${projectName}</h1>
      <p class="url">${audit.url}</p>
      <p class="date">Análisis del ${date}</p>
    </div>
    <div class="score-bubble">
      <div class="score-num">${audit.score}</div>
      <div class="score-sub">/100</div>
      <span class="band-badge">${bandLabel}</span>
    </div>
  </div>
  <div class="section-title">Componentes</div>
  <div class="comps-grid">${compsHtml}</div>
  ${negHtml}
  <div class="section-title">Análisis detallado (${findings.length})</div>
  ${findingsHtml}
  <div class="footer no-print">Generado desde BlissTracker · ${date}</div>
</body></html>`

  const win = window.open('', '_blank', 'width=860,height=750,scrollbars=yes')
  if (!win) return
  win.document.write(html)
  win.document.close()
}

// ─── Benchmark cross-proyecto ─────────────────────────────────────────────────

function CrossProjectPanel({ onSelectProject }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/marketing/geo/audits?summary=true')
      .then(r => setData(r.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
  )
  if (!data?.length) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
      <div className="text-4xl mb-3">🤖</div>
      <p className="text-sm text-gray-500 dark:text-gray-400">Todavía no hay auditorías GEO completadas. Seleccioná un proyecto para empezar.</p>
    </div>
  )

  const BAND_COLORS = {
    Excelente: 'bg-emerald-500',
    Bueno:     'bg-green-500',
    Base:      'bg-amber-400',
    Crítico:   'bg-red-500',
  }
  const BAND_TEXT = {
    Excelente: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
    Bueno:     'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
    Base:      'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20',
    Crítico:   'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
        Salud GEO por proyecto ({data.length})
      </h3>
      <div className="space-y-3">
        {data.sort((a, b) => b.score - a.score).map(p => (
          <div key={p.projectId} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <button
                  onClick={() => onSelectProject?.(String(p.projectId))}
                  className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
                  title="Ver último análisis"
                >{p.projectName}</button>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{p.score}/100</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BAND_TEXT[p.band] ?? ''}`}>{p.band}</span>
                </div>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${BAND_COLORS[p.band] ?? 'bg-gray-400'}`} style={{ width: `${p.score}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function GeoTab({ projectId, projects, onSelectProject }) {
  const [audits, setAudits]         = useState([])
  const [activeAudit, setActive]    = useState(null)
  const [running, setRunning]       = useState(false)
  const [error, setError]           = useState('')
  const [loadingAudits, setLoadingAudits] = useState(false)
  const [taskModal, setTaskModal]   = useState(null) // { title }
  const [llmsModal, setLlmsModal]   = useState(null) // { content } | 'loading'
  const [schemaModal, setSchemaModal] = useState(null) // { schemas } | 'loading'
  const [deleteModal, setDeleteModal] = useState(null) // { id } | null
  const [deleting, setDeleting]     = useState(false)
  const pollRef = useRef(null)
  const pollStartRef = useRef(null)

  const selectedProject = projects.find(p => String(p.id) === projectId)

  async function loadAuditDetail(id) {
    try {
      const r = await api.get(`/marketing/geo/audits/${id}`)
      setActive(r.data)
    } catch {}
  }

  // Cargar historial cuando cambia el proyecto
  const loadAudits = useCallback((pid) => {
    if (!pid) return
    setLoadingAudits(true)
    api.get(`/marketing/geo/audits?projectId=${pid}`)
      .then(r => {
        setAudits(r.data)
        const latest = r.data[0]
        if (latest?.status === 'running') {
          setActive(latest)
          setRunning(true)
          startPolling(latest.id, latest.createdAt)
        } else if (latest?.status === 'completed') {
          loadAuditDetail(latest.id)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAudits(false))
  }, []) // eslint-disable-line

  useEffect(() => {
    stopPolling()
    setActive(null)
    setRunning(false)
    setError('')
    if (projectId) loadAudits(projectId)
    return stopPolling
  }, [projectId]) // eslint-disable-line

  function startPolling(auditId, startedAt) {
    stopPolling()
    pollStartRef.current = startedAt ? new Date(startedAt).getTime() : Date.now()
    pollRef.current = setInterval(async () => {
      if (Date.now() - pollStartRef.current > MAX_POLL_MS) {
        stopPolling()
        setRunning(false)
        setError('El análisis está tardando más de lo esperado. Volvé a intentar en unos minutos.')
        return
      }
      try {
        const r = await api.get(`/marketing/geo/audits/${auditId}`)
        if (r.data.status !== 'running') {
          stopPolling()
          setRunning(false)
          setActive(r.data)
          // Recargar historial
          setAudits(prev => [r.data, ...prev.filter(a => a.id !== r.data.id)])
        }
      } catch {
        stopPolling()
        setRunning(false)
      }
    }, 3000)
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function handleRunAudit() {
    if (!selectedProject?.websiteUrl || running) return
    setError('')
    setRunning(true)
    try {
      const r = await api.post('/marketing/geo/audit', {
        projectId: selectedProject.id,
        url: selectedProject.websiteUrl,
      })
      const newAudit = { id: r.data.auditId, status: 'running', projectId: selectedProject.id, url: selectedProject.websiteUrl, createdAt: new Date().toISOString() }
      setActive(newAudit)
      setAudits(prev => [newAudit, ...prev])
      startPolling(r.data.auditId)
    } catch (e) {
      setRunning(false)
      setError(e.response?.data?.error || 'Error al iniciar el análisis')
    }
  }

  async function handleDeleteAudit() {
    if (!deleteModal) return
    setDeleting(true)
    try {
      await api.delete(`/marketing/geo/audits/${deleteModal.id}`)
      setAudits(prev => prev.filter(a => a.id !== deleteModal.id))
      if (activeAudit?.id === deleteModal.id) setActive(null)
      setDeleteModal(null)
    } catch (err) {
      alert(err.response?.data?.error || 'Error al eliminar la auditoría')
    } finally {
      setDeleting(false)
    }
  }

  async function handleGenerateLlmsTxt() {
    if (!activeAudit?.id) return
    setLlmsModal('loading')
    try {
      const { data } = await api.get(`/marketing/geo/audits/${activeAudit.id}/llms-txt`)
      setLlmsModal({ content: data.content })
    } catch (err) {
      alert(err.response?.data?.error || 'Error al generar llms.txt')
      setLlmsModal(null)
    }
  }

  async function handleGenerateSchema() {
    if (!activeAudit?.id) return
    setSchemaModal('loading')
    try {
      const { data } = await api.post(`/marketing/geo/audits/${activeAudit.id}/schema`)
      setSchemaModal({ schemas: data.schemas })
    } catch (err) {
      alert(err.response?.data?.error || 'Error al generar schemas')
      setSchemaModal(null)
    }
  }

  function parseField(val) {
    if (!val) return []
    if (Array.isArray(val)) return val
    try { return JSON.parse(val) } catch { return [] }
  }
  const items = parseField(activeAudit?.findings)
  const negativeSignals = parseField(activeAudit?.recommendations)
  const sortedFindings = [...items].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))

  const noUrl = selectedProject && !selectedProject.websiteUrl
  const hasLlmsFinding  = sortedFindings.some(f =>
    f.title?.toLowerCase().includes('llms') || f.description?.toLowerCase().includes('llms')
  )
  const schemaScoreLow  = activeAudit?.schema != null && activeAudit.schema < 70

  return (
    <div className="space-y-6">

      {/* Sin URL configurada → invitación a completarla */}
      {noUrl && (
        <SetupHintCard
          icon="🌐"
          label="Este proyecto no tiene una URL configurada"
          hint="Agregá la URL del sitio para correr la auditoría GEO y medir la visibilidad en buscadores con IA."
          to={`/my-projects/${selectedProject.id}?infoTab=info`}
          ctaLabel="Agregar URL en Info →"
        />
      )}

      {/* Panel de auditoría */}
      {selectedProject && !noUrl && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                URL analizada
              </p>
              <p className="text-sm text-primary-600 dark:text-primary-400 mt-0.5 break-all">
                {selectedProject.websiteUrl}
              </p>
            </div>
            <button
              onClick={handleRunAudit}
              disabled={running}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
            >
              {running ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analizando…
                </>
              ) : (
                <>
                  🤖 {activeAudit?.status === 'completed' ? 'Re-analizar' : 'Analizar'}
                </>
              )}
            </button>
          </div>

          {running && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400">
                <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                {activeAudit?.errorMsg || 'Iniciando análisis…'}
              </div>
              <div className="flex gap-1">
                {['Conectando', 'Extrayendo', 'Analizando con IA', 'Guardando'].map((step, i) => {
                  const msg = activeAudit?.errorMsg ?? ''
                  const active = i === 0 ? msg.includes('Conectando')
                    : i === 1 ? msg.includes('Extrayendo')
                    : i === 2 ? msg.includes('Analizando')
                    : msg.includes('Guardando')
                  const done = i === 0 ? !msg.includes('Conectando')
                    : i === 1 ? (msg.includes('Analizando') || msg.includes('Guardando'))
                    : i === 2 ? msg.includes('Guardando')
                    : false
                  return (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
                      done   ? 'bg-blue-400 dark:bg-blue-500' :
                      active ? 'bg-blue-300 dark:bg-blue-600 animate-pulse' :
                               'bg-blue-100 dark:bg-blue-900/40'
                    }`} />
                  )
                })}
              </div>
              <p className="text-xs text-blue-500 dark:text-blue-500">
                Podés cerrar esta pestaña — el análisis continúa en segundo plano.
              </p>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {activeAudit?.status === 'failed' && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl text-sm text-red-700 dark:text-red-400">
              El análisis falló: {activeAudit.errorMsg || 'Error desconocido'}
            </div>
          )}
        </div>
      )}

      {/* Resultados */}
      {activeAudit?.status === 'completed' && (
        <>
          {/* Score global */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Gauge */}
              <div className={`w-32 h-32 rounded-full border-8 ${scoreRing(activeAudit.score)} flex flex-col items-center justify-center flex-shrink-0`}>
                <span className={`text-4xl font-bold ${scoreColor(activeAudit.score)}`}>
                  {activeAudit.score ?? '—'}
                </span>
                <span className="text-xs text-gray-400">/100</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Score GEO: <span className={scoreColor(activeAudit.score)}>{scoreLabel(activeAudit.score)}</span>
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Analizado el {fmtDate(activeAudit.createdAt)}
                  {activeAudit.tokensUsed ? ` · ${activeAudit.tokensUsed.toLocaleString()} tokens` : ''}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Este puntaje refleja qué tan bien está optimizado tu sitio para aparecer en respuestas de motores de búsqueda con IA como ChatGPT, Perplexity y Claude.
                </p>
              </div>
            </div>
          </div>

          {/* Herramientas de generación + impresión */}
          <div className="flex flex-wrap gap-2">
            {hasLlmsFinding && (
              <button onClick={handleGenerateLlmsTxt}
                className="px-3 py-1.5 text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                📄 Generar llms.txt
              </button>
            )}
            {schemaScoreLow && (
              <button onClick={handleGenerateSchema}
                className="px-3 py-1.5 text-xs font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-700 rounded-xl hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors">
                🏷️ Generar JSON-LD
              </button>
            )}
            <button
              onClick={() => printGeoAudit(activeAudit, sortedFindings, negativeSignals, selectedProject?.name ?? activeAudit.url)}
              title="Imprimir / Exportar PDF"
              className="px-3 py-1.5 text-xs font-medium bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.046.752.097 1.126.153A2.212 2.212 0 0 1 18 8.653v4.097A2.25 2.25 0 0 1 15.75 15h-.241l.305 1.984A1.75 1.75 0 0 1 14.084 19H5.915a1.75 1.75 0 0 1-1.73-2.016L4.49 15H4.25A2.25 2.25 0 0 1 2 12.75V8.653c0-1.082.775-2.034 1.874-2.198.374-.056.749-.107 1.126-.153V2.75Zm4.5 13.5h1l-.307-2H9.807l-.307 2Zm1.997 0h.258l.527-3.44A.75.75 0 0 0 11.54 12H8.46a.75.75 0 0 0-.743.81L8.244 16.25h.258Zm-5.99-10.337c.966-.099 1.94-.17 2.923-.213L8.25 5.25a.75.75 0 0 1 .75.75v.313l.5-.063L10 5.25a.75.75 0 0 1 .75.75v.25l.5.063V6a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 .75.75v.245c.984.043 1.96.114 2.925.213A.75.75 0 0 0 16.5 5.5v-2.75a.25.25 0 0 0-.25-.25h-6.5a.25.25 0 0 0-.25.25V5.5a.75.75 0 0 0-.743.663Z" clipRule="evenodd" />
              </svg>
              Imprimir
            </button>
          </div>

          {/* Tráfico desde IAs */}
          <AiTrafficSection projectId={projectId} />

          {/* 6 componentes */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Componentes</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {COMPONENTS_META.map(meta => (
                <ComponentCard key={meta.key} meta={meta} score={activeAudit[meta.key]} />
              ))}
            </div>
          </div>

          {/* Señales negativas */}
          {negativeSignals.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-200 dark:border-red-800/50 p-5">
              <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-3 flex items-center gap-2">
                ⚠️ Señales negativas ({negativeSignals.length})
                <span className="text-xs font-normal text-red-500 dark:text-red-500">— reducen la citabilidad en IA</span>
              </h3>
              <div className="space-y-3">
                {negativeSignals.map((s, i) => (
                  <div key={i}>
                    <p className="text-sm font-medium text-red-800 dark:text-red-300">{s.title}</p>
                    {s.description && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{s.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Items unificados */}
          {sortedFindings.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                Análisis detallado ({sortedFindings.length})
              </h3>
              <div className="space-y-4">
                {sortedFindings.map((f, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className={`mt-0.5 px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${SEVERITY_COLORS[f.severity] ?? SEVERITY_COLORS.low}`}>
                      {SEVERITY_LABELS[f.severity] ?? f.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{f.title}</p>
                      {f.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{f.description}</p>
                      )}
                      {f.action && (
                        <div className="mt-2 flex items-start gap-1.5">
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex-shrink-0">→</span>
                          <p className="text-xs text-emerald-700 dark:text-emerald-300">{f.action}</p>
                        </div>
                      )}
                      {f.impact && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic">{f.impact}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setTaskModal({ title: f.action || f.title })}
                      title="Crear tarea a partir de este ítem"
                      className="flex-shrink-0 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-gray-200 dark:border-gray-600 hover:border-primary-400 rounded-lg px-2 py-0.5 transition-all"
                    >
                      + tarea
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Historial de audits */}
      {projectId && audits.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Historial de análisis
          </h3>
          <ScoreTimeline audits={audits} />
          {loadingAudits ? (
            <p className="text-sm text-gray-400">Cargando…</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {audits.map(a => (
                <div
                  key={a.id}
                  className="py-3 flex items-center justify-between gap-4 group"
                >
                  <div
                    className={`flex-1 min-w-0 flex items-center justify-between gap-4 ${
                      a.status === 'completed' ? 'cursor-pointer' : ''
                    }`}
                    onClick={() => a.status === 'completed' && loadAuditDetail(a.id)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{a.url}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(a.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {a.status === 'completed' && a.score != null && (
                        <span className={`text-sm font-bold ${scoreColor(a.score)}`}>{a.score}/100</span>
                      )}
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        a.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                        a.status === 'running'   ? 'bg-blue-100  dark:bg-blue-900/30  text-blue-700  dark:text-blue-400'  :
                        a.status === 'failed'    ? 'bg-red-100   dark:bg-red-900/30   text-red-700   dark:text-red-400'   :
                                                   'bg-gray-100  dark:bg-gray-700     text-gray-500  dark:text-gray-400'
                      }`}>
                        {a.status === 'completed' ? 'completado' : a.status === 'running' ? 'analizando…' : a.status === 'failed' ? 'falló' : 'pendiente'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteModal({ id: a.id, score: a.score, date: a.createdAt }) }}
                    disabled={a.status === 'running'}
                    title="Eliminar análisis"
                    className="flex-shrink-0 text-gray-200 dark:text-gray-700 hover:text-red-500 dark:hover:text-red-400 transition-colors text-xl leading-none disabled:opacity-30 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Estado vacío */}
      {taskModal && selectedProject && (
        <CreateTaskModal
          title={taskModal.title}
          projectId={selectedProject.id}
          projectName={selectedProject.name}
          onClose={() => setTaskModal(null)}
        />
      )}

      {!projectId && <CrossProjectPanel onSelectProject={onSelectProject} />}

      {/* Modal de confirmación de eliminación */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setDeleteModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <span className="text-red-600 dark:text-red-400 text-lg">🗑</span>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Eliminar análisis</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {deleteModal.score != null
                    ? `Score ${deleteModal.score}/100 · ${fmtDate(deleteModal.date)}`
                    : fmtDate(deleteModal.date)
                  }
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              Esta acción es permanente. El análisis se eliminará del historial y no se tendrá en cuenta en el gráfico de evolución de score ni en los informes.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal(null)}
                className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAudit}
                disabled={deleting}
                className="flex-1 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
              >
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal llms.txt */}
      {llmsModal && llmsModal !== 'loading' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">llms.txt generado</h2>
              <button onClick={() => setLlmsModal(null)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
            </div>
            <textarea
              readOnly
              value={llmsModal.content}
              rows={14}
              className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-xs font-mono resize-none focus:outline-none"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { navigator.clipboard.writeText(llmsModal.content); alert('Copiado al portapapeles') }}
                className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl">
                Copiar
              </button>
              <button onClick={() => setLlmsModal(null)} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {llmsModal === 'loading' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-600 dark:text-gray-300">Generando llms.txt…</span>
          </div>
        </div>
      )}

      {/* Modal Schema.org */}
      {schemaModal && schemaModal !== 'loading' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Schema.org JSON-LD</h2>
              <button onClick={() => setSchemaModal(null)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
            </div>
            {schemaModal.schemas.length === 0
              ? <p className="text-sm text-gray-500">No se generaron schemas. El sitio podría ya tenerlos todos.</p>
              : (
                <div className="flex-1 overflow-y-auto space-y-4">
                  {schemaModal.schemas.map((s, i) => (
                    <div key={i}>
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">{s.type}</p>
                      <textarea readOnly value={s.jsonLd} rows={6}
                        className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-xs font-mono resize-none focus:outline-none" />
                      <button onClick={() => { navigator.clipboard.writeText(s.jsonLd); alert(`${s.type} copiado`) }}
                        className="mt-1 text-xs text-primary-600 dark:text-primary-400 hover:underline">
                        Copiar {s.type}
                      </button>
                    </div>
                  ))}
                </div>
              )
            }
            <div className="flex justify-end mt-4">
              <button onClick={() => setSchemaModal(null)} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {schemaModal === 'loading' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-600 dark:text-gray-300">Generando Schema.org…</span>
          </div>
        </div>
      )}
    </div>
  )
}
