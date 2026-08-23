import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'
import { LEAD_STATUSES, LEAD_ORIGINS } from './salesCatalog'
import { TRIGGER_TYPES, MERGE_TOKENS, triggerLabel } from './whatsappAutomationCatalog'

const EMPTY_FORM = { name: '', active: true, triggerType: 'no_reply_days', triggerDays: 5, templateId: '', statusFilter: [], originFilter: [], cooldownDays: 14, variableMapping: [] }

function toggleInArray(arr, key) {
  return arr.includes(key) ? arr.filter(k => k !== key) : [...arr, key]
}

const chip = (active) => `text-xs px-2 py-1 rounded-full border font-medium ${active ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-400' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'}`

// Admin: motor de reglas de reactivación de WhatsApp (extiende Fase 5, pedido
// del usuario de poder "dejar criterios configurados que se envíen las
// plantillas" en vez de reabrir a mano una por una). Cada regla es simple e
// independiente — varias reglas simples cubren casos distintos en vez de un
// armador de condiciones AND/OR.
export default function WhatsappAutomationManager({ onClose }) {
  const [rules, setRules] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [runningId, setRunningId] = useState(null)
  const [runResult, setRunResult] = useState(null) // { id, sent, failed }

  const load = async () => {
    setLoading(true)
    try {
      const [{ data: rulesData }, { data: tpls }] = await Promise.all([
        api.get('/whatsapp/automation-rules'),
        api.get('/whatsapp/templates'),
      ])
      setRules(rulesData.rules)
      setTemplates(tpls)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const selectedTemplate = useMemo(() => templates.find(t => t.id === Number(form.templateId)), [templates, form.templateId])

  // Al cambiar de plantilla, recalcula el largo del mapeo de variables (conserva lo ya tipeado que entre).
  useEffect(() => {
    const count = selectedTemplate?.variableCount || 0
    setForm(f => ({ ...f, variableMapping: Array.from({ length: count }, (_, i) => f.variableMapping[i] || '') }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.templateId])

  function startCreate() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(true)
    setError(null)
  }

  function startEdit(r) {
    setForm({
      name: r.name, active: r.active, triggerType: r.triggerType, triggerDays: r.triggerDays,
      templateId: String(r.templateId), statusFilter: r.statusFilter, originFilter: r.originFilter,
      cooldownDays: r.cooldownDays, variableMapping: r.variableMapping,
    })
    setEditingId(r.id)
    setShowForm(true)
    setError(null)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = { ...form, templateId: Number(form.templateId), triggerDays: Number(form.triggerDays), cooldownDays: Number(form.cooldownDays) }
      if (editingId) await api.patch(`/whatsapp/automation-rules/${editingId}`, payload)
      else await api.post('/whatsapp/automation-rules', payload)
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar la regla')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(r) {
    await api.patch(`/whatsapp/automation-rules/${r.id}`, { active: !r.active })
    load()
  }

  async function remove(id) {
    if (!window.confirm('¿Eliminar esta regla?')) return
    await api.delete(`/whatsapp/automation-rules/${id}`)
    load()
  }

  async function runNow(id) {
    setRunningId(id)
    setRunResult(null)
    try {
      const { data } = await api.post(`/whatsapp/automation-rules/${id}/run-now`)
      setRunResult({ id, ...data })
    } catch (err) {
      setRunResult({ id, error: err.response?.data?.error || 'No se pudo correr la regla' })
    } finally {
      setRunningId(null)
    }
  }

  function insertToken(token) {
    // Inserta el tag en el primer campo de variable vacío, o al final del último.
    setForm(f => {
      const idx = f.variableMapping.findIndex(v => !v.trim())
      const target = idx === -1 ? f.variableMapping.length - 1 : idx
      if (target < 0) return f
      const mapping = [...f.variableMapping]
      mapping[target] = (mapping[target] ? mapping[target] + ' ' : '') + token
      return { ...f, variableMapping: mapping }
    })
  }

  const input = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-6 pb-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">⚙️ Automatizaciones de WhatsApp</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Criterios que reabren conversaciones vencidas solas, con una plantilla — corren todos los días a las 08:05 ART.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 mb-3">{error}</p>}

          {!showForm && (
            <button onClick={startCreate} className="w-full mb-4 px-4 py-2.5 text-sm font-medium text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded-xl">
              + Nueva regla
            </button>
          )}

          {showForm && (
            <form onSubmit={handleSave} className="space-y-3 mb-5 bg-gray-50 dark:bg-gray-700/40 rounded-xl p-4">
              <label className="block">
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nombre de la regla</span>
                <input className={input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej. Reactivar contactados fríos" />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Se dispara cuando…</span>
                  <select className={input} value={form.triggerType} onChange={e => setForm(f => ({ ...f, triggerType: e.target.value }))}>
                    {TRIGGER_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Días</span>
                  <input type="number" min={1} className={input} value={form.triggerDays} onChange={e => setForm(f => ({ ...f, triggerDays: e.target.value }))} />
                </label>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">{TRIGGER_TYPES.find(t => t.key === form.triggerType)?.hint}</p>

              <label className="block">
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Plantilla a enviar</span>
                <select className={input} value={form.templateId} onChange={e => setForm(f => ({ ...f, templateId: e.target.value }))}>
                  <option value="">Elegir plantilla…</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.status}{t.variableCount ? ` · ${t.variableCount} var.` : ''})</option>)}
                </select>
                {selectedTemplate && selectedTemplate.status !== 'APPROVED' && (
                  <span className="block text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">⚠ Todavía no está aprobada por Meta — la regla se guarda pero no envía nada hasta que se apruebe.</span>
                )}
              </label>

              {form.variableMapping.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Variables de la plantilla</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {MERGE_TOKENS.map(m => (
                      <button type="button" key={m.key} onClick={() => insertToken(m.key)} className="text-[10px] px-2 py-1 rounded-full border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600">
                        + {m.label}
                      </button>
                    ))}
                  </div>
                  {form.variableMapping.map((v, i) => (
                    <input key={i} className={input} value={v} placeholder={`Variable {{${i + 1}}} — texto fijo o un tag de arriba`}
                      onChange={e => setForm(f => ({ ...f, variableMapping: f.variableMapping.map((x, idx) => idx === i ? e.target.value : x) }))} />
                  ))}
                </div>
              )}

              <div>
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Solo para leads en estado… <span className="text-gray-400">(vacío = todos los activos)</span></span>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_STATUSES.filter(s => !s.isWon && !s.isLost).map(s => (
                    <button type="button" key={s.key} onClick={() => setForm(f => ({ ...f, statusFilter: toggleInArray(f.statusFilter, s.key) }))} className={chip(form.statusFilter.includes(s.key))}>{s.label}</button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Solo para origen… <span className="text-gray-400">(vacío = todos)</span></span>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_ORIGINS.map(o => (
                    <button type="button" key={o.key} onClick={() => setForm(f => ({ ...f, originFilter: toggleInArray(f.originFilter, o.key) }))} className={chip(form.originFilter.includes(o.key))}>{o.label}</button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">No repetir sobre el mismo lead antes de (días)</span>
                <input type="number" min={0} className={`${input} max-w-[140px]`} value={form.cooldownDays} onChange={e => setForm(f => ({ ...f, cooldownDays: e.target.value }))} />
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">Cancelar</button>
                <button type="submit" disabled={saving || !form.templateId} className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-xl">
                  {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear regla'}
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <LoadingSpinner size="sm" className="py-6" />
          ) : rules.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-4">Todavía no hay reglas configuradas.</p>
          ) : (
            <div className="space-y-2">
              {rules.map(r => (
                <div key={r.id} className="border border-gray-100 dark:border-gray-700 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{r.name}</span>
                        {!r.active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500">Pausada</span>}
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {triggerLabel(r.triggerType)} ≥ {r.triggerDays}d · plantilla "{r.template.name}" ({r.template.status}) · cooldown {r.cooldownDays}d
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs">
                      <button onClick={() => runNow(r.id)} disabled={runningId === r.id || !r.active} title="Corre la regla ya mismo (envío real, no es una simulación) — a los leads que califiquen les llega la plantilla de verdad" className="text-primary-600 hover:underline disabled:opacity-50">
                        {runningId === r.id ? 'Corriendo…' : '▶ Probar ahora'}
                      </button>
                      <button onClick={() => toggleActive(r)} className="text-gray-500 hover:underline">{r.active ? 'Pausar' : 'Activar'}</button>
                      <button onClick={() => startEdit(r)} className="text-gray-500 hover:underline">Editar</button>
                      <button onClick={() => remove(r.id)} className="text-red-400 hover:text-red-600">Eliminar</button>
                    </div>
                  </div>
                  {runResult?.id === r.id && (
                    <p className={`text-xs mt-2 ${runResult.error ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                      {runResult.error || `Enviados: ${runResult.sent} · Fallidos: ${runResult.failed}`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
