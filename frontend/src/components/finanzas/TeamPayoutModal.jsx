import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Icon } from '../ui/Icon'
import api from '../../api/client'
import useMembers from '../../hooks/useMembers'
import { fmtMoney } from '../../utils/format'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
const today = () => new Date().toISOString().slice(0, 10)
const TEAM_CATEGORY_RE = /equipo|sueldo|honorario|personal|colaborador/i

// "Pagar al equipo" de un Extra: a quién del equipo se le deposita cuánto y
// desde qué cuenta. Cada persona genera un egreso real (backend: payTeam).
export default function TeamPayoutModal({ extra, accounts, categories, onClose, onSaved }) {
  const { members } = useMembers()
  const activeMembers = members.filter(m => m.active !== false)
  const expenseCategories = categories.filter(c => c.type === 'expense' && c.active)

  const teamAmount = Number(extra.teamAmount)
  const alreadyPaid = Number(extra.teamPaidAmount || 0)
  const left = Math.max(0, teamAmount - alreadyPaid)

  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState(() => String(expenseCategories.find(c => TEAM_CATEGORY_RE.test(c.name))?.id || ''))
  const [date, setDate] = useState(today())
  const [rows, setRows] = useState([{ userId: '', amount: left ? String(left) : '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const rowsTotal = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const overpaid = rowsTotal - left > 0.005

  function setRow(i, patch) { setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r)) }
  function addRow() {
    const rest = Math.max(0, left - rowsTotal)
    setRows(rs => [...rs, { userId: '', amount: rest ? String(Math.round(rest * 100) / 100) : '' }])
  }
  function removeRow(i) { setRows(rs => rs.filter((_, idx) => idx !== i)) }

  async function handleSave() {
    if (!accountId) { setError('Elegí de qué cuenta sale la plata'); return }
    if (!categoryId) { setError('Elegí una categoría de egreso'); return }
    if (rows.some(r => !r.userId)) { setError('Falta elegir la persona en algún pago'); return }
    if (rows.some(r => !(Number(r.amount) > 0))) { setError('Cada pago tiene que tener un monto mayor a 0'); return }
    if (overpaid) { setError(`Supera lo que le queda por cobrar al equipo (${fmtMoney(left, 'ARS')})`); return }
    setSaving(true); setError('')
    try {
      await api.post(`/finanzas/extras/${extra.id}/team-payouts`, {
        accountId: Number(accountId), categoryId: Number(categoryId), date,
        payouts: rows.map(r => ({ userId: Number(r.userId), amount: Number(r.amount) })),
      })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white pr-8">Pagar al equipo</h2>
        <p className="text-xs text-gray-400 mb-4">{extra.action} · {extra.item?.name}</p>

        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-2">
            <p className="text-[11px] text-gray-400">Del equipo</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{fmtMoney(teamAmount, 'ARS')}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-2">
            <p className="text-[11px] text-gray-400">Ya pagado</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{fmtMoney(alreadyPaid, 'ARS')}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-2">
            <p className="text-[11px] text-gray-400">Queda</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{fmtMoney(left, 'ARS')}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className={label}>A quién y cuánto</label>
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <select className={input} value={r.userId} onChange={e => setRow(i, { userId: e.target.value })}>
                    <option value="">Elegir persona…</option>
                    {activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <input type="number" step="any" min="0" className={`${input} w-36 shrink-0`} placeholder="Monto" value={r.amount} onChange={e => setRow(i, { amount: e.target.value })} />
                  {rows.length > 1 && (
                    <button type="button" onClick={() => removeRow(i)} aria-label="Quitar" className="text-gray-400 hover:text-red-500 shrink-0 px-1"><Icon as={X} size={14} /></button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addRow} className="mt-2 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
              <Icon as={Plus} size={13} /> Agregar persona
            </button>
            <p className={`text-xs mt-1 ${overpaid ? 'text-red-500' : 'text-gray-400'}`}>Total a pagar: {fmtMoney(rowsTotal, 'ARS')}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Sale de</label>
              <select className={input} value={accountId} onChange={e => setAccountId(e.target.value)}>
                <option value="">Elegir cuenta…</option>
                {accounts.filter(a => a.active).map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Fecha</label>
              <input type="date" className={input} value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={label}>Categoría del egreso</label>
            <select className={input} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">Elegir…</option>
              {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <p className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-900/40 rounded-lg p-2">Se registra un egreso por persona desde esa cuenta (lo ves en Egresos, ahí podés sumarle impuestos). Cuando se paga todo, el extra queda con el equipo pagado.</p>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg py-2 text-sm font-medium">Cancelar</button>
            <button disabled={saving} onClick={handleSave} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">Registrar pagos</button>
          </div>
        </div>
      </div>
    </div>
  )
}
