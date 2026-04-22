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

function scoreColor(score) {
  if (score == null) return 'text-gray-400'
  if (score >= 70) return 'text-emerald-500'
  if (score >= 40) return 'text-amber-500'
  return 'text-red-500'
}

function scoreRing(score) {
  if (score == null) return 'border-gray-200 dark:border-gray-700'
  if (score >= 70) return 'border-emerald-400'
  if (score >= 40) return 'border-amber-400'
  return 'border-red-400'
}

function scoreLabel(score) {
  if (score == null) return ''
  if (score >= 70) return 'Bueno'
  if (score >= 40) return 'Mejorable'
  return 'Crítico'
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
            className={`h-1.5 rounded-full transition-all duration-700 ${
              score >= 70 ? 'bg-emerald-400' : score >= 40 ? 'bg-amber-400' : 'bg-red-400'
            }`}
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

export default function GeoTab() {
  const [projects, setProjects]     = useState([])
  const [projectId, setProjectId]   = useState('')
  const [audits, setAudits]         = useState([])
  const [activeAudit, setActive]    = useState(null)
  const [running, setRunning]       = useState(false)
  const [error, setError]           = useState('')
  const [loadingAudits, setLoadingAudits] = useState(false)
  const [taskModal, setTaskModal]   = useState(null) // { title }
  const pollRef = useRef(null)

  // Cargar proyectos del workspace
  useEffect(() => {
    api.get('/projects').then(r => {
      setProjects(r.data)
      const first = r.data.find(p => p.websiteUrl)
      if (first) setProjectId(String(first.id))
    }).catch(() => {})
  }, [])

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

  function parseField(val) {
    if (!val) return []
    if (Array.isArray(val)) return val
    try { return JSON.parse(val) } catch { return [] }
  }
  const items = parseField(activeAudit?.findings)
  const sortedFindings = [...items].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))

  const noUrl = selectedProject && !selectedProject.websiteUrl

  return (
    <div className="space-y-6">

      {/* Selector de proyecto */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Proyecto a analizar
        </label>
        {projects.length === 0 ? (
          <p className="text-sm text-gray-400">Cargando proyectos…</p>
        ) : (
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">— Seleccioná un proyecto —</option>
            {projects.map(p => (
              <option key={p.id} value={String(p.id)}>
                {p.name}{p.websiteUrl ? ` — ${p.websiteUrl}` : ' (sin URL)'}
              </option>
            ))}
          </select>
        )}

        {noUrl && (
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-sm text-amber-700 dark:text-amber-400">
            Este proyecto no tiene una URL configurada.
            Podés agregarla desde <strong>Admin → Proyectos</strong>, editando el proyecto.
          </div>
        )}
      </div>

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

          {/* 6 componentes */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Componentes</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {COMPONENTS_META.map(meta => (
                <ComponentCard key={meta.key} meta={meta} score={activeAudit[meta.key]} />
              ))}
            </div>
          </div>

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
                      className="flex-shrink-0 text-xs text-primary-600 dark:text-primary-400 hover:underline mt-0.5"
                      title="Crear tarea a partir de este ítem"
                    >
                      + Tarea
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

      {!projectId && projects.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
          <div className="text-4xl mb-3">🤖</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Seleccioná un proyecto para empezar el análisis GEO.
          </p>
        </div>
      )}
    </div>
  )
}
