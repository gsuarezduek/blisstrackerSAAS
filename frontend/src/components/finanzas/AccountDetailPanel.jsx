import { useEffect, useState, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import { Icon } from '../ui/Icon'
import api from '../../api/client'
import ConfirmModal from '../ConfirmModal'
import { fmtMoney } from '../../utils/format'
import { transferReasonLabel } from './financeCatalog'
import UpdateFundValuationModal from './UpdateFundValuationModal'
import AdjustBalanceModal from './AdjustBalanceModal'
import LoadMovementModal from './LoadMovementModal'

const input = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

const KIND_FILTERS = [
  { key: '', label: 'Todas las operaciones' },
  { key: 'income', label: 'Ingresos' },
  { key: 'expense', label: 'Egresos' },
  { key: 'adjustment', label: 'Ajustes de saldo' },
  { key: 'transfer', label: 'Transferencias y fondos' },
]

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function normalizeText(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Drill-down de una cuenta desde Saldos: sus movimientos + transferencias
// (las transferencias no tienen pestaña propia — decisión confirmada con el
// usuario, sección "Saldos" del plan) y, si tiene inversiones, su historial
// de valuaciones + acción para cargar una nueva. "Ajustar saldo" carga un
// ajuste (monto con signo) que mueve el disponible sin ser ingreso/egreso.
// "Aporte"/"Rescate" abren el form de "+ Cargar" con esta cuenta ya elegida.
export default function AccountDetailPanel({ account, accounts, taxes, onClose, onChanged }) {
  const [rows, setRows] = useState(null)
  const [valuations, setValuations] = useState([])
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState('')
  const [showValuationModal, setShowValuationModal] = useState(false)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [fundMoveReason, setFundMoveReason] = useState(null)
  const [adjustmentToDelete, setAdjustmentToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [toDeleteValuation, setToDeleteValuation] = useState(null)
  const [deletingValuation, setDeletingValuation] = useState(false)

  const load = useCallback(async () => {
    const [movRes, trfRes, valRes, adjRes] = await Promise.all([
      api.get('/finanzas/movements', { params: { accountId: account.id } }),
      api.get('/finanzas/transfers', { params: { accountId: account.id } }),
      account.hasInvestments ? api.get('/finanzas/fund-valuations', { params: { accountId: account.id } }) : Promise.resolve({ data: [] }),
      api.get('/finanzas/adjustments', { params: { accountId: account.id } }),
    ])
    const movementRows = movRes.data.map(m => ({
      kind: m.type, date: m.date, id: `m${m.id}`,
      label: m.item?.name || m.category?.name || '—',
      sub: m.category?.name, amount: m.amount,
    }))
    const transferRows = trfRes.data.map(t => {
      const base = { kind: 'transfer', date: t.date, id: `t${t.id}`, label: transferReasonLabel(t.reason) }
      // Dentro de la misma cuenta el monto se lee como efecto sobre el disponible.
      if (t.fromAccountId === t.toAccountId) {
        return t.fromIsFund
          ? { ...base, sub: 'De fondos a disponible', amount: t.toAmount }
          : { ...base, sub: 'De disponible a fondos', amount: `-${t.fromAmount}` }
      }
      return t.fromAccountId === account.id
        ? { ...base, sub: `→ ${t.toAccount.name}`, amount: `-${t.fromAmount}` }
        : { ...base, sub: `← ${t.fromAccount.name}`, amount: t.toAmount }
    })
    const adjustmentRows = adjRes.data.map(a => ({
      kind: 'adjustment', date: a.date, id: `a${a.id}`, adjustmentId: a.id,
      label: a.note, sub: a.createdBy?.name, amount: a.amount,
    }))
    const combined = [...movementRows, ...transferRows, ...adjustmentRows].sort((a, b) => new Date(b.date) - new Date(a.date))
    setRows(combined)
    setValuations(valRes.data)
  }, [account.id, account.hasInvestments])

  useEffect(() => { load() }, [load])

  function handleValuationSaved() {
    setShowValuationModal(false)
    load()
    onChanged?.()
  }

  function handleAdjustmentSaved() {
    setShowAdjustModal(false)
    load()
    onChanged?.()
  }

  function handleFundMoveSaved() {
    setFundMoveReason(null)
    load()
    onChanged?.()
  }

  async function handleDeleteAdjustment() {
    setDeleting(true)
    try {
      await api.delete(`/finanzas/adjustments/${adjustmentToDelete}`)
      setAdjustmentToDelete(null)
      load()
      onChanged?.()
    } finally { setDeleting(false) }
  }

  async function handleDeleteValuation() {
    setDeletingValuation(true)
    try {
      await api.delete(`/finanzas/fund-valuations/${toDeleteValuation.id}`)
      setToDeleteValuation(null)
      load()
      onChanged?.()
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo eliminar')
    } finally { setDeletingValuation(false) }
  }

  const KIND_META = {
    income:   { label: 'Ingreso', cls: 'text-green-600 dark:text-green-400' },
    expense:  { label: 'Egreso',  cls: 'text-red-600 dark:text-red-400' },
    transfer: { label: 'Transferencia', cls: 'text-blue-600 dark:text-blue-400' },
    adjustment: { label: 'Ajuste de saldo', cls: 'text-purple-600 dark:text-purple-400' },
  }

  const query = normalizeText(search.trim())
  const visibleRows = (rows || []).filter(r =>
    (!kindFilter || r.kind === kindFilter)
    && (!query || normalizeText(`${r.label} ${r.sub || ''}`).includes(query)))

  return (
    <>
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        <div className="pr-8 mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{account.name}</h2>
          <p className="text-xs text-gray-400">{account.currency} · Disponible {fmtMoney(account.disponible, account.currency)}{account.hasInvestments && ` · En fondos ${fmtMoney(account.fondos, account.currency)}`}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={() => setShowAdjustModal(true)} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-3 py-1.5 text-xs font-medium">Ajustar saldo</button>
            {account.hasInvestments && (
              <>
                <button onClick={() => setFundMoveReason('fund_contribution')} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-3 py-1.5 text-xs font-medium">Aporte</button>
                <button onClick={() => setFundMoveReason('fund_redemption')} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-3 py-1.5 text-xs font-medium">Rescate</button>
                <button onClick={() => setShowValuationModal(true)} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-3 py-1.5 text-xs font-medium">+ Valuación</button>
              </>
            )}
          </div>
        </div>

        {account.hasInvestments && valuations.length > 0 && (
          <div className="mb-4 bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Historial de valuaciones</p>
            <div className="space-y-1">
              {valuations.slice(0, 5).map(v => (
                <div key={v.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-gray-500 dark:text-gray-400">{fmtDate(v.date)}</span>
                  <span className="text-gray-700 dark:text-gray-300">{fmtMoney(v.value, account.currency)}</span>
                  <span className={Number(v.periodResult) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {Number(v.periodResult) >= 0 ? '+' : ''}{fmtMoney(v.periodResult, account.currency)}
                  </span>
                  <button onClick={() => setToDeleteValuation(v)} title="Eliminar" className="text-gray-400 hover:text-red-500 shrink-0"><Icon as={Trash2} size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Movimientos, transferencias y ajustes</p>
        {rows === null ? (
          <p className="text-sm text-gray-400 text-center py-8">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Sin actividad todavía.</p>
        ) : (
          <div className="space-y-1">
            <div className="flex flex-wrap gap-2 mb-2">
              <input className={`${input} flex-1 min-w-[10rem]`} placeholder="Buscar por nombre…" aria-label="Buscar por nombre" value={search} onChange={e => setSearch(e.target.value)} />
              <select className={input} aria-label="Tipo de operación" value={kindFilter} onChange={e => setKindFilter(e.target.value)}>
                {KIND_FILTERS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
            </div>
            {visibleRows.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Ninguna operación coincide con el filtro.</p>}
            {visibleRows.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-gray-50 dark:border-gray-700/50">
                <span className="text-gray-400 w-20 shrink-0">{fmtDate(r.date)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 dark:text-white truncate">{r.label}</p>
                  <p className={`text-xs ${KIND_META[r.kind].cls}`}>{KIND_META[r.kind].label}{r.sub ? ` · ${r.sub}` : ''}</p>
                </div>
                <span className={`font-medium shrink-0 ${r.kind === 'expense' || String(r.amount).startsWith('-') ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                  {r.kind === 'adjustment' && !String(r.amount).startsWith('-') ? '+' : ''}{fmtMoney(r.amount, account.currency)}
                </span>
                {r.kind === 'adjustment' && (
                  <button onClick={() => setAdjustmentToDelete(r.adjustmentId)} title="Eliminar ajuste" className="text-gray-300 hover:text-red-500 p-1 shrink-0"><Icon as={Trash2} size={13} /></button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    {showValuationModal && (
      <UpdateFundValuationModal account={account} onClose={() => setShowValuationModal(false)} onSaved={handleValuationSaved} />
    )}
    {showAdjustModal && (
      <AdjustBalanceModal account={account} onClose={() => setShowAdjustModal(false)} onSaved={handleAdjustmentSaved} />
    )}
    {fundMoveReason && (
      <LoadMovementModal accounts={accounts} categories={[]} items={[]} taxes={taxes}
        title={`Mover fondos · ${account.name}`}
        transferPrefill={{ reason: fundMoveReason, accountId: account.id }}
        onClose={() => setFundMoveReason(null)} onSaved={handleFundMoveSaved} />
    )}
    <ConfirmModal open={adjustmentToDelete != null} title="Eliminar ajuste" message="El disponible de la cuenta vuelve a como estaba antes del ajuste."
      confirmLabel="Eliminar" loading={deleting} onConfirm={handleDeleteAdjustment} onCancel={() => setAdjustmentToDelete(null)} />

    <ConfirmModal open={!!toDeleteValuation} title="Eliminar valuación"
      message={toDeleteValuation ? `¿Eliminar la valuación del ${fmtDate(toDeleteValuation.date)} (${fmtMoney(toDeleteValuation.value, account.currency)})? Esta acción no se puede deshacer.` : ''}
      loading={deletingValuation} onConfirm={handleDeleteValuation} onCancel={() => setToDeleteValuation(null)} />
    </>
  )
}
