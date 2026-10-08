import { useEffect, useState, useCallback } from 'react'
import api from '../../api/client'
import { fmtMoney } from '../../utils/format'
import { transferReasonLabel } from './financeCatalog'
import UpdateFundValuationModal from './UpdateFundValuationModal'

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Drill-down de una cuenta desde Saldos: sus movimientos + transferencias
// (las transferencias no tienen pestaña propia — decisión confirmada con el
// usuario, sección "Saldos" del plan) y, si tiene inversiones, su historial
// de valuaciones + acción para cargar una nueva.
export default function AccountDetailPanel({ account, onClose, onChanged }) {
  const [rows, setRows] = useState(null)
  const [valuations, setValuations] = useState([])
  const [showValuationModal, setShowValuationModal] = useState(false)

  const load = useCallback(async () => {
    const [movRes, trfRes, valRes] = await Promise.all([
      api.get('/finanzas/movements', { params: { accountId: account.id } }),
      api.get('/finanzas/transfers', { params: { accountId: account.id } }),
      account.hasInvestments ? api.get('/finanzas/fund-valuations', { params: { accountId: account.id } }) : Promise.resolve({ data: [] }),
    ])
    const movementRows = movRes.data.map(m => ({
      kind: m.type, date: m.date, id: `m${m.id}`,
      label: m.item?.name || m.category?.name || '—',
      sub: m.category?.name, amount: m.amount,
    }))
    const transferRows = trfRes.data.map(t => ({
      kind: 'transfer', date: t.date, id: `t${t.id}`,
      label: transferReasonLabel(t.reason),
      sub: t.fromAccountId === account.id ? `→ ${t.toAccount.name}` : `← ${t.fromAccount.name}`,
      amount: t.fromAccountId === account.id ? `-${t.fromAmount}` : t.toAmount,
    }))
    const combined = [...movementRows, ...transferRows].sort((a, b) => new Date(b.date) - new Date(a.date))
    setRows(combined)
    setValuations(valRes.data)
  }, [account.id, account.hasInvestments])

  useEffect(() => { load() }, [load])

  function handleValuationSaved() {
    setShowValuationModal(false)
    load()
    onChanged?.()
  }

  const KIND_META = {
    income:   { label: 'Ingreso', cls: 'text-green-600 dark:text-green-400' },
    expense:  { label: 'Egreso',  cls: 'text-red-600 dark:text-red-400' },
    transfer: { label: 'Transferencia', cls: 'text-blue-600 dark:text-blue-400' },
  }

  return (
    <>
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        <div className="flex items-start justify-between pr-8 mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{account.name}</h2>
            <p className="text-xs text-gray-400">{account.currency} · Disponible {fmtMoney(account.disponible, account.currency)}{account.hasInvestments && ` · En fondos ${fmtMoney(account.fondos, account.currency)}`}</p>
          </div>
          {account.hasInvestments && (
            <button onClick={() => setShowValuationModal(true)} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-3 py-1.5 text-xs font-medium shrink-0">+ Valuación</button>
          )}
        </div>

        {account.hasInvestments && valuations.length > 0 && (
          <div className="mb-4 bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Historial de valuaciones</p>
            <div className="space-y-1">
              {valuations.slice(0, 5).map(v => (
                <div key={v.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">{fmtDate(v.date)}</span>
                  <span className="text-gray-700 dark:text-gray-300">{fmtMoney(v.value, account.currency)}</span>
                  <span className={Number(v.periodResult) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {Number(v.periodResult) >= 0 ? '+' : ''}{fmtMoney(v.periodResult, account.currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Movimientos y transferencias</p>
        {rows === null ? (
          <p className="text-sm text-gray-400 text-center py-8">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Sin actividad todavía.</p>
        ) : (
          <div className="space-y-1">
            {rows.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-gray-50 dark:border-gray-700/50">
                <span className="text-gray-400 w-20 shrink-0">{fmtDate(r.date)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 dark:text-white truncate">{r.label}</p>
                  <p className={`text-xs ${KIND_META[r.kind].cls}`}>{KIND_META[r.kind].label}{r.sub ? ` · ${r.sub}` : ''}</p>
                </div>
                <span className={`font-medium shrink-0 ${r.kind === 'expense' || String(r.amount).startsWith('-') ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                  {fmtMoney(r.amount, account.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    {showValuationModal && (
      <UpdateFundValuationModal account={account} onClose={() => setShowValuationModal(false)} onSaved={handleValuationSaved} />
    )}
    </>
  )
}
