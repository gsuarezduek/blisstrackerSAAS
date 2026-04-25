import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'

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

// ─── Benchmark cross-proyecto ─────────────────────────────────────────────────

function CrossProjectPanel() {
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
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{p.projectName}</span>
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

export default function GeoTab({ projectId, projects }) {
  const [audits, setAudits]         = useState([])
  const [activeAudit, setActive]    = useState(null)
  const [running, setRunning]       = useState(false)
  const [error, setError]           = useState('')
  const [loadingAudits, setLoadingAudits] = useState(false)
  const [taskModal, setTaskModal]   = useState(null) // { title }
  const [llmsModal, setLlmsModal]   = useState(null) // { content } | 'loading'
  const [schemaModal, setSchemaModal] = useState(null) // { schemas } | 'loading'
  const pollRef = useRef(null)

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
          startPolling(latest.id)
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

  function startPolling(auditId) {
    stopPolling()
    pollRef.current = setInterval(async () => {
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

      {/* Selector de proyecto */}
      {noUrl && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-sm text-amber-700 dark:text-amber-400">
          Este proyecto no tiene una URL configurada.
          Podés agregarla desde <strong>Proyectos → Info</strong>.
        </div>
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

          {/* Herramientas de generación */}
          {(hasLlmsFinding || schemaScoreLow) && (
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
            </div>
          )}

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
                  onClick={() => a.status === 'completed' && loadAuditDetail(a.id)}
                  className={`py-3 flex items-center justify-between gap-4 ${
                    a.status === 'completed' ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg px-2 -mx-2' : ''
                  }`}
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

      {!projectId && <CrossProjectPanel />}

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
