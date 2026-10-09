import { useState } from 'react'
import api from '../../api/client'
import InvoiceAttachmentsList from './InvoiceAttachmentsList'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
const today = () => new Date().toISOString().slice(0, 10)
function plusDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Nueva factura (sección 4.8): cliente (solo con seguimiento), número,
// emisión, vencimiento (default emisión + 10 días, editable), concepto,
// monto, adjuntos. Los adjuntos se habilitan recién después de crear la
// factura (el presign necesita un invoiceId real) — mismo criterio que
// AccountModal (crea, después gestiona sub-recursos con el id ya asignado).
export default function NewInvoiceModal({ items, defaultItemId, onClose, onSaved }) {
  const customers = items.filter(i => i.tracksAccount && i.active)
  const [itemId, setItemId] = useState(defaultItemId ? String(defaultItemId) : (customers[0]?.id ? String(customers[0].id) : ''))
  const [number, setNumber] = useState('')
  const [issueDate, setIssueDate] = useState(today())
  const [dueDate, setDueDate] = useState(plusDays(today(), 10))
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)

  function handleIssueDateChange(v) {
    setIssueDate(v)
    setDueDate(plusDays(v, 10))
  }

  async function handleSave() {
    if (!itemId || !number.trim() || !concept.trim() || !amount || Number(amount) <= 0) { setError('Revisá los campos requeridos'); return }
    setSaving(true); setError('')
    try {
      const res = await api.post('/finanzas/invoices', { itemId: Number(itemId), number: number.trim(), issueDate, dueDate, concept: concept.trim(), amount: Number(amount) })
      setCreated(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  function handleDone() {
    onSaved(created)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={created ? undefined : onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {!created && <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>}
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 pr-8">Nueva factura</h2>

        {created ? (
          <div className="space-y-4">
            <p className="text-sm text-green-600 dark:text-green-400">Factura {created.number} creada.</p>
            <InvoiceAttachmentsList invoiceId={created.id} attachments={created.attachments} onChanged={async () => {
              const res = await api.get('/finanzas/invoices', { params: { itemId } })
              const fresh = res.data.find(i => i.id === created.id)
              if (fresh) setCreated(fresh)
            }} />
            <button onClick={handleDone} className="w-full bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-2 text-sm font-medium">Listo</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className={label}>Cliente</label>
              <select className={input} value={itemId} onChange={e => setItemId(e.target.value)}>
                <option value="">Elegir…</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {customers.length === 0 && <p className="text-xs text-gray-400 mt-1">Solo aparecen los items con seguimiento de cuenta.</p>}
            </div>
            <div>
              <label className={label}>Número</label>
              <input className={input} value={number} onChange={e => setNumber(e.target.value)} placeholder="FC A 0001-00000161" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Emisión</label>
                <input type="date" className={input} value={issueDate} onChange={e => handleIssueDateChange(e.target.value)} />
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
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-4 py-2 text-sm font-medium">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">Guardar factura</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
