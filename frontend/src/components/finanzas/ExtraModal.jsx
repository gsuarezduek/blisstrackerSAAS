import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Icon } from '../ui/Icon'
import api from '../../api/client'
import ConfirmModal from '../ConfirmModal'
import { fmtMoney } from '../../utils/format'
import { extraStatusMeta, STATUS_BADGE } from './financeCatalog'
import NewCustomerModal from './NewCustomerModal'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm'
const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
const today = () => new Date().toISOString().slice(0, 10)

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

// Nuevo/editar Extra (sección 4.6): fecha, cliente (con alta rápida de uno
// nuevo), acción, total, split empresa/proveedores/equipo (equipo siempre es
// el resto, total - empresa - proveedores — no se carga a mano), cantidad de
// pagos (default iguales, ver spec 3.6). Editar permite tocar también los
// montos — el backend reparte sola la diferencia entre las cuotas sin cobrar.
//
// La plata NO se mueve al cambiar el estado: cada cuota pendiente tiene
// "Registrar cobro" (`onCollect` → carga de ingreso ya completa, se elige
// banco y fecha) y la parte del equipo se paga con "Pagar al equipo"
// (`onPayTeam` → un egreso por persona).
export default function ExtraModal({ extra, items, categories, issuers, onClose, onSaved, onCollect, onPayTeam, onDataChange }) {
  const isNew = !extra
  const [createdCustomers, setCreatedCustomers] = useState([])
  // `createdCustomers`: los dados de alta desde acá, hasta que `items` del padre se refresque (dedup por id).
  const customers = [...new Map([...items.filter(i => i.tracksAccount && i.active), ...createdCustomers].map(c => [c.id, c])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
  const [itemId, setItemId] = useState(extra ? String(extra.itemId) : '')
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [date, setDate] = useState(extra?.date?.slice(0, 10) || today())
  const [action, setAction] = useState(extra?.action || '')
  const [total, setTotal] = useState(extra ? String(extra.total) : '')
  const [companyAmount, setCompanyAmount] = useState(extra ? String(extra.companyAmount) : '')
  const [providerAmount, setProviderAmount] = useState(extra ? String(extra.providerAmount || 0) : '')
  const [numberOfPayments, setNumberOfPayments] = useState(extra?.payments?.length || 1)
  const [status, setStatus] = useState(extra?.status || 'in_progress')
  const [teamPaid, setTeamPaid] = useState(extra?.teamPaid || false)
  const [notes, setNotes] = useState(extra?.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [payoutToUndo, setPayoutToUndo] = useState(null)
  const [undoing, setUndoing] = useState(false)

  const teamAmount = total ? Number(total) - (Number(companyAmount) || 0) - (Number(providerAmount) || 0) : 0
  const paidTotal = (extra?.payments || []).filter(p => p.movementId).reduce((s, p) => s + Number(p.amount), 0)
  const teamPayouts = extra?.teamPayouts || []
  const teamPaidAmount = Number(extra?.teamPaidAmount || 0)
  const teamLeft = Math.max(0, Number(extra?.teamAmount || 0) - teamPaidAmount)
  const amountsDirty = extra && (total !== String(extra.total) || companyAmount !== String(extra.companyAmount) || providerAmount !== String(extra.providerAmount || 0))

  async function handleSave() {
    if (total !== '' && (Number(total) <= 0 || teamAmount < 0)) { setError('Revisá los montos — empresa + proveedores no puede superar el total'); return }
    setSaving(true); setError('')
    try {
      if (isNew) {
        if (!itemId) { setError('Elegí el cliente'); setSaving(false); return }
        if (!action.trim() || !total || Number(total) <= 0) { setError('Revisá los campos requeridos'); setSaving(false); return }
        await api.post('/finanzas/extras', {
          itemId: Number(itemId), date, action: action.trim(), total: Number(total),
          companyAmount: Number(companyAmount) || 0, providerAmount: Number(providerAmount) || 0, numberOfPayments: Number(numberOfPayments),
        })
      } else {
        const body = {
          action: action.trim(), status, notes: notes.trim(),
          total: Number(total), companyAmount: Number(companyAmount) || 0, providerAmount: Number(providerAmount) || 0,
        }
        // Con pagos al equipo registrados, "equipo pagado" lo calcula el backend.
        if (teamPayouts.length === 0) body.teamPaid = teamPaid
        await api.patch(`/finanzas/extras/${extra.id}`, body)
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  async function handleUndoPayout() {
    setUndoing(true)
    try {
      await api.delete(`/finanzas/extras/${extra.id}/team-payouts/${payoutToUndo.id}`)
      setPayoutToUndo(null)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo deshacer el pago')
      setPayoutToUndo(null)
    } finally { setUndoing(false) }
  }

  const amountsFields = (
    <>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={label}>Total</label>
          <input type="number" step="any" className={input} value={total} onChange={e => setTotal(e.target.value)} />
        </div>
        <div>
          <label className={label}>Para la empresa</label>
          <input type="number" step="any" className={input} value={companyAmount} onChange={e => setCompanyAmount(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className={label}>Para proveedores</label>
          <input type="number" step="any" className={input} value={providerAmount} onChange={e => setProviderAmount(e.target.value)} placeholder="0" />
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Para el equipo (resto): {fmtMoney(teamAmount, 'ARS')}
        {paidTotal > 0 && ` · Ya cobrado: ${fmtMoney(paidTotal, 'ARS')} (no se toca)`}
      </p>
    </>
  )

  return (
    <>
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 pr-8">{isNew ? 'Nuevo extra' : 'Editar extra'}</h2>

        <div className="space-y-4">
          {isNew ? (
            <>
              <div>
                <label className={label}>Cliente</label>
                <div className="flex gap-2">
                  <select className={input} value={itemId} onChange={e => setItemId(e.target.value)}>
                    <option value="">{customers.length ? 'Elegir…' : 'Todavía no hay clientes'}</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowNewCustomer(true)} className="shrink-0 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-3 text-xs font-medium flex items-center gap-1">
                    <Icon as={Plus} size={13} /> Nuevo
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Solo aparecen los clientes (ítems con seguimiento de cuenta).</p>
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
              {amountsFields}
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
                <p className="text-[11px] text-gray-400 mt-1">"Terminado" marca el trabajo como entregado (y te avisa en Pendientes qué cobrar). La plata entra cuando registrás el cobro de cada pago. Pasa a "Cobrado" solo, con el último.</p>
              </div>
              {amountsFields}

              <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Pagos del cliente</p>
                {extra.payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-gray-600 dark:text-gray-300">Pago {p.number}</span>
                    <span className="text-gray-900 dark:text-white">{fmtMoney(p.amount, 'ARS')}</span>
                    {p.movementId ? (
                      <span className="text-green-600 dark:text-green-400 text-xs">Cobrado{p.movement?.date ? ` el ${fmtDate(p.movement.date)}` : ''}</span>
                    ) : (
                      <button type="button" onClick={() => onCollect(extra, p)} disabled={amountsDirty}
                        title={amountsDirty ? 'Guardá los cambios de montos antes de cobrar' : undefined}
                        className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-40 disabled:no-underline">
                        Registrar cobro
                      </button>
                    )}
                  </div>
                ))}
                {amountsDirty && <p className="text-[11px] text-amber-600 dark:text-amber-400">Al guardar, las cuotas pendientes se recalculan solas para completar el nuevo total.</p>}
              </div>

              {Number(extra.teamAmount) > 0 && (
                <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Equipo</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {fmtMoney(teamPaidAmount, 'ARS')} de {fmtMoney(extra.teamAmount, 'ARS')} pagado
                    </p>
                  </div>
                  {teamPayouts.map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-gray-700 dark:text-gray-200 truncate">{p.user?.name || 'Persona eliminada'}</span>
                      <span className="text-xs text-gray-400 shrink-0">{fmtDate(p.movement.date)} · {p.movement.account?.name}</span>
                      <span className="text-gray-900 dark:text-white shrink-0">{fmtMoney(p.movement.amount, p.movement.account?.currency || 'ARS')}</span>
                      <button type="button" onClick={() => setPayoutToUndo(p)} aria-label="Deshacer pago" title="Deshacer pago (borra el egreso)" className="text-gray-300 hover:text-red-500 shrink-0"><Icon as={X} size={13} /></button>
                    </div>
                  ))}
                  {teamLeft > 0 ? (
                    <button type="button" onClick={() => onPayTeam(extra)} disabled={amountsDirty}
                      title={amountsDirty ? 'Guardá los cambios de montos antes de pagar' : undefined}
                      className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-40 flex items-center gap-1">
                      <Icon as={Plus} size={13} /> Pagar al equipo ({fmtMoney(teamLeft, 'ARS')} pendiente)
                    </button>
                  ) : (
                    <p className="text-xs text-green-600 dark:text-green-400">Equipo pagado</p>
                  )}
                  {teamPayouts.length === 0 && teamLeft > 0 && (
                    <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 pt-1">
                      <input type="checkbox" checked={teamPaid} onChange={e => setTeamPaid(e.target.checked)} /> Ya se le pagó por fuera (sin registrar egresos)
                    </label>
                  )}
                </div>
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

    {showNewCustomer && (
      <NewCustomerModal categories={categories} issuers={issuers}
        onClose={() => setShowNewCustomer(false)}
        onCreated={(created) => {
          setShowNewCustomer(false)
          setCreatedCustomers(cs => [...cs, created])
          setItemId(String(created.id))
          onDataChange?.()
        }}
      />
    )}
    <ConfirmModal open={payoutToUndo != null} title="Deshacer pago al equipo"
      message={payoutToUndo ? `Se borra el egreso de ${fmtMoney(payoutToUndo.movement.amount, 'ARS')} a ${payoutToUndo.user?.name || '—'}. Se puede restaurar desde Egresos.` : ''}
      confirmLabel="Deshacer" loading={undoing} onConfirm={handleUndoPayout} onCancel={() => setPayoutToUndo(null)} />
    </>
  )
}
