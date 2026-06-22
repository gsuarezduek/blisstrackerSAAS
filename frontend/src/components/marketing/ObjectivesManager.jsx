import { useState, useEffect } from 'react'
import api from '../../api/client'
import {
  CATEGORIES, METRICS, PERIODICITIES, AD_PLATFORMS, RRSS_PLATFORMS, PLATFORM_LABEL,
  metricsForCategory, fmtObjectiveValue, PERIODICITY_LABEL, CATEGORY_LABEL,
} from './objectiveCatalog'

const EMPTY_DRAFT = {
  category: '', metric: '', periodicity: 'monthly',
  target: '', platform: '', trackedKeywordId: '', competitorId: '',
}

// Plataforma por defecto al elegir una métrica: ads requiere una; rrss arranca en "todas" ('').
function defaultPlatformFor(metric, current) {
  const def = METRICS[metric]
  if (def?.param === 'platform') return AD_PLATFORMS.some(p => p.key === current) ? current : 'meta_ads'
  if (def?.rrssPlatform)         return RRSS_PLATFORMS.some(p => p.key === current) ? current : ''
  return current
}

// ─── Formulario de alta/edición ────────────────────────────────────────────────

function ObjectiveForm({ projectId, initial, keywords, competitors, igConnection, onSaved, onCancel }) {
  const [draft, setDraft]   = useState(initial || EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  const metricDef = draft.metric ? METRICS[draft.metric] : null
  const isEdit = !!initial?.id

  // Alcance y visualizaciones solo existen vía insights oficiales (API/token), no por scraping.
  const igInsightsUnavailable = metricDef?.igInsightsOnly && igConnection !== 'official'

  function set(patch) { setDraft(d => ({ ...d, ...patch })) }

  function handleCategory(category) {
    set({ category, metric: '', trackedKeywordId: '', competitorId: '' })
  }

  async function handleSave() {
    if (!draft.category || !draft.metric) { setError('Elegí categoría y métrica'); return }
    const def = METRICS[draft.metric]
    const body = {
      category:    draft.category,
      metric:      draft.metric,
      periodicity: draft.periodicity,
    }
    if (def.hasTarget) {
      const t = parseFloat(draft.target)
      if (isNaN(t) || t <= 0) { setError('El objetivo debe ser un número mayor a 0'); return }
      body.target = t
    }
    if (def.param === 'platform') {
      if (!draft.platform) { setError('Elegí la plataforma'); return }
      body.platform = draft.platform
    }
    if (def.rrssPlatform && draft.platform) {
      body.platform = draft.platform   // vacío = todas las redes
    }
    if (def.param === 'trackedKeywordId') {
      if (!draft.trackedKeywordId) { setError('Elegí una keyword en seguimiento'); return }
      body.trackedKeywordId = Number(draft.trackedKeywordId)
    }
    if (def.param === 'competitorId') {
      if (!draft.competitorId) { setError('Elegí un competidor'); return }
      body.competitorId = Number(draft.competitorId)
    }

    setSaving(true); setError(null)
    try {
      if (isEdit) await api.patch(`/marketing/projects/${projectId}/objectives/${initial.id}`, body)
      else        await api.post(`/marketing/projects/${projectId}/objectives`, body)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar el objetivo')
    } finally { setSaving(false) }
  }

  const inputCls = 'w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3 bg-gray-50/60 dark:bg-gray-900/30">
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{isEdit ? 'Editar objetivo' : 'Nuevo objetivo'}</p>

      {/* Categoría */}
      <div>
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Categoría</label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(c => (
            <button key={c.key} type="button" onClick={() => handleCategory(c.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                draft.category === c.key
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Métrica */}
      {draft.category && (
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Métrica</label>
          <select value={draft.metric} onChange={e => set({ metric: e.target.value, platform: defaultPlatformFor(e.target.value, draft.platform), trackedKeywordId: '', competitorId: '' })} className={inputCls}>
            <option value="">Elegir métrica…</option>
            {metricsForCategory(draft.category).map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          {metricDef && <p className="text-[11px] text-gray-400 mt-1">{metricDef.help}</p>}
          {igInsightsUnavailable && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700/50 rounded-lg px-2.5 py-1.5 mt-1.5">
              ⚠️ {igConnection === 'scrape'
                ? 'La cuenta de Instagram está conectada por scraping. El alcance y las visualizaciones no están disponibles por este método: solo se obtienen con la conexión oficial (API o token). Este objetivo no tendrá datos.'
                : 'No hay una cuenta de Instagram conectada por API o token. El alcance y las visualizaciones solo se obtienen con la conexión oficial (la conexión por scraping no los ve), así que este objetivo no tendrá datos.'}
            </p>
          )}
        </div>
      )}

      {/* Periodicidad */}
      {metricDef && (
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Periodicidad</label>
          <select value={draft.periodicity} onChange={e => set({ periodicity: e.target.value })} className={inputCls}>
            {PERIODICITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
      )}

      {/* Param: plataforma (Ads) */}
      {metricDef?.param === 'platform' && (
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Plataforma</label>
          <select value={draft.platform} onChange={e => set({ platform: e.target.value })} className={inputCls}>
            {AD_PLATFORMS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
      )}

      {/* Param: red (RRSS) — opcional, vacío = todas */}
      {metricDef?.rrssPlatform && (
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Red social</label>
          <select value={draft.platform} onChange={e => set({ platform: e.target.value })} className={inputCls}>
            <option value="">Todas las redes (IG + TikTok + LinkedIn)</option>
            {RRSS_PLATFORMS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <p className="text-[11px] text-gray-400 mt-1">Elegí una red para un objetivo por plataforma (se ve en su pestaña de RRSS).</p>
        </div>
      )}

      {/* Param: keyword */}
      {metricDef?.param === 'trackedKeywordId' && (
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Keyword (en seguimiento)</label>
          {keywords.length === 0
            ? <p className="text-xs text-amber-600 dark:text-amber-400">No hay keywords en seguimiento. Agregá una en la pestaña Keywords primero.</p>
            : <select value={draft.trackedKeywordId} onChange={e => set({ trackedKeywordId: e.target.value })} className={inputCls}>
                <option value="">Elegir keyword…</option>
                {keywords.map(k => <option key={k.id} value={k.id}>{k.query}</option>)}
              </select>}
        </div>
      )}

      {/* Param: competidor */}
      {metricDef?.param === 'competitorId' && (
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Competidor a superar</label>
          {competitors.length === 0
            ? <p className="text-xs text-amber-600 dark:text-amber-400">No hay competidores cargados. Agregá uno en RRSS → Competidores primero.</p>
            : <select value={draft.competitorId} onChange={e => set({ competitorId: e.target.value })} className={inputCls}>
                <option value="">Elegir competidor…</option>
                {competitors.map(c => <option key={c.id} value={c.id}>{c.displayName || `@${c.username}`}</option>)}
              </select>}
        </div>
      )}

      {/* Target */}
      {metricDef?.hasTarget && (
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
            Objetivo {metricDef.unit === 'pos' ? '(posición — menor es mejor)' : metricDef.unit === '%' ? '(%)' : metricDef.unit === '$' ? '($)' : ''}
          </label>
          <input type="number" value={draft.target} onChange={e => set({ target: e.target.value })}
            placeholder={metricDef.unit === 'pos' ? '3' : metricDef.unit === '%' ? '2.5' : '1000'} className={inputCls} />
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Cancelar</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 py-1.5 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50">
          {saving ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Agregar objetivo')}
        </button>
      </div>
    </div>
  )
}

// ─── Gestor (modal) ──────────────────────────────────────────────────────────

export default function ObjectivesManager({ projectId, onClose }) {
  const [objectives, setObjectives] = useState([])
  const [keywords, setKeywords]     = useState([])
  const [competitors, setCompetitors] = useState([])
  const [igConnection, setIgConnection] = useState(null)  // 'official' | 'scrape' | null (sin conectar)
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [editing, setEditing]       = useState(null)

  async function loadAll() {
    setLoading(true)
    try {
      const [objs, kws, comps, integs] = await Promise.all([
        api.get(`/marketing/projects/${projectId}/objectives`),
        api.get(`/marketing/projects/${projectId}/keywords`).catch(() => ({ data: { keywords: [] } })),
        api.get(`/marketing/projects/${projectId}/competitors?platform=instagram`).catch(() => ({ data: [] })),
        api.get(`/marketing/projects/${projectId}/integrations`).catch(() => ({ data: [] })),
      ])
      setObjectives(objs.data.objectives || [])
      setKeywords(kws.data.keywords || [])
      setCompetitors(Array.isArray(comps.data) ? comps.data : (comps.data.competitors || []))
      const ig = (Array.isArray(integs.data) ? integs.data : []).find(i => i.type === 'instagram')
      setIgConnection(ig ? (ig.scopes === 'scrape' ? 'scrape' : 'official') : null)
    } catch { /* noop */ }
    finally { setLoading(false) }
  }
  useEffect(() => { loadAll() }, [projectId])  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(id) {
    if (!window.confirm('¿Eliminar este objetivo?')) return
    try {
      await api.delete(`/marketing/projects/${projectId}/objectives/${id}`)
      setObjectives(prev => prev.filter(o => o.id !== id))
    } catch (err) { alert(err.response?.data?.error || 'Error al eliminar') }
  }

  function startEdit(o) {
    setEditing({
      id: o.id, category: o.category, metric: o.metric, periodicity: o.periodicity,
      target: o.target != null ? String(o.target) : '',
      platform: o.platform || '',
      trackedKeywordId: o.trackedKeywordId != null ? String(o.trackedKeywordId) : '',
      competitorId: o.competitorId != null ? String(o.competitorId) : '',
    })
    setShowForm(true)
  }

  function onSaved() { setShowForm(false); setEditing(null); loadAll() }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">🎯 Objetivos del proyecto</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Los objetivos se mantienen mes a mes hasta que los edites o elimines. El informe compara cada uno contra los datos reales del período.
        </p>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <>
              {objectives.length === 0 && !showForm && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">Todavía no hay objetivos. Agregá el primero.</p>
              )}

              {objectives.map(o => (
                <div key={o.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 dark:border-gray-700">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                      {METRICS[o.metric]?.label || o.metric}
                      {o.keyword && <span className="text-gray-400"> · {o.keyword}</span>}
                      {o.competitor && <span className="text-gray-400"> · {o.competitor}</span>}
                      {o.platform && <span className="text-gray-400"> · {PLATFORM_LABEL[o.platform] || o.platform}</span>}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      <span className="uppercase">{CATEGORY_LABEL[o.category]}</span> · {PERIODICITY_LABEL[o.periodicity]}
                      {METRICS[o.metric]?.hasTarget && <> · objetivo {fmtObjectiveValue(o.target, METRICS[o.metric]?.unit)}</>}
                    </p>
                  </div>
                  <button onClick={() => startEdit(o)} className="text-xs text-gray-400 hover:text-primary-600" title="Editar">✏️</button>
                  <button onClick={() => handleDelete(o.id)} className="text-xs text-gray-400 hover:text-red-500" title="Eliminar">🗑️</button>
                </div>
              ))}

              {showForm ? (
                <ObjectiveForm
                  projectId={projectId}
                  initial={editing}
                  keywords={keywords}
                  competitors={competitors}
                  igConnection={igConnection}
                  onSaved={onSaved}
                  onCancel={() => { setShowForm(false); setEditing(null) }}
                />
              ) : (
                <button onClick={() => { setEditing(null); setShowForm(true) }}
                  className="w-full py-2 text-sm font-medium border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  + Agregar objetivo
                </button>
              )}
            </>
          )}
        </div>

        <div className="pt-4">
          <button onClick={onClose} className="w-full py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cerrar</button>
        </div>
      </div>
    </div>
  )
}
