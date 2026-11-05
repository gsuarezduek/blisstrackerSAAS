import { useState } from 'react'
import api from '../../api/client'
import { CheckCircle2 } from 'lucide-react'
import { Icon } from '../ui/Icon'

// Mismo catálogo que ACTIONS en backend/src/lib/cannibalResolution.js.
export const RESOLUTION_ACTIONS = [
  { value: '301',          label: '301 hecho',                 hint: 'Redirigí las URLs secundarias a la principal' },
  { value: 'canonical',    label: 'Canonical aplicado',        hint: 'Agregaste rel="canonical" hacia la principal' },
  { value: 'noindex',      label: 'Noindex aplicado',          hint: 'Saliste de la indexación las URLs secundarias' },
  { value: 'diferenciado', label: 'Intención diferenciada',    hint: 'Cambiaste el contenido para que no compitan' },
  { value: 'otro',         label: 'Otro',                      hint: 'Contalo en la nota' },
]

export const ACTION_LABEL = Object.fromEntries(RESOLUTION_ACTIONS.map(a => [a.value, a.label]))

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Marca un conflicto de canibalización como resuelto: acción + nota + fecha del
 * arreglo. La fecha importa — es contra la que el próximo análisis verifica si el
 * conflicto volvió (ver "Conflictos resueltos" en docs/claude/marketing.md).
 */
export default function ResolveConflictModal({ projectId, conflict, onClose, onSaved }) {
  const existing = conflict?.resolution
  const [action, setAction]     = useState(existing?.action ?? '301')
  const [note, setNote]         = useState(existing?.note ?? '')
  const [date, setDate]         = useState(todayStr())
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState(null)

  const hint = RESOLUTION_ACTIONS.find(a => a.value === action)?.hint

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const { data } = await api.post(`/marketing/projects/${projectId}/cannibal/resolutions`, {
        query:      conflict.query,
        language:   conflict.language,
        action,
        note:       note.trim() || undefined,
        resolvedAt: date || undefined,
        mainUrl:    conflict.recommendation?.mainUrl,
        urls:       (conflict.urls ?? []).map(u => u.url),
      })
      onSaved?.(data.resolution)
    } catch (err) {
      setError(err.response?.data?.error ?? 'Error al guardar')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 text-center"><Icon as={CheckCircle2} size={32} className="inline-block text-green-500" /></div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center mb-1">
          Marcar como resuelto
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-4 break-words">
          “{conflict?.query}”
        </p>

        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">¿Qué hiciste?</label>
        <select
          value={action}
          onChange={e => setAction(e.target.value)}
          className="w-full mb-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {RESOLUTION_ACTIONS.map(a => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
        {hint && <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">{hint}</p>}

        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
          Fecha del arreglo
        </label>
        <input
          type="date"
          value={date}
          max={todayStr()}
          onChange={e => setDate(e.target.value)}
          className="w-full mb-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">
          Se verifica contra los datos posteriores a esta fecha, así que poné la fecha real del cambio.
        </p>

        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
          Nota <span className="font-normal text-gray-400">(opcional)</span>
        </label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Ej: 301 de /blog/alquiler-autos hacia /alquiler-autos"
          className="w-full mb-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
        />

        <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-4 leading-relaxed">
          Sale de la lista y de Prioridades. Los análisis siguen mirando hasta 180 días hacia
          atrás, así que el conflicto puede seguir en los datos un tiempo: solo se reabre si
          las URLs vuelven a competir <strong>después</strong> de esta fecha.
        </p>

        {error && <p className="text-xs text-red-600 dark:text-red-400 mb-3 text-center">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Marcar resuelto'}
          </button>
        </div>
      </div>
    </div>
  )
}
