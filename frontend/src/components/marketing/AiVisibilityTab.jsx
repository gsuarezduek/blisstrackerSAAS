import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'
import { Search, Plus, Trash2, CircleCheck, Circle, Info } from 'lucide-react'
import { Icon } from '../ui/Icon'

// Visibilidad IA (#1/#5): a diferencia de GEO/On-Page (que analizan el sitio
// propio), esto le pregunta a un LLM CON búsqueda web real preguntas típicas del
// rubro y mide si la marca aparece citada — y en qué posición relativa a los
// competidores configurados. v1 es manual on-demand (sin cron), con tope duro de
// preguntas/competidores por proyecto (control de costo: usa claude-sonnet-5 +
// búsqueda web, más caro que el resto de GEO que corre en Haiku sin búsqueda).

const MAX_POLL_MS = 5 * 60 * 1000

function Cap({ count, max }) {
  return <span className="text-xs text-gray-400 dark:text-gray-500">{count}/{max}</span>
}

function PromptRow({ prompt, onToggle, onDelete }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 group">
      <button onClick={() => onToggle(prompt)} title={prompt.active ? 'Desactivar' : 'Activar'} className="flex-shrink-0">
        <Icon as={prompt.active ? CircleCheck : Circle} size={18} className={prompt.active ? 'text-primary-500' : 'text-gray-300 dark:text-gray-600'} />
      </button>
      <p className={`text-sm flex-1 min-w-0 truncate ${prompt.active ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500 line-through'}`}>{prompt.query}</p>
      <button onClick={() => onDelete(prompt)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 flex-shrink-0" title="Eliminar" aria-label="Eliminar">
        <Icon as={Trash2} size={14} />
      </button>
    </div>
  )
}

function CompetitorRow({ competitor, onDelete }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 group">
      <p className="text-sm flex-1 min-w-0 truncate text-gray-800 dark:text-gray-200">
        {competitor.name}
        {competitor.domain && <span className="text-gray-400 dark:text-gray-500"> · {competitor.domain}</span>}
      </p>
      <button onClick={() => onDelete(competitor)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 flex-shrink-0" title="Eliminar" aria-label="Eliminar">
        <Icon as={Trash2} size={14} />
      </button>
    </div>
  )
}

