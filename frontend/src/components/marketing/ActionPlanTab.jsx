import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'

const PRIORITY = {
  high:   { label: 'Alta',  cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  medium: { label: 'Media', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  low:    { label: 'Baja',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
}
const CATEGORY_ICON = { GEO: '🤖', 'Canibalización': '⚠️', Performance: '⚡', Keywords: '🔑' }

function timeAgo(date) {
  if (!date) return ''
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'hace 1 día'
  if (days < 30) return `hace ${days} días`
  return `hace ${Math.floor(days / 30)} mes(es)`
}

export default function ActionPlanTab({ projectId, projects }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [creating, setCreating] = useState(false)
  const [result, setResult]     = useState(null) // { created }

  const selectedProject = projects.find(p => String(p.id) === projectId)

  const load = useCallback((pid) => {
    if (!pid) return
    setLoading(true); setErr(''); setData(null); setSelected(new Set()); setResult(null)
    api.get(`/marketing/projects/${pid}/seo/action-plan`)
      .then(r => setData(r.data))
      .catch(e => setErr(e.response?.data?.error || 'Error al cargar el plan de acción'))
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
        await api.post('/tasks', { description: `SEO - ${it.title}`, projectId: String(projectId) })
        created++
      } catch {}
    }
    setCreating(false)
    setResult({ created })
    setSelected(new Set())
  }

  if (!projectId) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
        <div className="text-4xl mb-3">📋</div>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">Plan de acción SEO</h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mx-auto">
          Elegí un proyecto para ver un backlog priorizado con todo lo que hay para mejorar: GEO, canibalización, performance y keywords a distancia de golpe.
        </p>
      </div>
    )
  }

  if (loading) return <LoadingSpinner size="lg" />
  if (err) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
      <div className="text-3xl mb-3">⚠️</div>
      <p className="text-sm text-gray-600 dark:text-gray-300">{err}</p>
    </div>
  )
  if (!data) return null

  const { items, focus, sources } = data
  const hasFocus = focus?.objetivo || focus?.servicios_posicionar

  return (
    <div className="space-y-5">
      {/* Foco del cliente (brief SEO/SEM) */}
      {hasFocus && (
        <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-2xl px-5 py-4">
          <p className="text-xs font-semibold text-primary-700 dark:text-primary-300 uppercase tracking-wide mb-1">🎯 Foco del cliente (brief)</p>
          {focus.objetivo && <p className="text-sm text-gray-700 dark:text-gray-200"><span className="text-gray-400">Objetivo:</span> {focus.objetivo}</p>}
          {focus.servicios_posicionar && <p className="text-sm text-gray-700 dark:text-gray-200 mt-0.5"><span className="text-gray-400">A posicionar:</span> {focus.servicios_posicionar}</p>}
        </div>
      )}

      {/* Fuentes usadas */}
      <div className="flex flex-wrap gap-2 text-xs">
        <SourceChip on={sources.geo.present} icon="🤖" label={sources.geo.present ? `GEO ${sources.geo.score ?? ''} · ${timeAgo(sources.geo.date)}` : 'GEO sin auditar'} />
        <SourceChip on={sources.cannibal.present} icon="⚠️" label={sources.cannibal.present ? `Canibalización · ${timeAgo(sources.cannibal.date)}` : 'Canibalización sin correr'} />
        <SourceChip on={sources.pagespeed.present} icon="⚡" label={sources.pagespeed.present ? `Performance ${sources.pagespeed.mobile ?? '?'}/${sources.pagespeed.desktop ?? '?'}` : 'Performance sin medir'} />
        <SourceChip on={sources.keywords.present} icon="🔑" label={sources.keywords.present ? `${sources.keywords.count} keywords cerca` : 'Sin keywords trackeadas'} />
      </div>

      {items.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
          <div className="text-3xl mb-2">✅</div>
          <p className="text-sm text-gray-600 dark:text-gray-300">No hay acciones pendientes con los diagnósticos actuales.</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Corré una auditoría GEO, un análisis de canibalización o PageSpeed para alimentar el plan.</p>
        </div>
      ) : (
        <>
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
              <label key={it.key} className={`flex items-start gap-3 px-5 py-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 ${selected.has(it.key) ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}`}>
                <input type="checkbox" checked={selected.has(it.key)} onChange={() => toggle(it.key)}
                  className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${PRIORITY[it.priority].cls}`}>{PRIORITY[it.priority].label}</span>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">{CATEGORY_ICON[it.category] ?? ''} {it.category}</span>
                    {it.focus && <span className="text-[11px] font-medium text-primary-600 dark:text-primary-400">🎯 foco</span>}
                  </div>
                  <p className="text-sm text-gray-800 dark:text-gray-200 mt-1">{it.title}</p>
                  {it.detail && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{it.detail}</p>}
                </div>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">Las tareas se crean en el proyecto <span className="font-medium">{selectedProject?.name}</span> con el prefijo "SEO -" y quedan asignadas a vos.</p>
        </>
      )}
    </div>
  )
}

function SourceChip({ on, icon, label }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border ${on
      ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
      : 'bg-gray-50 dark:bg-gray-800/50 border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500'}`}>
      <span>{icon}</span>{label}
    </span>
  )
}
