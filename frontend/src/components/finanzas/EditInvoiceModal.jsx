import { useState } from 'react'
import api from '../../api/client'
import { fmtMoney } from '../../utils/format'
import InvoiceAttachmentsList from './InvoiceAttachmentsList'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

// Las fechas se guardan al mediodía UTC (ver parseDate en controllers/finanzas/_shared.js),
// así que recortar el ISO da el día correcto sin corrimiento por timezone.
const toDateInput = (iso) => new Date(iso).toISOString().slice(0, 10)

// Editar una factura **informativa** (sección 4.5b): las que se cargaron a mano,
// sin pasar por ARCA. Un comprobante emitido electrónicamente no se edita — con
// CAE se corrige con una nota de crédito, y sin CAE (rechazado/pendiente de
// confirmar) se reconcilia o se elimina; el backend lo rechaza con 409 en los
// dos casos, así que acá sólo se llega desde una factura sin emisor.
export default function EditInvoiceModal({ invoice, onClose, onSaved }) {
  const [inv, setInv] = useState(invoice)
  const [number, setNumber] = useState(invoice.number || '')
  const [issueDate, setIssueDate] = useState(toDateInput(invoice.issueDate))
  const [dueDate, setDueDate] = useState(toDateInput(invoice.dueDate))
  const [concept, setConcept] = useState(invoice.concept)
  const [amount, setAmount] = useState(String(invoice.amount))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const collected = Number(inv.collected || 0)

  // No hay GET de una factura sola — se relee la lista del cliente y se busca
  // la nuestra (mismo recurso que usa NewInvoiceModal tras subir un adjunto).
  async function reloadInvoice() {
    const res = await api.get('/finanzas/invoices', { params: { itemId: inv.itemId } })
    const fresh = res.data.find(i => i.id === inv.id)
    if (fresh) setInv(fresh)
  }

  async function handleSave() {
    if (!number.trim()) { setError('Número requerido'); return }
    if (!concept.trim()) { setError('Concepto requerido'); return }
    if (!amount || Number(amount) <= 0) { setError('Monto inválido'); return }
    if (collected > 0 && Number(amount) < collected) {
      setError(`Ya se cobraron ${fmtMoney(collected, inv.currency)} de esta factura — el monto no puede quedar por debajo.`)
      return
    }
    setSaving(true); setError('')
    try {
      await api.patch(`/finanzas/invoices/${inv.id}`, {
        number: number.trim(), issueDate, dueDate, concept: concept.trim(), amount: Number(amount),
      })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 pr-8">Editar factura</h2>

        <div className="space-y-4">
          <div>
            <label className={label}>Número</label>
            <input autoFocus className={input} value={number} onChange={e => setNumber(e.target.value)} placeholder="FC A 0001-00000161" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Emisión</label>
              <input type="date" className={input} value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            </div>
            <div>
              <label className={label}>Vencimiento</label>
              <input type="date" className={input} value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={label}>Concepto</label>
            <input className={input} value={concept} onChange={e => setConcept(e.target.value)} />
          </div>

          <div>
            <label className={label}>Monto</label>
            <input type="number" step="any" className={input} value={amount} onChange={e => setAmount(e.target.value)} />
            {collected > 0 && (
              <p className="text-xs text-gray-400 mt-1">Ya cobrado: <strong className="text-gray-600 dark:text-gray-300">{fmtMoney(collected, inv.currency)}</strong> — el monto no puede quedar por debajo.</p>
            )}
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
            <InvoiceAttachmentsList invoiceId={inv.id} attachments={inv.attachments || []} onChanged={reloadInvoice} />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-4 py-2 text-sm font-medium">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar cambios'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
