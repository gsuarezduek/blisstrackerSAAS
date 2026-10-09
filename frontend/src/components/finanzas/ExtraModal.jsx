import { useState } from 'react'
import api from '../../api/client'
import { fmtMoney } from '../../utils/format'
import { extraStatusMeta, STATUS_BADGE } from './financeCatalog'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm'
const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
const today = () => new Date().toISOString().slice(0, 10)

// Nuevo/editar Extra (sección 4.6): fecha, cliente, acción, total, split
// empresa/equipo, cantidad de pagos (default iguales, ver spec 3.6). Editar
// cubre acción/estado/notas/equipo pagado — el split de cuotas no cobradas se
// reajusta desde el backend (PATCH payments), no hay UI de edición fina de
// montos por cuota en esta primera versión.
export default function ExtraModal({ extra, items, onClose, onSaved }) {
  const isNew = !extra
  const customers = items.filter(i => i.tracksAccount && i.active)
  const [itemId, setItemId] = useState(extra ? String(extra.itemId) : (customers[0]?.id ? String(customers[0].id) : ''))
  const [date, setDate] = useState(extra?.date?.slice(0, 10) || today())
  const [action, setAction] = useState(extra?.action || '')
  const [total, setTotal] = useState(extra ? String(extra.total) : '')
  const [companyAmount, setCompanyAmount] = useState(extra ? String(extra.companyAmount) : '')
  const [numberOfPayments, setNumberOfPayments] = useState(extra?.payments?.length || 1)
  const [status, setStatus] = useState(extra?.status || 'in_progress')
  const [teamPaid, setTeamPaid] = useState(extra?.teamPaid || false)
  const [notes, setNotes] = useState(extra?.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const teamAmount = total && companyAmount ? Number(total) - Number(companyAmount) : 0

  async function handleSave() {
    setSaving(true); setError('')
    try {
      if (isNew) {
        if (!itemId || !action.trim() || !total || Number(total) <= 0) { setError('Revisá los campos requeridos'); setSaving(false); return }
        await api.post('/finanzas/extras', {
          itemId: Number(itemId), date, action: action.trim(), total: Number(total),
          companyAmount: Number(companyAmount) || 0, numberOfPayments: Number(numberOfPayments),
        })
      } else {
        await api.patch(`/finanzas/extras/${extra.id}`, { action: action.trim(), status, teamPaid, notes: notes.trim() })
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 pr-8">{isNew ? 'Nuevo extra' : 'Editar extra'}</h2>

        <div className="space-y-4">
          {isNew ? (
            <>
              <div>
                <label className={label}>Cliente</label>
                <select className={input} value={itemId} onChange={e => setItemId(e.target.value)}>
                  <option value="">Elegir…</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Acción</label>
                <input className={input} value={action} onChange={e => setAction(e.target.value)} placeholder="ej. Video institucional" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Fecha</label>
                  <input type="date" className={input} value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div>
                  <label className={label}>Cantidad de pagos</label>
                  <select className={input} value={numberOfPayments} onChange={e => setNumberOfPayments(e.target.value)}>
                    {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Total</label>
                  <input type="number" step="any" className={input} value={total} onChange={e => setTotal(e.target.value)} />
                </div>
                <div>
                  <label className={label}>Para la empresa</label>
                  <input type="number" step="any" className={input} value={companyAmount} onChange={e => setCompanyAmount(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-gray-400">Para el equipo: {fmtMoney(teamAmount, 'ARS')}</p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-900 dark:text-white font-medium">{extra.item?.name}</p>
                <span className={`text-[11px] rounded-full px-2 py-0.5 ${STATUS_BADGE[extraStatusMeta(status).color]}`}>{extraStatusMeta(status).label}</span>
              </div>
              <div>
                <label className={label}>Acción</label>
                <input className={input} value={action} onChange={e => setAction(e.target.value)} />
              </div>
              <div>
                <label className={label}>Estado</label>
                <select className={input} value={status} onChange={e => setStatus(e.target.value)} disabled={extra.status === 'collected'}>
                  <option value="in_progress">En curso</option>
                  <option value="finished">Terminado</option>
                  {extra.status === 'collected' && <option value="collected">Cobrado</option>}
                </select>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Pagos</p>
                {extra.payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300">Pago {p.number}</span>
                    <span className="text-gray-900 dark:text-white">{fmtMoney(p.amount, 'ARS')}</span>
                    <span className={p.movementId ? 'text-green-600 dark:text-green-400 text-xs' : 'text-gray-400 text-xs'}>{p.movementId ? 'Cobrado' : 'Pendiente'}</span>
                  </div>
                ))}
              </div>
              {Number(extra.teamAmount) > 0 && (
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <input type="checkbox" checked={teamPaid} onChange={e => setTeamPaid(e.target.checked)} /> Equipo pagado ({fmtMoney(extra.teamAmount, 'ARS')})
                </label>
              )}
              <div>
                <label className={label}>Notas</label>
                <input className={input} value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg py-2 text-sm font-medium">Cancelar</button>
            <button disabled={saving} onClick={handleSave} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
