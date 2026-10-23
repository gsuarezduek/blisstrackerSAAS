import { useState } from 'react'
import api from '../../api/client'
import { fmtMoney } from '../../utils/format'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
const today = () => new Date().toISOString().slice(0, 10)

// "Ajustar saldo" de una cuenta: se carga el MONTO del ajuste (suma o resta),
// no el saldo real. Mueve el disponible pero no cuenta como ingreso ni egreso.
export default function AdjustBalanceModal({ account, onClose, onSaved }) {
  const [direction, setDirection] = useState('add') // add | subtract
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const n = Number(amount)
  const signed = direction === 'add' ? n : -n
  const valid = amount !== '' && n > 0

  async function handleSave() {
    if (!valid) { setError('Monto inválido'); return }
    if (!note.trim()) { setError('Contá el motivo del ajuste'); return }
    setSaving(true); setError('')
    try {
      await api.post('/finanzas/adjustments', { accountId: account.id, date, amount: signed, note: note.trim() })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white pr-8">Ajustar saldo</h2>
        <p className="text-xs text-gray-400 mb-4">{account.name} · Disponible {fmtMoney(account.disponible, account.currency)}</p>

        <div className="space-y-4">
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-900 rounded-xl p-1 w-fit">
            {[{ k: 'add', l: 'Sumar' }, { k: 'subtract', l: 'Restar' }].map(o => (
              <button key={o.k} type="button" onClick={() => setDirection(o.k)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${direction === o.k ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                {o.l}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Monto del ajuste</label>
              <input type="number" step="any" min="0" className={input} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className={label}>Fecha</label>
              <input type="date" className={input} value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={label}>Motivo</label>
            <input className={input} value={note} onChange={e => setNote(e.target.value)} placeholder="ej. Diferencia con el resumen del banco" />
          </div>

          {valid && (
            <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/40 rounded-lg p-2">
              El disponible queda en <strong className="text-gray-700 dark:text-gray-200">{fmtMoney(Number(account.disponible) + signed, account.currency)}</strong>. No cuenta como ingreso ni como egreso.
            </p>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg py-2 text-sm font-medium">Cancelar</button>
            <button disabled={saving} onClick={handleSave} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">Guardar ajuste</button>
          </div>
        </div>
      </div>
    </div>
  )
}
