import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../LoadingSpinner'

// ─── Crear tarea (prefijo "Contenido -") ───────────────────────────────────────
function CreateTaskModal({ title, projectId, projectName, onClose }) {
  const { user } = useAuth()
  const [description, setDescription] = useState(`Contenido - ${title}`)
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
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Proyecto: <span className="font-medium text-gray-600 dark:text-gray-300">{projectName}</span></p>
        {done ? (
          <div className="flex flex-col items-center py-6 gap-2">
            <span className="text-3xl">✅</span>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Tarea creada</p>
          </div>
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

// ─── Render del brief ──────────────────────────────────────────────────────────
function Chips({ items }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <span key={i} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full px-2.5 py-1">{t}</span>
      ))}
    </div>
  )
}

function briefToText(keyword, c) {
  const lines = [`# Content Brief — ${keyword}`, '']
  if (c.titulo) lines.push(`Título (H1): ${c.titulo}`)
  if (c.metaDescription) lines.push(`Meta description: ${c.metaDescription}`)
  if (c.intencion) lines.push(`Intención: ${c.intencion}`)
  if (c.audiencia) lines.push(`Audiencia: ${c.audiencia}`)
  if (c.anguloDiferencial) lines.push(`Ángulo diferencial: ${c.anguloDiferencial}`)
  if (c.longitudObjetivo) lines.push(`Longitud objetivo: ~${c.longitudObjetivo} palabras`)
  lines.push('', '## Estructura')
  ;(c.estructura || []).forEach(s => lines.push(`${s.h === 3 ? '  - H3' : '- H2'}: ${s.titulo}${s.nota ? ` — ${s.nota}` : ''}`))
  if (c.preguntas?.length) { lines.push('', '## Preguntas a responder'); c.preguntas.forEach(q => lines.push(`- ${q}`)) }
  if (c.entidades?.length) { lines.push('', '## Entidades / keywords semánticas'); lines.push(c.entidades.join(', ')) }
  if (c.enlacesInternos) lines.push('', `Enlaces internos: ${c.enlacesInternos}`)
  if (c.notasEEAT) lines.push('', `E-E-A-T: ${c.notasEEAT}`)
  return lines.join('\n')
}

function BriefView({ keyword, content, onTask }) {
  const c = content || {}
  const copy = () => navigator.clipboard?.writeText(briefToText(keyword, c))
  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs text-gray-400 dark:text-gray-500">Keyword objetivo</p>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{keyword}</h3>
          </div>
          <div className="flex gap-2">
            <button onClick={copy} className="text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">📋 Copiar</button>
            <button onClick={() => onTask(`Escribir "${c.titulo || keyword}"`)} className="text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg px-3 py-1.5 transition-colors">+ tarea</button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          {c.titulo && <Field label="Título (H1)" value={c.titulo} />}
          {c.metaDescription && <Field label="Meta description" value={c.metaDescription} />}
          {c.intencion && <Field label="Intención" value={c.intencion} />}
          {c.longitudObjetivo && <Field label="Longitud objetivo" value={`~${c.longitudObjetivo} palabras`} />}
          {c.audiencia && <Field label="Audiencia" value={c.audiencia} full />}
          {c.anguloDiferencial && <Field label="Ángulo diferencial" value={c.anguloDiferencial} full />}
        </div>
      </div>

      {/* Estructura */}
      {c.estructura?.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">🧱 Estructura de encabezados</h4>
          <div className="space-y-1.5">
            {c.estructura.map((s, i) => (
              <div key={i} className={s.h === 3 ? 'pl-6' : ''}>
                <p className="text-sm text-gray-800 dark:text-gray-200">
                  <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 mr-1.5">H{s.h || 2}</span>
                  {s.titulo}
                </p>
                {s.nota && <p className="text-xs text-gray-400 dark:text-gray-500 pl-6">{s.nota}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preguntas + entidades */}
      <div className="grid md:grid-cols-2 gap-4">
        {c.preguntas?.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">❓ Preguntas a responder</h4>
            <ul className="space-y-1.5">
              {c.preguntas.map((q, i) => <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex gap-2"><span className="text-primary-500">·</span>{q}</li>)}
            </ul>
          </div>
        )}
        {c.entidades?.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">🔗 Entidades / keywords semánticas</h4>
            <Chips items={c.entidades} />
          </div>
        )}
      </div>

      {/* Enlaces + E-E-A-T */}
      {(c.enlacesInternos || c.notasEEAT) && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
          {c.enlacesInternos && <Field label="Enlaces internos" value={c.enlacesInternos} full />}
          {c.notasEEAT && <Field label="E-E-A-T (experiencia y autoridad)" value={c.notasEEAT} full />}
        </div>
      )}

      {/* SERP usado */}
      {c.serp && (c.serp.competitors?.length > 0 || c.serp.peopleAlsoAsk?.length > 0) && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-5">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Basado en el SERP actual</h4>
          {c.serp.competitors?.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Compite contra:</p>
              <div className="flex flex-wrap gap-1.5">
                {c.serp.competitors.map((cp, i) => <span key={i} className="text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-0.5 text-gray-600 dark:text-gray-300">{cp.domain}</span>)}
              </div>
            </div>
          )}
          {c.serp.features?.length > 0 && <p className="text-xs text-gray-400 dark:text-gray-500">Features del SERP: {c.serp.features.join(', ')}</p>}
        </div>
      )}
    </div>
  )
}

