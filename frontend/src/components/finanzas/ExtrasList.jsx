import { useEffect, useState, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { Icon } from '../ui/Icon'
import api from '../../api/client'
import { fmtMoney } from '../../utils/format'
import { extraStatusMeta, STATUS_BADGE } from './financeCatalog'
import ExtraModal from './ExtraModal'
import LoadMovementModal from './LoadMovementModal'
import TeamPayoutModal from './TeamPayoutModal'

const input = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm'
const EMPTY = { from: '', to: '', itemId: '', status: '', payments: '' }

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

// "Extras" (sección 4.6): + Agregar extra + filtros + tabla (fecha, cliente,
// acción, pagos "X de Y", total, empresa, equipo, estado, notas). Clic en fila → editar.
// "Registrar cobro" de una cuota abre la carga de ingreso ya completa;
// "Pagar al equipo" abre TeamPayoutModal. `request` ({ extraId, nonce }) lo
// manda Pendientes al tocar la acción de una tarea de un extra: abre el cobro
// de la próxima cuota, o el pago al equipo si el extra ya está cobrado.
export default function ExtrasList({ items, accounts, categories, taxes, issuers, request, onChanged, onDataChange }) {
  const [filters, setFilters] = useState(EMPTY)
  const [extras, setExtras] = useState(null)
  const [modalExtra, setModalExtra] = useState(undefined) // undefined = cerrado, null = nuevo
  const [collecting, setCollecting] = useState(null) // { extra, payment }
  const [payingTeam, setPayingTeam] = useState(null) // extra

  const customers = items.filter(i => i.tracksAccount)

  const load = useCallback(async () => {
    const params = {}
    if (filters.from) params.from = filters.from
    if (filters.to) params.to = filters.to
    if (filters.itemId) params.itemId = filters.itemId
    if (filters.status) params.status = filters.status
    if (filters.payments) params.payments = filters.payments
    const res = await api.get('/finanzas/extras', { params })
    setExtras(res.data)
  }, [filters])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!request) return
    let cancelled = false
    api.get('/finanzas/extras').then(res => {
      if (cancelled) return
      const ex = res.data.find(e => e.id === request.extraId)
      if (!ex) return
      const nextUnpaid = ex.payments.find(p => !p.movementId)
      if (ex.status !== 'collected' && nextUnpaid) setCollecting({ extra: ex, payment: nextUnpaid })
      else if (ex.status === 'collected' && Number(ex.teamAmount) > Number(ex.teamPaidAmount || 0)) setPayingTeam(ex)
      else setModalExtra(ex)
    })
    return () => { cancelled = true }
  }, [request])

  function set(patch) { setFilters(f => ({ ...f, ...patch })) }
  const isEmpty = Object.values(filters).every(v => !v)

  function handleSaved() {
    setModalExtra(undefined)
    load()
    onChanged?.()
  }

  function startCollect(extra, payment) {
    setModalExtra(undefined)
    setCollecting({ extra, payment })
  }
  function startPayTeam(extra) {
    setModalExtra(undefined)
    setPayingTeam(extra)
  }
  function handleMoneySaved() {
    setCollecting(null)
    setPayingTeam(null)
    load()
    onChanged?.()
    onDataChange?.()
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Extras</h3>
        <button onClick={() => setModalExtra(null)} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
          <Icon as={Plus} size={13} /> Agregar extra
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <input type="date" className={input} value={filters.from} onChange={e => set({ from: e.target.value })} />
        <input type="date" className={input} value={filters.to} onChange={e => set({ to: e.target.value })} />
        <select className={input} value={filters.itemId} onChange={e => set({ itemId: e.target.value })}>
          <option value="">Todos los clientes</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={input} value={filters.status} onChange={e => set({ status: e.target.value })}>
          <option value="">Todos los estados</option>
          <option value="in_progress">En curso</option>
          <option value="finished">Terminado</option>
          <option value="collected">Cobrado</option>
        </select>
        <select className={input} value={filters.payments} onChange={e => set({ payments: e.target.value })}>
          <option value="">Todos los pagos</option>
          <option value="pending">Con pagos pendientes</option>
          <option value="complete">Pagado completo</option>
        </select>
        {!isEmpty && <button onClick={() => setFilters(EMPTY)} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">Limpiar</button>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th className="py-2 pr-2 font-medium">Fecha</th>
              <th className="py-2 pr-2 font-medium">Cliente</th>
              <th className="py-2 pr-2 font-medium">Acción</th>
              <th className="py-2 pr-2 font-medium">Pagos</th>
              <th className="py-2 pr-2 font-medium text-right">Total</th>
              <th className="py-2 pr-2 font-medium text-right">Empresa</th>
              <th className="py-2 pr-2 font-medium text-right">Proveedores</th>
              <th className="py-2 pr-2 font-medium text-right">Equipo</th>
              <th className="py-2 pr-2 font-medium">Estado</th>
              <th className="py-2 pl-2 font-medium">Notas</th>
            </tr>
          </thead>
          <tbody>
            {(extras || []).map(ex => {
              const meta = extraStatusMeta(ex.status)
              return (
                <tr key={ex.id} onClick={() => setModalExtra(ex)} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-900/30 cursor-pointer">
                  <td className="py-2 pr-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(ex.date)}</td>
                  <td className="py-2 pr-2 text-gray-900 dark:text-white">{ex.item?.name}</td>
                  <td className="py-2 pr-2 text-gray-700 dark:text-gray-300">{ex.action}</td>
                  <td className="py-2 pr-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{ex.paidCount} de {ex.totalPayments}</td>
                  <td className="py-2 pr-2 text-right text-gray-900 dark:text-white">{fmtMoney(ex.total, 'ARS')}</td>
                  <td className="py-2 pr-2 text-right text-gray-500 dark:text-gray-400">{fmtMoney(ex.companyAmount, 'ARS')}</td>
                  <td className="py-2 pr-2 text-right text-gray-500 dark:text-gray-400">{fmtMoney(ex.providerAmount, 'ARS')}</td>
                  <td className="py-2 pr-2 text-right text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {fmtMoney(ex.teamAmount, 'ARS')}
                    {Number(ex.teamAmount) > 0 && ex.teamPaid && <span className="block text-[10px] text-green-600 dark:text-green-400">pagado</span>}
                  </td>
                  <td className="py-2 pr-2"><span className={`text-[11px] rounded-full px-2 py-0.5 ${STATUS_BADGE[meta.color]}`}>{meta.label}</span></td>
                  <td className="py-2 pl-2 text-gray-400 truncate max-w-[8rem]">{ex.notes}</td>
                </tr>
              )
            })}
            {extras !== null && extras.length === 0 && <tr><td colSpan={10} className="text-center text-xs text-gray-400 py-6">Sin extras.</td></tr>}
          </tbody>
        </table>
      </div>

      {modalExtra !== undefined && (
        <ExtraModal extra={modalExtra} items={items} categories={categories} issuers={issuers}
          onClose={() => setModalExtra(undefined)} onSaved={handleSaved}
          onCollect={startCollect} onPayTeam={startPayTeam} onDataChange={onDataChange} />
      )}
      {collecting && (
        <LoadMovementModal
          accounts={accounts} categories={categories} items={items} taxes={taxes}
          title={`Registrar cobro · ${collecting.extra.action} (pago ${collecting.payment.number} de ${collecting.extra.payments.length})`}
          prefill={{
            item: items.find(i => i.id === collecting.extra.itemId) || collecting.extra.item,
            amount: collecting.payment.amount,
            extraPaymentId: collecting.payment.id,
          }}
          onClose={() => setCollecting(null)}
          onSaved={handleMoneySaved}
        />
      )}
      {payingTeam && (
        <TeamPayoutModal extra={payingTeam} accounts={accounts} categories={categories}
          onClose={() => setPayingTeam(null)} onSaved={handleMoneySaved} />
      )}
    </div>
  )
}
