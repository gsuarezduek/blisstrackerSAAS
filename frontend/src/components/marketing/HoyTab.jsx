import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'

const PRIORITY = {
  high:   { label: 'Alta',  cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  medium: { label: 'Media', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  low:    { label: 'Baja',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
}
const CATEGORY_ICON = {
  GEO: '🤖', 'Canibalización': '⚠️', Performance: '⚡', Keywords: '🔑',
  Objetivos: '🎯', Contenido: '🗓️', 'Meta Ads': '📣', 'Google Ads': '📣',
}

/**
 * Panel único "Hoy": agrega los pendientes accionables de todas las áreas de
 * Marketing (SEO/GEO, Objetivos, Contenido, Ads Advisor) en un solo backlog, con el
 * mismo patrón de selección múltiple + creación de tareas en masa que ya prueba
 * ActionPlanTab.jsx.
 */
export default function HoyTab({ projectId, onSelectProject, onNavigate }) {
  if (!projectId) return <WorkspacePending onSelectProject={onSelectProject} />
  return <ProjectPending projectId={projectId} onNavigate={onNavigate} />
}

function WorkspacePending({ onSelectProject }) {
  const [projects, setProjects] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get('/marketing/summary/pending')
      .then(r => setProjects(r.data.projects))
      .catch(e => setErr(e.response?.data?.error || 'Error al cargar los pendientes'))
  }, [])

  if (err) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
      <div className="text-3xl mb-3">⚠️</div>
      <p className="text-sm text-gray-600 dark:text-gray-300">{err}</p>
    </div>
  )
  if (projects === null) return <LoadingSpinner size="lg" />

  if (projects.length === 0) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
      <div className="text-4xl mb-3">🎉</div>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">Todo al día</h3>
      <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mx-auto">
        No hay pendientes de SEO, objetivos, contenido ni Ads en ningún proyecto activo.
      </p>
    </div>
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
      {projects.map(p => (
        <button
          key={p.projectId}
          onClick={() => onSelectProject?.(String(p.projectId))}
          className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
        >
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{p.projectName}</span>
          <span className="flex items-center gap-2 flex-shrink-0">
            {p.high > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                {p.high} alta{p.high === 1 ? '' : 's'}
              </span>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500">{p.total} pendiente{p.total === 1 ? '' : 's'}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

function ProjectPending({ projectId, onNavigate }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [creating, setCreating] = useState(false)
  const [result, setResult]     = useState(null)

  const load = useCallback((pid) => {
    if (!pid) return
    setLoading(true); setErr(''); setData(null); setSelected(new Set()); setResult(null)
    api.get(`/marketing/projects/${pid}/pending`)
      .then(r => setData(r.data))
      .catch(e => setErr(e.response?.data?.error || 'Error al cargar los pendientes'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(projectId) }, [projectId, load])

  function toggle(key) {
    setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function toggleAll() {
    if (!data) return
    setSelected(prev => prev.size === data.items.length ? new Set() : new Set(data.items.map(i => i.key)))
  }

  async function createTasks() {
    if (!data || selected.size === 0) return
    setCreating(true)
    const chosen = data.items.filter(i => selected.has(i.key))
    let created = 0
    for (const it of chosen) {
      try {
        await api.post('/tasks', { description: `${it.taskPrefix} - ${it.title}`, projectId: String(projectId) })
        created++
      } catch {}
    }
    setCreating(false)
    setResult({ created })
    setSelected(new Set())
  }

  if (loading) return <LoadingSpinner size="lg" />
  if (err) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
      <div className="text-3xl mb-3">⚠️</div>
      <p className="text-sm text-gray-600 dark:text-gray-300">{err}</p>
    </div>
  )
  if (!data) return null

  const { items } = data

  if (items.length === 0) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
      <div className="text-3xl mb-2">✅</div>
      <p className="text-sm text-gray-600 dark:text-gray-300">No hay pendientes en este proyecto ahora mismo.</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">SEO/GEO, objetivos, contenido y Ads se revisan automáticamente acá.</p>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Barra de acciones */}
      <div className="flex items-center justify-between gap-3 flex-wrap sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 py-1">
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleAll}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
          Seleccionar todo ({items.length})
        </label>
        <div className="flex items-center gap-3">
          {result && <span className="text-xs text-green-600 dark:text-green-400 font-medium">✅ {result.created} tarea(s) creada(s)</span>}
          <button onClick={createTasks} disabled={selected.size === 0 || creating}
            className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">
            {creating ? 'Creando…' : `Crear ${selected.size || ''} tarea${selected.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
        {items.map(it => (
          <div key={it.key} className={`flex items-start gap-3 px-5 py-3.5 ${selected.has(it.key) ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}>
            <input type="checkbox" checked={selected.has(it.key)} onChange={() => toggle(it.key)}
              className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500 flex-shrink-0 cursor-pointer" />
            <div className="min-w-0 flex-1 cursor-pointer" onClick={() => toggle(it.key)}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${PRIORITY[it.priority].cls}`}>{PRIORITY[it.priority].label}</span>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">{CATEGORY_ICON[it.category] ?? ''} {it.category}</span>
              </div>
              <p className="text-sm text-gray-800 dark:text-gray-200 mt-1">{it.title}</p>
              {it.detail && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{it.detail}</p>}
            </div>
            {it.href ? (
              <Link to={it.href} className="flex-shrink-0 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">Ir →</Link>
            ) : it.link ? (
              <button onClick={() => onNavigate?.(it.link)} className="flex-shrink-0 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">Ir →</button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
