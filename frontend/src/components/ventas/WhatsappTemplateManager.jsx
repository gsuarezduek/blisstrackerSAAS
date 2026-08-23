import { useEffect, useMemo, useState } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'

const CATEGORIES = [
  { value: 'UTILITY', label: 'Utility (recordatorios, actualizaciones — revisión más simple)' },
  { value: 'MARKETING', label: 'Marketing (promocional — revisión más estricta)' },
  { value: 'AUTHENTICATION', label: 'Authentication (códigos OTP)' },
]

const STATUS_STYLE = {
  APPROVED: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  PENDING: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  REJECTED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
}

function countVariables(text) {
  return (text.match(/\{\{\d+\}\}/g) || []).length
}

// Admin: gestión de plantillas (Fase 5 del plan, ampliada — crear además de
// solo leer). Crear acá manda la plantilla a revisión de Meta (vía Chakra);
// queda en PENDING hasta que la aprueben/rechacen, "↻ Sincronizar" trae el
// estado actualizado. Solo soporta un componente BODY (con variables
// {{1}} {{2}}…) — sin header/footer/botones, nada más en el repo los usa.
export default function WhatsappTemplateManager({ onClose }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', category: 'UTILITY', language: 'es_AR', bodyText: '' })
  const [examples, setExamples] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/whatsapp/templates')
      setTemplates(data)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const variableCount = useMemo(() => countVariables(form.bodyText), [form.bodyText])
  useEffect(() => {
    setExamples(prev => Array.from({ length: variableCount }, (_, i) => prev[i] || ''))
  }, [variableCount])

  async function handleSync() {
    setSyncing(true)
    setError(null)
    try {
      const { data } = await api.post('/whatsapp/templates/sync')
      setTemplates(data.templates)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.post('/whatsapp/templates', { ...form, bodyExamples: examples })
      setForm({ name: '', category: 'UTILITY', language: 'es_AR', bodyText: '' })
      setExamples([])
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear la plantilla')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-6 pb-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">📄 Plantillas de WhatsApp</h2>
          <div className="flex items-center gap-3">
            <button onClick={handleSync} disabled={syncing} className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-50">
              {syncing ? 'Sincronizando…' : '↻ Sincronizar'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">✕</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full mb-4 px-4 py-2.5 text-sm font-medium text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded-xl"
            >
              + Nueva plantilla
            </button>
          )}

          {showForm && (
            <form onSubmit={handleCreate} className="space-y-3 mb-5 bg-gray-50 dark:bg-gray-700/40 rounded-xl p-4">
              <label className="block">
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nombre</span>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="recordatorio_reunion"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                />
                <span className="block text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Solo minúsculas, números y guiones bajos — se normaliza solo si escribís otra cosa.</span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Categoría</span>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.value}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Idioma</span>
                  <input
                    value={form.language}
                    onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
                    placeholder="es_AR"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                  />
                </label>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">{CATEGORIES.find(c => c.value === form.category)?.label}</p>

              <label className="block">
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Texto del mensaje</span>
                <textarea
                  value={form.bodyText}
                  onChange={e => setForm(f => ({ ...f, bodyText: e.target.value }))}
                  rows={4}
                  placeholder="Hola {{1}}, ¿seguís interesado en {{2}}?"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 resize-y"
                />
                <span className="block text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Usá {'{{1}}'}, {'{{2}}'}… para las variables que se completan al enviarla.</span>
              </label>

              {examples.length > 0 && (
                <div className="space-y-2">
                  <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Ejemplos (Meta los pide para poder revisarla)</span>
                  {examples.map((v, i) => (
                    <input
                      key={i}
                      value={v}
                      onChange={e => setExamples(ex => ex.map((x, idx) => idx === i ? e.target.value : x))}
                      placeholder={`Ejemplo para {{${i + 1}}}`}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                    />
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-xl">
                  {saving ? 'Enviando a Meta…' : 'Enviar a revisión'}
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <LoadingSpinner size="sm" className="py-6" />
          ) : templates.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-4">Todavía no hay plantillas.</p>
          ) : (
            <div className="space-y-2">
              {templates.map(t => (
                <div key={t.id} className="border border-gray-100 dark:border-gray-700 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[t.status] || 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>{t.status}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{t.category} · {t.language}</p>
                  {t.bodyText && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 whitespace-pre-wrap">{t.bodyText}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
