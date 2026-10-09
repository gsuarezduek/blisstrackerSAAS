import { useEffect, useState, useCallback } from 'react'
import { Paperclip } from 'lucide-react'
import { Icon } from '../ui/Icon'
import api from '../../api/client'
import { fmtMoney } from '../../utils/format'

const input = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm'

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// "Movimientos" (sección 4.5a): filtro desde/hasta, fila de saldo anterior,
// filas cronológicas con saldo acumulado.
export default function CustomerLedgerPanel({ itemId, currency, refreshKey }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState(null)

  const load = useCallback(async () => {
    const params = {}
    if (from) params.from = from
    if (to) params.to = to
    const res = await api.get(`/finanzas/customers/${itemId}/ledger`, { params })
    setData(res.data)
  }, [itemId, from, to])

  useEffect(() => { load() }, [load, refreshKey])

  if (!data) return <p className="text-sm text-gray-400 text-center py-8">Cargando…</p>

  return (
    <div>
      <div className="flex justify-end gap-2 mb-3">
        <input type="date" className={input} value={from} onChange={e => setFrom(e.target.value)} />
        <span className="self-center text-gray-400 text-sm">a</span>
        <input type="date" className={input} value={to} onChange={e => setTo(e.target.value)} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th className="py-2 pr-2 font-medium">Fecha</th>
              <th className="py-2 pr-2 font-medium">Concepto</th>
              <th className="py-2 pr-2 font-medium text-right">Facturado</th>
              <th className="py-2 pr-2 font-medium text-right">Cobrado</th>
              <th className="py-2 pl-2 font-medium text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {from && (
              <tr className="border-b border-gray-50 dark:border-gray-700/50">
                <td colSpan={4} className="py-2 pr-2 text-gray-400 italic">Saldo anterior</td>
                <td className="py-2 pl-2 text-right font-medium text-gray-700 dark:text-gray-300">{fmtMoney(data.openingBalance, currency)}</td>
              </tr>
            )}
            {data.rows.map(row => (
              <tr key={row.id} className="border-b border-gray-50 dark:border-gray-700/50">
                <td className="py-2 pr-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(row.date)}</td>
                <td className="py-2 pr-2 text-gray-900 dark:text-white">
                  {row.concept}
                  {row.kind === 'invoice' && row.attachments?.length > 0 && (
                    <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-gray-400"><Icon as={Paperclip} size={11} />{row.attachments[0].name}</span>
                  )}
                  {row.kind === 'payment' && row.checkPending && (
                    <span className="ml-1.5 text-[11px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded-full px-1.5 py-0.5">Cheque pendiente · {fmtDate(row.checkDate)}</span>
                  )}
                  {row.kind === 'payment' && row.appliedTo && <span className="ml-1.5 text-xs text-gray-400">→ {row.appliedTo}</span>}
                </td>
                <td className="py-2 pr-2 text-right text-gray-700 dark:text-gray-300">{row.facturado !== '0' ? fmtMoney(row.facturado, currency) : ''}</td>
                <td className="py-2 pr-2 text-right text-green-600 dark:text-green-400">{row.cobrado !== '0' ? fmtMoney(row.cobrado, currency) : ''}</td>
                <td className="py-2 pl-2 text-right font-medium text-gray-900 dark:text-white">{fmtMoney(row.balance, currency)}</td>
              </tr>
            ))}
            {data.rows.length === 0 && <tr><td colSpan={5} className="text-center text-xs text-gray-400 py-6">Sin movimientos en este período.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
