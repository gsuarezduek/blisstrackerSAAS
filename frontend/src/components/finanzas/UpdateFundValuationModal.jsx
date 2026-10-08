import { useState } from 'react'
import api from '../../api/client'
import { fmtMoney } from '../../utils/format'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
const today = () => new Date().toISOString().slice(0, 10)

// Actualizar valuación de fondo (sección 4.8): cuenta, fecha, valor actual.
// El resultado del período lo calcula el backend (value − valorAnterior −
// aportes + rescates) — se muestra recién después de guardar.
export default function UpdateFundValuationModal({ account, onClose, onSaved }) {
  const [date, setDate] = useState(today())
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  async function handleSave() {
    if (!value || Number(value) < 0) { setError('Valor inválido'); return }
    setSaving(true); setError('')
    try {
      const res = await api.post('/finanzas/fund-valuations', { accountId: account.id, date, value: Number(value) })
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1 pr-8">Actualizar valuación</h2>
        <p className="text-xs text-gray-400 mb-4">{account.name}</p>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">Fondo actualizado a {fmtMoney(result.value, account.currency)}.</p>
            <p className={`text-sm font-semibold ${Number(result.periodResult) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              Resultado del período: {Number(result.periodResult) >= 0 ? '+' : ''}{fmtMoney(result.periodResult, account.currency)}
            </p>
            <button onClick={onSaved} className="w-full bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-2 text-sm font-medium">Listo</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className={label}>Fecha</label>
              <input type="date" className={input} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className={label}>Valor actual</label>
              <input type="number" step="any" className={input} value={value} onChange={e => setValue(e.target.value)} placeholder="0" />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-4 py-2 text-sm font-medium">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">Guardar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
