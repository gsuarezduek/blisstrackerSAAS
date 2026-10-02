import { useState, useEffect } from 'react'
import api from '../../api/client'
import { BENEFIT_BANKS } from './shared'

// Otorgar/ajustar a mano el saldo de un banco de beneficios (horas libres / días home).
export function AdjustModal({ user, bank, onClose, onUpdated }) {
  const meta = BENEFIT_BANKS[bank]
  const [newBalance, setNewBalance] = useState(String(user.balance ?? 0))
  const [description, setDescription] = useState('')
  const [history, setHistory]       = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    api.get(`/benefits/admin/adjustments/${user.userId}`, { params: { bank } })
      .then(r => setHistory(r.data))
      .catch(() => setHistory([]))
  }, [user.userId, bank])

  async function handleSave() {
    const balance = Number(newBalance)
    if (!Number.isFinite(balance) || balance < 0) { setError(`Ingresá un número válido de ${meta.unit} (0 o más)`); return }
    if (!description.trim()) { setError('La descripción es requerida'); return }
    setSaving(true); setError('')
    try {
      const { data } = await api.patch(`/benefits/admin/balances/${user.userId}`, { bank, newBalance: balance, description })
      onUpdated(data)
      onClose()
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">{meta.icon} Otorgar / ajustar {meta.label.toLowerCase()}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user.user.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-0.5">Actual</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{user.balance ?? 0}</p>
              <p className="text-xs text-gray-400">{meta.unit}</p>
            </div>
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            <div className="flex-1">
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Nueva cantidad</label>
              <input
                type="number" min="0" step="0.5" value={newBalance}
                onChange={e => setNewBalance(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-lg font-bold text-center bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
              Motivo / descripción <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3} value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ej: Ganó el juego de octubre, cubrió el evento del cliente X…"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

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
                            {adj.admin ? `Por ${adj.admin.name} · ` : 'Automático · '}
                            {new Date(adj.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                        <span className={`flex-shrink-0 font-bold ${adj.newBalance >= adj.prevBalance ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                          {adj.prevBalance} → {adj.newBalance}
                        </span>
                      </div>
                    ))
              }
            </div>
          )}
        </div>

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
