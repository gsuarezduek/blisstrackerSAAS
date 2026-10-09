import { Paperclip } from 'lucide-react'
import { Icon } from '../ui/Icon'
import { Card, CardHeader } from '../../pages/project-detail/ui.jsx'
import { fmtMoney } from '../../utils/format'
import { invoiceStatusMeta, STATUS_BADGE } from './financeCatalog'

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

// "Facturas pendientes" (sección 4.5, columna lateral): número, estado,
// concepto, vencimiento, monto pendiente, adjunto, "Registrar cobro de esta factura".
export default function PendingInvoicesList({ invoices, currency, onRegisterPayment }) {
  const pending = invoices.filter(i => i.status !== 'paid')

  return (
    <Card>
      <CardHeader title="Facturas pendientes" count={pending.length} />
      <div className="px-4 pb-4 space-y-3">
        {pending.length === 0 && <p className="text-xs text-gray-400">Sin facturas pendientes.</p>}
        {pending.map(inv => {
          const meta = invoiceStatusMeta(inv.status)
          const balance = Number(inv.amount) - Number(inv.collected)
          return (
            <div key={inv.id} className="border border-gray-100 dark:border-gray-700 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{inv.number}</span>
                <span className={`text-[11px] rounded-full px-2 py-0.5 ${STATUS_BADGE[meta.color]}`}>{meta.label}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{inv.concept} · Vence {fmtDate(inv.dueDate)}</p>
              {inv.attachments?.length > 0 && <p className="text-[11px] text-gray-400 flex items-center gap-1"><Icon as={Paperclip} size={11} />{inv.attachments[0].name}</p>}
              <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">{fmtMoney(balance, currency)}</p>
              <button onClick={() => onRegisterPayment(inv)} className="w-full mt-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg py-1.5 text-xs font-medium">
                Registrar cobro de esta factura
              </button>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
