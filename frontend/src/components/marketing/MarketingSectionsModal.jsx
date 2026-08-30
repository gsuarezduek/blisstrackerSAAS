import { useState } from 'react'
import api from '../../api/client'
import { NAV, SECTION_DESCRIPTIONS } from './marketingNav'

/**
 * Rueda de configuración de Marketing (⚙️, solo admin/owner): elige qué secciones de
 * NAV se muestran para todo el workspace — mismo criterio que "Módulos adicionales"
 * de Preferencias, pero acotado a las 6 secciones internas de Marketing. Persiste en
 * Workspace.marketingDisabledSections vía el mismo endpoint que el resto de las
 * Preferencias Globales (`/projects/settings`).
 */
export default function MarketingSectionsModal({ disabledSections, onClose, onSaved }) {
  const [localDisabled, setLocalDisabled] = useState(disabledSections || [])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const allDisabled = localDisabled.length >= NAV.length

  function toggle(id) {
    setErr('')
    setLocalDisabled(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSave() {
    if (allDisabled) { setErr('Debe quedar al menos una sección habilitada.'); return }
    setSaving(true)
    try {
      await api.patch('/projects/settings', { marketingDisabledSections: localDisabled })
      await onSaved?.()
      onClose()
    } catch (e) {
      setErr(e.response?.data?.error || 'No se pudo guardar')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">⚙️ Secciones de Marketing</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          Elegí qué secciones ve el equipo en Marketing. Útil para ocultar las que no aplican a este workspace.
        </p>

        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {NAV.map(n => (
            <label key={n.id} className="flex items-start gap-3 py-2.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer">
              <input
                type="checkbox"
                checked={!localDisabled.includes(n.id)}
                onChange={() => toggle(n.id)}
                className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500 flex-shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">{n.label}</span>
                <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">{SECTION_DESCRIPTIONS[n.id]}</span>
              </span>
            </label>
          ))}
        </div>

        {err && <p className="text-xs text-red-600 dark:text-red-400 mt-3">{err}</p>}

        <div className="flex gap-3 pt-5">
          <button type="button" onClick={onClose}
            className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={handleSave} disabled={saving || allDisabled}
            className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg py-2 text-sm font-medium transition-colors">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
