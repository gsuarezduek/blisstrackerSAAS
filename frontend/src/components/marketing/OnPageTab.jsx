import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import SetupHintCard from '../SetupHintCard'
import LoadingSpinner from '../LoadingSpinner'

const SEV = {
  high:   { label: 'Alta',  cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  medium: { label: 'Media', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  low:    { label: 'Baja',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
}
const SEV_ORDER = { high: 0, medium: 1, low: 2 }

function scoreBand(s) {
  if (s >= 86) return { label: 'Excelente', color: 'text-green-600 dark:text-green-400', ring: 'stroke-green-500' }
  if (s >= 68) return { label: 'Bueno',     color: 'text-primary-600 dark:text-primary-400', ring: 'stroke-primary-500' }
  if (s >= 36) return { label: 'Base',      color: 'text-amber-600 dark:text-amber-400', ring: 'stroke-amber-500' }
  return { label: 'Crítico', color: 'text-red-600 dark:text-red-400', ring: 'stroke-red-500' }
}
const shortUrl = (u) => { try { const x = new URL(u); return x.pathname === '/' ? x.hostname : x.pathname } catch { return u } }
const pageColor = (s) => s >= 80 ? 'text-green-600 dark:text-green-400' : s >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'

// ─── Crear tarea (prefijo "On-Page -") ─────────────────────────────────────────
function CreateTaskModal({ title, projectId, projectName, onClose }) {
  const { user } = useAuth()
  const [description, setDescription] = useState(`On-Page - ${title}`)
  const [members, setMembers]         = useState([])
  const [assigneeId, setAssigneeId]   = useState('')
  const [saving, setSaving]           = useState(false)
  const [done, setDone]               = useState(false)
  useEffect(() => {
    api.get(`/projects/${projectId}/members`).then(r => { setMembers(r.data); setAssigneeId(String(user?.id ?? '')) }).catch(() => {})
  }, [projectId, user])
  async function handleSubmit(e) {
    e.preventDefault(); if (!description.trim()) return; setSaving(true)
    try {
      const body = { description: description.trim(), projectId: String(projectId) }
      if (assigneeId && assigneeId !== String(user?.id)) body.targetUserId = assigneeId
      await api.post('/tasks', body); setDone(true); setTimeout(onClose, 1200)
    } catch { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Crear tarea</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Proyecto: <span className="font-medium text-gray-600 dark:text-gray-300">{projectName}</span></p>
        {done ? (
          <div className="flex flex-col items-center py-6 gap-2"><span className="text-3xl">✅</span><p className="text-sm font-medium text-gray-700 dark:text-gray-300">Tarea creada</p></div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <textarea autoFocus rows={3} value={description} onChange={e => setDescription(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
            {members.length > 1 && (
              <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                {members.map(m => <option key={m.id} value={String(m.id)}>{m.name}{String(m.id) === String(user?.id) ? ' (yo)' : ''}</option>)}
              </select>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
              <button type="submit" disabled={saving || !description.trim()} className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg py-2 text-sm font-medium transition-colors">{saving ? 'Guardando…' : 'Crear tarea'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function ScoreGauge({ score }) {
  const band = scoreBand(score)
  const r = 42, c = 2 * Math.PI * r, off = c - (score / 100) * c
  return (
    <div className="relative w-28 h-28 flex-shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="8" fill="none" />
        <circle cx="50" cy="50" r={r} className={band.ring} strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold ${band.color}`}>{score}</span>
        <span className="text-[10px] text-gray-400">/ 100</span>
      </div>
    </div>
  )
}

function PageRow({ p, onTask }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-100 dark:border-gray-700 last:border-0">
      <button onClick={() => setOpen(o => !o)} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 text-left">
        <span className={`text-sm font-bold w-9 flex-shrink-0 ${p.error ? 'text-red-500' : pageColor(p.score)}`}>{p.error ? '✕' : p.score}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{shortUrl(p.url)}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{p.title || (p.error ? `No cargó (HTTP ${p.status || '?'})` : 'Sin título')}</p>
        </div>
        {p.issues?.length > 0 && <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 rounded-full px-2 py-0.5 flex-shrink-0">{p.issues.length}</span>}
        <span className="text-gray-400 text-xs flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 pl-16 space-y-1.5">
          {p.issues?.length ? p.issues.map((iss, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${SEV[iss.sev]?.cls}`}>{SEV[iss.sev]?.label}</span>
              <span className="text-xs text-gray-600 dark:text-gray-300">{iss.msg}</span>
            </div>
          )) : <p className="text-xs text-green-600 dark:text-green-400">Sin problemas detectados 🎉</p>}
          <a href={p.url} target="_blank" rel="noreferrer" className="text-xs text-primary-600 dark:text-primary-400 hover:underline inline-block mt-1">Abrir página ↗</a>
        </div>
      )}
    </div>
  )
}

export default function OnPageTab({ projectId, projects }) {
  const [audits, setAudits]   = useState([])
  const [active, setActive]   = useState(null)
  const [running, setRunning] = useState(false)
  const [taskModal, setTaskModal] = useState(null)
  const pollRef = useRef(null)

  const selectedProject = projects.find(p => String(p.id) === projectId)
  const noUrl = selectedProject && !selectedProject.websiteUrl

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  function startPolling(auditId) {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const r = await api.get(`/marketing/projects/${projectId}/onpage/audits/${auditId}`)
        setActive(r.data)
        if (r.data.status !== 'running' && r.data.status !== 'pending') {
          stopPolling(); setRunning(false)
          setAudits(prev => [r.data, ...prev.filter(a => a.id !== r.data.id)])
        }
      } catch { stopPolling(); setRunning(false) }
    }, 3000)
  }

  const loadDetail = useCallback(async (projId, id) => {
    try { const r = await api.get(`/marketing/projects/${projId}/onpage/audits/${id}`); setActive(r.data) } catch {}
  }, [])

  const loadAudits = useCallback((pid) => {
    if (!pid) return
    api.get(`/marketing/projects/${pid}/onpage/audits`).then(r => {
      setAudits(r.data)
      const latest = r.data[0]
      if (latest?.status === 'running' || latest?.status === 'pending') { setRunning(true); startPolling(latest.id) }
      else if (latest?.status === 'completed' || latest?.status === 'failed') loadDetail(pid, latest.id)
    }).catch(() => {})
  }, []) // eslint-disable-line

  useEffect(() => {
    stopPolling(); setActive(null); setAudits([]); setRunning(false)
    loadAudits(projectId)
    return stopPolling
  }, [projectId, loadAudits])

  async function runAudit() {
    setRunning(true); setActive(null)
    try {
      const r = await api.post(`/marketing/projects/${projectId}/onpage/audit`)
      setActive({ ...r.data, status: 'running' })
      startPolling(r.data.auditId)
    } catch (e) { setRunning(false); alert(e.response?.data?.error || 'No se pudo iniciar la auditoría') }
  }

  async function remove(id) {
    if (!confirm('¿Eliminar esta auditoría?')) return
    try {
      await api.delete(`/marketing/projects/${projectId}/onpage/audits/${id}`)
      setAudits(prev => prev.filter(a => a.id !== id))
      if (active?.id === id) setActive(null)
    } catch {}
  }

  if (!projectId) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
        <div className="text-4xl mb-3">🔬</div>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">Auditoría On-Page</h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mx-auto">
          Elegí un proyecto para rastrear el sitio y revisar title, meta, encabezados, alt, contenido, enlaces rotos y oportunidades de enlazado interno.
        </p>
      </div>
    )
  }

  if (noUrl) {
    return <SetupHintCard icon="🌐" label="Este proyecto no tiene una URL configurada"
      hint="Agregá la URL del sitio para correr la auditoría on-page."
      to={`/my-projects/${selectedProject.id}?infoTab=info`} ctaLabel="Agregar URL en Info →" />
  }

  const isRunning = running || active?.status === 'running' || active?.status === 'pending'
  const failed = active?.status === 'failed'

  return (
    <div className="space-y-5">
      {/* Panel de control */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Auditoría técnica on-page</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 break-all">{selectedProject?.websiteUrl} · hasta 15 páginas</p>
        </div>
        <button onClick={runAudit} disabled={isRunning}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors">
          {isRunning ? 'Analizando…' : audits.length ? '↻ Volver a analizar' : '🔬 Analizar sitio'}
        </button>
      </div>

      {/* Progreso */}
      {isRunning && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 flex flex-col items-center gap-3">
          <LoadingSpinner size="md" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{active?.errorMsg || 'Iniciando…'}</p>
        </div>
      )}

      {failed && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-5 text-sm text-red-700 dark:text-red-300">
          La auditoría falló: {active.errorMsg}
        </div>
      )}

      {/* Resultado */}
      {active?.status === 'completed' && (
        <>
          {/* Score */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-5 flex-wrap">
            <ScoreGauge score={active.score} />
            <div className="min-w-0">
              <p className={`text-lg font-bold ${scoreBand(active.score).color}`}>{scoreBand(active.score).label}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{active.pagesCrawled} página(s) analizada(s) · {active.findings.length} tipo(s) de problema</p>
            </div>
          </div>

          {/* Findings */}
          {active.findings.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700"><h3 className="text-sm font-bold text-gray-900 dark:text-white">Problemas detectados</h3></div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {active.findings.map((f, i) => (
                  <div key={i} className="px-5 py-3 flex items-start gap-3">
                    <span className={`mt-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${SEV[f.severity]?.cls}`}>{SEV[f.severity]?.label}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{f.title} <span className="text-xs text-gray-400 font-normal">· {f.category}</span></p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{f.description}</p>
                      {f.action && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic">→ {f.action}</p>}
                    </div>
                    <button onClick={() => setTaskModal({ title: f.action || f.title })} className="flex-shrink-0 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">+ tarea</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Enlazado interno */}
          {active.linkSuggestions?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700"><h3 className="text-sm font-bold text-gray-900 dark:text-white">🔗 Oportunidades de enlazado interno</h3></div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {active.linkSuggestions.map((s, i) => (
                  <div key={i} className="px-5 py-3 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 dark:text-gray-200">
                        <span className="text-gray-400">Desde</span> {shortUrl(s.from)} <span className="text-gray-400">→ a</span> {shortUrl(s.to)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Ancla: <span className="font-medium">“{s.anchor}”</span> — {s.reason}</p>
                    </div>
                    <button onClick={() => setTaskModal({ title: `Enlazar internamente ${shortUrl(s.from)} → ${shortUrl(s.to)} (ancla "${s.anchor}")` })}
                      className="flex-shrink-0 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">+ tarea</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detalle por página */}
          {active.pages?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700"><h3 className="text-sm font-bold text-gray-900 dark:text-white">Detalle por página</h3></div>
              {[...active.pages].sort((a, b) => (a.error ? -1 : b.error ? 1 : a.score - b.score)).map((p, i) => (
                <PageRow key={i} p={p} onTask={setTaskModal} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Historial */}
      {audits.length > 1 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Historial</p>
          <div className="space-y-1">
            {audits.map(a => (
              <div key={a.id} className={`flex items-center gap-3 px-2 py-1.5 rounded-lg text-sm group ${active?.id === a.id ? 'bg-gray-50 dark:bg-gray-700/50' : ''}`}>
                <button onClick={() => loadDetail(projectId, a.id)} className="flex-1 flex items-center gap-3 text-left">
                  <span className={`font-bold w-8 ${a.status === 'completed' ? pageColor(a.score) : 'text-gray-400'}`}>{a.status === 'completed' ? a.score : '—'}</span>
                  <span className="text-gray-500 dark:text-gray-400">{new Date(a.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  {a.status !== 'completed' && <span className="text-xs text-gray-400">({a.status})</span>}
                </button>
                <button onClick={() => remove(a.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs">🗑</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {taskModal && (
        <CreateTaskModal title={taskModal.title} projectId={projectId} projectName={selectedProject?.name ?? ''} onClose={() => setTaskModal(null)} />
      )}
    </div>
  )
}
