import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../LoadingSpinner'

const PRIO = {
  alta:  { label: 'Alta',  cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  media: { label: 'Media', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  baja:  { label: 'Baja',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
}
const shortUrl = (u) => { try { const x = new URL(u); return x.pathname === '/' ? x.hostname : x.pathname } catch { return u } }

// ─── Crear tarea (prefijo "Contenido -") ───────────────────────────────────────
function CreateTaskModal({ title, projectId, projectName, onClose }) {
  const { user } = useAuth()
  const [description, setDescription] = useState(`Contenido - ${title}`)
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

function GapResult({ gap, onTask }) {
  return (
    <div className="space-y-4">
      {/* Resumen + posición propia */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{gap.keyword}</h3>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {gap.ownUrl
              ? <>Nuestra página: <a href={gap.ownUrl} target="_blank" rel="noreferrer" className="text-primary-600 dark:text-primary-400 hover:underline">{shortUrl(gap.ownUrl)}</a>{gap.ownPosition ? ` · pos #${gap.ownPosition}` : ''}</>
              : 'Todavía no rankeamos con ninguna página'}
          </span>
        </div>
        {gap.summary && <p className="text-sm text-gray-700 dark:text-gray-300">{gap.summary}</p>}
      </div>

      {/* Competidores */}
      {gap.competitors?.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700"><h4 className="text-sm font-bold text-gray-900 dark:text-white">Compite contra</h4></div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {gap.competitors.map((c, i) => (
              <div key={i} className="px-5 py-2.5 flex items-center gap-3">
                <span className="text-xs font-bold text-gray-400 w-6">#{c.position}</span>
                <div className="min-w-0 flex-1">
                  <a href={c.url} target="_blank" rel="noreferrer" className="text-sm text-primary-600 dark:text-primary-400 hover:underline truncate block">{c.domain}</a>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{c.title}</p>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{c.wordCount?.toLocaleString()} palabras · {c.headingsCount} encabezados</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gaps */}
      {gap.gaps?.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700"><h4 className="text-sm font-bold text-gray-900 dark:text-white">Brechas de contenido a cubrir</h4></div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {gap.gaps.map((g, i) => (
              <div key={i} className="px-5 py-3 flex items-start gap-3">
                <span className={`mt-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${PRIO[g.prioridad]?.cls || PRIO.baja.cls}`}>{PRIO[g.prioridad]?.label || '—'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{g.tema} <span className="text-xs text-gray-400 font-normal">· {g.tipo}</span></p>
                  {g.descripcion && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{g.descripcion}</p>}
                </div>
                <button onClick={() => onTask(`Cubrir "${g.tema}" en el contenido de ${gap.keyword}`)} className="flex-shrink-0 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">+ tarea</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Headings sugeridos */}
      {gap.headingsSuggested?.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Encabezados sugeridos para agregar</h4>
          <ul className="space-y-1.5">
            {gap.headingsSuggested.map((h, i) => <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex gap-2"><span className="text-primary-500">+</span>{h}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function ContentGapTab({ projectId, projects }) {
  const [keyword, setKeyword]     = useState('')
  const [trackedKw, setTrackedKw] = useState([])
  const [list, setList]           = useState([])
  const [active, setActive]       = useState(null)
  const [running, setRunning]     = useState(false)
  const [err, setErr]             = useState('')
  const [taskModal, setTaskModal] = useState(null)
  const pollRef = useRef(null)

  const selectedProject = projects.find(p => String(p.id) === projectId)

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  function startPolling(gapId) {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const r = await api.get(`/marketing/projects/${projectId}/content-gaps/${gapId}`)
        setActive(r.data)
        if (r.data.status !== 'running' && r.data.status !== 'pending') {
          stopPolling(); setRunning(false)
          setList(prev => [{ id: r.data.id, keyword: r.data.keyword, status: r.data.status, createdAt: r.data.createdAt }, ...prev.filter(g => g.id !== r.data.id)])
        }
      } catch { stopPolling(); setRunning(false) }
    }, 3000)
  }

  const loadList = useCallback((pid) => {
    if (!pid) return
    setActive(null); setErr('')
    Promise.all([
      api.get(`/marketing/projects/${pid}/content-gaps`).then(r => r.data).catch(() => []),
      api.get(`/marketing/projects/${pid}/keywords`).then(r => r.data).catch(() => []),
    ]).then(([gaps, kws]) => {
      setList(gaps)
      setTrackedKw(Array.isArray(kws) ? kws : (kws?.keywords ?? []))
      const latest = gaps[0]
      if (latest?.status === 'running' || latest?.status === 'pending') { setRunning(true); startPolling(latest.id) }
    })
  }, []) // eslint-disable-line

  useEffect(() => { stopPolling(); setKeyword(''); setList([]); setRunning(false); loadList(projectId); return stopPolling }, [projectId, loadList])

  async function openGap(id) {
    try { const r = await api.get(`/marketing/projects/${projectId}/content-gaps/${id}`); setActive(r.data) } catch {}
  }

  async function run() {
    const kw = keyword.trim(); if (!kw) return
    setRunning(true); setErr(''); setActive(null)
    try {
      const r = await api.post(`/marketing/projects/${projectId}/content-gap`, { keyword: kw })
      setActive({ ...r.data, status: 'running' })
      startPolling(r.data.gapId)
      setKeyword('')
    } catch (e) { setRunning(false); setErr(e.response?.data?.error || 'No se pudo iniciar el análisis') }
  }

  async function remove(id, e) {
    e.stopPropagation()
    if (!confirm('¿Eliminar este análisis?')) return
    try { await api.delete(`/marketing/projects/${projectId}/content-gaps/${id}`); setList(prev => prev.filter(g => g.id !== id)); if (active?.id === id) setActive(null) } catch {}
  }

  if (!projectId) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
        <div className="text-4xl mb-3">🆚</div>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">Content Gap</h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mx-auto">
          Elegí un proyecto para comparar tu contenido contra el de los competidores que rankean en Google y descubrir qué temas te faltan.
        </p>
      </div>
    )
  }

  const isRunning = running || active?.status === 'running' || active?.status === 'pending'

  return (
    <div className="space-y-5">
      {/* Generador */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Keyword a analizar contra la competencia</label>
        <div className="flex gap-2 flex-wrap">
          <input value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && !isRunning && run()}
            list="gap-kw" placeholder="ej: software de gestión para agencias"
            className="flex-1 min-w-[240px] border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <datalist id="gap-kw">{trackedKw.map(k => <option key={k.id} value={k.query} />)}</datalist>
          <button onClick={run} disabled={isRunning || !keyword.trim()}
            className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">
            {isRunning ? 'Analizando…' : '🆚 Analizar brecha'}
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Lee el SERP + crawlea las páginas top y compara con la tuya. Requiere SerpAPI y consume tokens de IA.</p>
        {err && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{err}</p>}
      </div>

      {isRunning && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 flex flex-col items-center gap-3">
          <LoadingSpinner size="md" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{active?.errorMsg || 'Iniciando…'}</p>
        </div>
      )}

      {active?.status === 'failed' && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-5 text-sm text-red-700 dark:text-red-300">El análisis falló: {active.errorMsg}</div>
      )}

      <div className="grid lg:grid-cols-[220px_1fr] gap-5">
        {/* Historial */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Análisis</p>
          {list.length === 0 ? <p className="text-xs text-gray-400 dark:text-gray-500">Todavía no corriste ninguno.</p> : list.map(g => (
            <button key={g.id} onClick={() => openGap(g.id)}
              className={`w-full text-left px-3 py-2 rounded-lg border text-sm flex items-center justify-between gap-2 group transition-colors ${
                active?.id === g.id ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
              <span className="truncate">{g.keyword}{g.status !== 'completed' ? ` · ${g.status}` : ''}</span>
              <span onClick={e => remove(g.id, e)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs flex-shrink-0">🗑</span>
            </button>
          ))}
        </div>

        {/* Detalle */}
        <div>
          {active?.status === 'completed'
            ? <GapResult gap={active} onTask={(title) => setTaskModal({ title })} />
            : !isRunning && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-10 text-center">
                <div className="text-3xl mb-2">🆚</div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Analizá una keyword o elegí uno del historial.</p>
              </div>
            )}
        </div>
      </div>

      {taskModal && <CreateTaskModal title={taskModal.title} projectId={projectId} projectName={selectedProject?.name ?? ''} onClose={() => setTaskModal(null)} />}
    </div>
  )
}