function Field({ label, value, full }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-sm text-gray-800 dark:text-gray-200 mt-0.5">{value}</p>
    </div>
  )
}

// ─── Tab principal ─────────────────────────────────────────────────────────────
export default function ContentBriefTab({ projectId, projects }) {
  const [keyword, setKeyword]     = useState('')
  const [trackedKw, setTrackedKw] = useState([])
  const [list, setList]           = useState([])
  const [active, setActive]       = useState(null) // { keyword, content }
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [err, setErr]             = useState('')
  const [taskModal, setTaskModal] = useState(null)

  const selectedProject = projects.find(p => String(p.id) === projectId)

  const loadList = useCallback((pid) => {
    if (!pid) return
    setLoading(true); setErr(''); setActive(null)
    Promise.all([
      api.get(`/marketing/projects/${pid}/content-briefs`).then(r => r.data.briefs).catch(() => []),
      api.get(`/marketing/projects/${pid}/keywords`).then(r => r.data).catch(() => []),
    ]).then(([briefs, kws]) => {
      setList(briefs)
      setTrackedKw(Array.isArray(kws) ? kws : (kws?.keywords ?? []))
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { setKeyword(''); setList([]); loadList(projectId) }, [projectId, loadList])

  async function openBrief(id) {
    try {
      const r = await api.get(`/marketing/projects/${projectId}/content-briefs/${id}`)
      setActive(r.data)
    } catch { setErr('No se pudo abrir el brief') }
  }

  async function generate() {
    const kw = keyword.trim()
    if (!kw) return
    setGenerating(true); setErr('')
    try {
      const r = await api.post(`/marketing/projects/${projectId}/content-briefs`, { keyword: kw })
      setActive(r.data)
      setList(prev => [{ id: r.data.id, keyword: r.data.keyword, updatedAt: r.data.updatedAt }, ...prev.filter(b => b.id !== r.data.id)])
      setKeyword('')
    } catch (e) {
      const code = e.response?.data?.code
      setErr(code === 'TOKEN_BUDGET_EXCEEDED'
        ? 'Se agotó el presupuesto mensual de tokens de IA del workspace.'
        : (e.response?.data?.error || 'No se pudo generar el brief. Reintentá en unos minutos.'))
    } finally { setGenerating(false) }
  }

  async function remove(id, e) {
    e.stopPropagation()
    if (!confirm('¿Eliminar este content brief?')) return
    try {
      await api.delete(`/marketing/projects/${projectId}/content-briefs/${id}`)
      setList(prev => prev.filter(b => b.id !== id))
      if (active && list.find(b => b.id === id)?.keyword === active.keyword) setActive(null)
    } catch {}
  }

  if (!projectId) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
        <div className="text-4xl mb-3">✍️</div>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">Content Brief</h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mx-auto">
          Elegí un proyecto para generar briefs de contenido SEO: estructura, preguntas a cubrir, entidades y ángulo diferencial, con el tono y los objetivos del brief del cliente.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Generador */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Keyword objetivo del contenido</label>
        <div className="flex gap-2 flex-wrap">
          <input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !generating && generate()}
            list="tracked-kw"
            placeholder="ej: mejor software de gestión para agencias"
            className="flex-1 min-w-[240px] border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <datalist id="tracked-kw">
            {trackedKw.map(k => <option key={k.id} value={k.query} />)}
          </datalist>
          <button onClick={generate} disabled={generating || !keyword.trim()}
            className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">
            {generating ? 'Generando…' : '✨ Generar brief'}
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
          Usa el SERP actual + los briefs de Marca y SEO/SEM del proyecto. Consume tokens de IA.
        </p>
        {err && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{err}</p>}
      </div>

      {generating && !active && <LoadingSpinner size="lg" />}

      <div className="grid lg:grid-cols-[240px_1fr] gap-5">
        {/* Historial */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Briefs generados</p>
          {loading ? <p className="text-xs text-gray-400">Cargando…</p> : list.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">Todavía no generaste ninguno.</p>
          ) : list.map(b => (
            <button key={b.id} onClick={() => openBrief(b.id)}
              className={`w-full text-left px-3 py-2 rounded-lg border text-sm flex items-center justify-between gap-2 group transition-colors ${
                active?.keyword === b.keyword
                  ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
              <span className="truncate">{b.keyword}</span>
              <span onClick={e => remove(b.id, e)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs flex-shrink-0">🗑</span>
            </button>
          ))}
        </div>

        {/* Detalle */}
        <div>
          {active
            ? <BriefView keyword={active.keyword} content={active.content} onTask={(title) => setTaskModal({ title })} />
            : !generating && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-10 text-center">
                <div className="text-3xl mb-2">📝</div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Generá un brief o elegí uno del historial para verlo acá.</p>
              </div>
            )}
        </div>
      </div>

      {taskModal && (
        <CreateTaskModal title={taskModal.title} projectId={projectId} projectName={selectedProject?.name ?? ''} onClose={() => setTaskModal(null)} />
      )}
    </div>
  )
}
