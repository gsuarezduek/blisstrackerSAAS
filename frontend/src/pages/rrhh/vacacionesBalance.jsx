import { useState, useEffect } from 'react'
import api from '../../api/client'
import { TZ } from './shared'

// Ajustar (otorgar/sacar) el saldo de vacaciones de una persona — mismo modal que antes
// vivía en la pestaña Legajos, movido acá (pestaña "Vacaciones") junto con el listado.
export function VacationEditModal({ user, onClose, onUpdated }) {
  const [newDays, setNewDays]       = useState(String(user.vacationDays ?? 0))
  const [description, setDescription] = useState('')
  const [history, setHistory]       = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    api.get(`/vacation/admin/adjustments/${user.id}`)
      .then(r => setHistory(r.data))
      .catch(() => setHistory([]))
  }, [user.id])

  async function handleSave() {
    const days = parseInt(newDays, 10)
    if (isNaN(days) || days < 0) { setError('Ingresá un número válido de días (0 o más)'); return }
    if (!description.trim()) { setError('La descripción es requerida'); return }
    setSaving(true); setError('')
    try {
      const { data } = await api.patch(`/vacation/admin/adjust/${user.id}`, { newDays: days, description })
      onUpdated(data)
      onClose()
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar')
    } finally { setSaving(false) }
  }

  function fmtTs(iso) {
    return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">Editar días de vacaciones</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Días actuales → nuevos */}
          <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-0.5">Actual</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{user.vacationDays ?? 0}</p>
              <p className="text-xs text-gray-400">días</p>
            </div>
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            <div className="flex-1">
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Nueva cantidad</label>
              <input
                type="number" min="0" value={newDays}
                onChange={e => setNewDays(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-lg font-bold text-center bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
              Motivo / descripción <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3} value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ej: Acumulación período 2026, descuento por licencia tomada…"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Historial toggle */}
          <button
            onClick={() => setShowHistory(v => !v)}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium flex items-center gap-1"
          >
            {showHistory ? '▲' : '▼'} Ver historial de ajustes
            {history !== null && <span className="text-gray-400">({history.length})</span>}
          </button>

          {showHistory && (
            <div className="max-h-52 overflow-y-auto space-y-2 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              {!history
                ? <p className="text-xs text-gray-400 text-center py-2">Cargando…</p>
                : history.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-2">Sin historial de ajustes</p>
                  : history.map(adj => (
                      <div key={adj.id} className="flex items-start gap-3 text-xs">
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-700 dark:text-gray-200 font-medium truncate">{adj.description}</p>
                          <p className="text-gray-400 dark:text-gray-500">
                            {adj.admin ? `Por ${adj.admin.name} · ` : ''}{fmtTs(adj.createdAt)}
                          </p>
                        </div>
                        <span className={`flex-shrink-0 font-bold ${adj.newDays >= adj.prevDays ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                          {adj.prevDays} → {adj.newDays}
                        </span>
                      </div>
                    ))
              }
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
          <button
            onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export const INTERVAL_LABELS = { 1: 'mes', 3: 'trimestre', 6: 'semestre', 12: 'año' }
