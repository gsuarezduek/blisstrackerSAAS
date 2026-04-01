import { useState } from 'react'
import api from '../api/client'
import { linkify } from '../utils/linkify'

export default function EditDurationModal({ task, onClose, onSaved }) {
  const initHours = Math.floor(task.minutes / 60)
  const initMins  = task.minutes % 60

  const [hours, setHours]   = useState(String(initHours))
  const [mins, setMins]     = useState(String(initMins))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const h = parseInt(hours, 10) || 0
    const m = parseInt(mins,  10) || 0
    const total = h * 60 + m
    if (total < 0) { setError('La duración no puede ser negativa'); return }
    setSaving(true)
    setError('')
    try {
      await api.patch(`/tasks/${task.id}/duration`, { minutes: total })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">Editar duración</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-2">"{linkify(task.description)}"</p>

        {task.isOverride && (
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 mb-4">
            Duración editada manualmente
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Horas</label>
              <input
                type="number"
                min="0"
                max="23"
                value={hours}
                onChange={e => setHours(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <span className="text-gray-400 pb-2 font-bold">:</span>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Minutos</label>
              <input
                type="number"
                min="0"
                max="59"
                value={mins}
                onChange={e => setMins(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-xl py-2.5 text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