function ResultRow({ result }) {
  const [open, setOpen] = useState(false)
  const mentionedCompetitors = (result.competitorsMentioned || []).filter(c => c.mentioned)
  return (
    <div className="border-b border-gray-100 dark:border-gray-700 last:border-0">
      <button onClick={() => setOpen(o => !o)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40">
        <Icon as={result.ownMentioned ? CircleCheck : Circle} size={18} className={`flex-shrink-0 ${result.ownMentioned ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{result.prompt.query}</p>
          <p className={`text-xs mt-0.5 ${result.ownMentioned ? 'text-green-600 dark:text-green-400 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
            {result.ownMentioned ? `Mencionada${result.ownPosition ? ` · posición ${result.ownPosition}` : ''}` : 'No mencionada'}
            {mentionedCompetitors.length > 0 && <span className="text-gray-400 dark:text-gray-500 font-normal"> · {mentionedCompetitors.length} competidor(es) también mencionados</span>}
          </p>
        </div>
        <span className="text-gray-400 text-xs flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 pl-10 space-y-2">
          {result.rawAnswerExcerpt && (
            <p className="text-xs text-gray-500 dark:text-gray-400 italic">&ldquo;{result.rawAnswerExcerpt}&rdquo;</p>
          )}
          {result.competitorsMentioned?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {result.competitorsMentioned.map(c => (
                <span key={c.id} className={`text-xs px-2 py-0.5 rounded-full ${c.mentioned ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'}`}>
                  {c.name}{c.mentioned && c.position ? ` (#${c.position})` : ''}
                </span>
              ))}
            </div>
          )}
          {result.sources?.length > 0 && (
            <div className="space-y-0.5">
              {result.sources.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer" className="text-xs text-primary-600 dark:text-primary-400 hover:underline block truncate">
                  {s.title || s.url} ↗
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AiVisibilityTab({ projectId, projects }) {
  const [prompts,     setPrompts]     = useState([])
  const [competitors, setCompetitors] = useState([])
  const [newPrompt,     setNewPrompt]     = useState('')
  const [newCompetitor, setNewCompetitor] = useState('')
  const [newDomain,     setNewDomain]     = useState('')

  const [runs,    setRuns]    = useState([])
  const [active,  setActive]  = useState(null)
  const [running, setRunning] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [error,   setError]   = useState(null)
  const pollRef      = useRef(null)
  const pollStartRef = useRef(null)

  const selectedProject = projects.find(p => String(p.id) === projectId)

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  function startPolling(runId, startedAt) {
    stopPolling()
    setTimedOut(false)
    pollStartRef.current = startedAt ? new Date(startedAt).getTime() : Date.now()
    pollRef.current = setInterval(async () => {
      if (Date.now() - pollStartRef.current > MAX_POLL_MS) {
        stopPolling(); setRunning(false); setTimedOut(true)
        return
      }
      try {
        const r = await api.get(`/marketing/projects/${projectId}/visibility/runs/${runId}`)
        setActive(r.data)
        if (r.data.status !== 'running' && r.data.status !== 'pending') {
          stopPolling(); setRunning(false)
          setRuns(prev => [r.data, ...prev.filter(x => x.id !== r.data.id)])
        }
      } catch { stopPolling(); setRunning(false) }
    }, 3000)
  }

  const loadAll = useCallback((pid) => {
    if (!pid) return
    api.get(`/marketing/projects/${pid}/visibility/prompts`).then(r => setPrompts(r.data)).catch(() => {})
    api.get(`/marketing/projects/${pid}/visibility/competitors`).then(r => setCompetitors(r.data)).catch(() => {})
    api.get(`/marketing/projects/${pid}/visibility/runs`).then(r => {
      setRuns(r.data)
      const latest = r.data[0]
      if (latest?.status === 'running' || latest?.status === 'pending') {
        setRunning(true)
        api.get(`/marketing/projects/${pid}/visibility/runs/${latest.id}`).then(d => setActive(d.data)).catch(() => {})
        startPolling(latest.id, latest.createdAt)
      } else if (latest?.status === 'completed') {
        api.get(`/marketing/projects/${pid}/visibility/runs/${latest.id}`).then(d => setActive(d.data)).catch(() => {})
      }
    }).catch(() => {})
  }, []) // eslint-disable-line

  useEffect(() => {
    stopPolling(); setActive(null); setRuns([]); setRunning(false); setTimedOut(false); setError(null)
    loadAll(projectId)
    return stopPolling
  }, [projectId, loadAll])

  async function addPrompt(e) {
    e.preventDefault()
    const query = newPrompt.trim()
    if (!query) return
    try {
      const r = await api.post(`/marketing/projects/${projectId}/visibility/prompts`, { query })
      setPrompts(prev => [...prev, r.data])
      setNewPrompt('')
    } catch (err) { alert(err.response?.data?.error || 'No se pudo agregar la pregunta') }
  }

  async function togglePrompt(prompt) {
    try {
      const r = await api.patch(`/marketing/projects/${projectId}/visibility/prompts/${prompt.id}`, { active: !prompt.active })
      setPrompts(prev => prev.map(p => p.id === prompt.id ? r.data : p))
    } catch (err) { alert(err.response?.data?.error || 'No se pudo actualizar la pregunta') }
  }

  async function deletePrompt(prompt) {
    if (!confirm('¿Eliminar esta pregunta?')) return
    try {
      await api.delete(`/marketing/projects/${projectId}/visibility/prompts/${prompt.id}`)
      setPrompts(prev => prev.filter(p => p.id !== prompt.id))
    } catch {}
  }

  async function addCompetitor(e) {
    e.preventDefault()
    const name = newCompetitor.trim()
    if (!name) return
    try {
      const r = await api.post(`/marketing/projects/${projectId}/visibility/competitors`, { name, domain: newDomain.trim() || undefined })
      setCompetitors(prev => [...prev, r.data])
      setNewCompetitor(''); setNewDomain('')
    } catch (err) { alert(err.response?.data?.error || 'No se pudo agregar el competidor') }
  }

  async function deleteCompetitor(competitor) {
    if (!confirm('¿Eliminar este competidor?')) return
    try {
      await api.delete(`/marketing/projects/${projectId}/visibility/competitors/${competitor.id}`)
      setCompetitors(prev => prev.filter(c => c.id !== competitor.id))
    } catch {}
  }

  async function runCheck() {
    setRunning(true); setActive(null); setTimedOut(false); setError(null)
    try {
      const r = await api.post(`/marketing/projects/${projectId}/visibility/runs`)
      setActive({ ...r.data, status: 'pending' })
      startPolling(r.data.id, r.data.createdAt)
    } catch (err) {
      setRunning(false)
      setError(err.response?.data?.error || 'No se pudo iniciar la corrida')
    }
  }

  async function loadRun(id) {
    try { const r = await api.get(`/marketing/projects/${projectId}/visibility/runs/${id}`); setActive(r.data) } catch {}
  }

  async function removeRun(id) {
    if (!confirm('¿Eliminar esta corrida?')) return
    try {
      await api.delete(`/marketing/projects/${projectId}/visibility/runs/${id}`)
      setRuns(prev => prev.filter(r => r.id !== id))
      if (active?.id === id) setActive(null)
    } catch {}
  }

  if (!projectId) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
        <div className="mb-3"><Icon as={Search} size={32} className="inline-block text-gray-300 dark:text-gray-600" /></div>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">Visibilidad IA</h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mx-auto">
          Elegí un proyecto para probar si su marca aparece citada cuando un LLM busca en la web preguntas típicas del rubro.
        </p>
      </div>
    )
  }

  const activePrompts = prompts.filter(p => p.active)
  const isRunning = running || active?.status === 'running' || active?.status === 'pending'
  const failed = active?.status === 'failed'
  const resultsByOwn = active?.results ? active.results.filter(r => r.ownMentioned).length : 0

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-2xl p-4 flex items-start gap-2.5">
        <Icon as={Info} size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Cada corrida usa un modelo con búsqueda web real (más caro que el resto de GEO) — por eso es manual, no automática, y hay un tope de {5} preguntas y {4} competidores por proyecto.
        </p>
      </div>

      {/* Config: preguntas */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Preguntas a testear</h3>
          <Cap count={activePrompts.length} max={5} />
        </div>
        {prompts.length > 0 && (
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {prompts.map(p => <PromptRow key={p.id} prompt={p} onToggle={togglePrompt} onDelete={deletePrompt} />)}
          </div>
        )}
        <form onSubmit={addPrompt} className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-700">
          <input value={newPrompt} onChange={e => setNewPrompt(e.target.value)} maxLength={300} placeholder='Ej: "¿Cuál es la mejor agencia de marketing en Córdoba?"'
            className="flex-1 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <button type="submit" disabled={!newPrompt.trim() || activePrompts.length >= 5} className="flex-shrink-0 p-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white rounded-lg">
            <Icon as={Plus} size={16} />
          </button>
        </form>
      </div>

      {/* Config: competidores */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Competidores a detectar</h3>
          <Cap count={competitors.length} max={4} />
        </div>
        {competitors.length > 0 && (
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {competitors.map(c => <CompetitorRow key={c.id} competitor={c} onDelete={deleteCompetitor} />)}
          </div>
        )}
        <form onSubmit={addCompetitor} className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-700">
          <input value={newCompetitor} onChange={e => setNewCompetitor(e.target.value)} maxLength={120} placeholder="Nombre de la marca"
            className="flex-1 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="dominio.com (opcional)"
            className="w-44 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <button type="submit" disabled={!newCompetitor.trim() || competitors.length >= 4} className="flex-shrink-0 p-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white rounded-lg">
            <Icon as={Plus} size={16} />
          </button>
        </form>
      </div>

      {/* Correr */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Probar visibilidad</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {activePrompts.length ? `${activePrompts.length} pregunta(s) activa(s)` : 'Agregá al menos una pregunta activa'}
          </p>
        </div>
        <button onClick={runCheck} disabled={isRunning || !activePrompts.length}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors">
          {isRunning ? 'Probando…' : runs.length ? 'Volver a probar' : 'Probar visibilidad'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-5 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      {isRunning && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 flex flex-col items-center gap-3">
          <LoadingSpinner size="md" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{active?.errorMsg || 'Iniciando…'}</p>
        </div>
      )}

      {failed && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-5 text-sm text-red-700 dark:text-red-300">
          La corrida falló: {active.errorMsg}
        </div>
      )}

      {timedOut && !isRunning && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-5 text-sm text-red-700 dark:text-red-300">
          La corrida está tardando más de lo esperado. Volvé a intentar en unos minutos.
        </div>
      )}

      {/* Resultado */}
      {active?.status === 'completed' && active.results?.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Resultado</h3>
            <span className="text-xs text-gray-400 dark:text-gray-500">Mencionada en {resultsByOwn}/{active.results.length} pregunta(s)</span>
          </div>
          <div>
            {active.results.map(r => <ResultRow key={r.id} result={r} />)}
          </div>
        </div>
      )}

      {/* Historial */}
      {runs.length > 1 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Historial</p>
          <div className="space-y-1">
            {runs.map(r => (
              <div key={r.id} className={`flex items-center gap-3 px-2 py-1.5 rounded-lg text-sm group ${active?.id === r.id ? 'bg-gray-50 dark:bg-gray-700/50' : ''}`}>
                <button onClick={() => loadRun(r.id)} className="flex-1 flex items-center gap-3 text-left">
                  <span className="text-gray-500 dark:text-gray-400">{new Date(r.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-xs text-gray-400">({r.status === 'completed' ? `${r._count?.results ?? 0} pregunta(s)` : r.status})</span>
                </button>
                <button onClick={() => removeRun(r.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs" title="Eliminar" aria-label="Eliminar">
                  <Icon as={Trash2} size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
