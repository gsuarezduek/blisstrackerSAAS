import { useState } from 'react'
import api from '../../api/client'
import InvoiceAttachmentsList from './InvoiceAttachmentsList'
import { ARCA_VAT_RATES } from './financeCatalog'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
const today = () => new Date().toISOString().slice(0, 10)
function plusDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Nueva factura (sección 4.8): cliente (solo con seguimiento), emisor
// opcional (facturación electrónica real vía ARCA, Etapa 2 — si no se elige
// ninguno, sigue siendo la factura informativa de siempre con número tipeado
// a mano), emisión, vencimiento (default emisión + 10 días, editable),
// concepto, monto, adjuntos. Los adjuntos se habilitan recién después de
// crear la factura (el presign necesita un invoiceId real) — mismo criterio
// que AccountModal (crea, después gestiona sub-recursos con el id ya asignado).
export default function NewInvoiceModal({ items, issuers, defaultItemId, onClose, onSaved }) {
  const customers = items.filter(i => i.tracksAccount && i.active)
  const [itemId, setItemId] = useState(defaultItemId ? String(defaultItemId) : (customers[0]?.id ? String(customers[0].id) : ''))
  const customer = customers.find(c => c.id === Number(itemId))
  const [issuerId, setIssuerId] = useState(customer?.defaultIssuer?.id ? String(customer.defaultIssuer.id) : '')
  const issuer = (issuers || []).find(i => i.id === Number(issuerId))
  const [number, setNumber] = useState('')
  const [issueDate, setIssueDate] = useState(today())
  const [dueDate, setDueDate] = useState(plusDays(today(), 10))
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState('')
  const [ivaRate, setIvaRate] = useState(String(ARCA_VAT_RATES[ARCA_VAT_RATES.length - 2])) // 21% default
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)

  function handleIssueDateChange(v) {
    setIssueDate(v)
    setDueDate(plusDays(v, 10))
  }

  function handleItemChange(v) {
    setItemId(v)
    const c = customers.find(x => x.id === Number(v))
    setIssuerId(c?.defaultIssuer?.id ? String(c.defaultIssuer.id) : '')
  }

  // Estos datos no los pide ARCA para autorizar la factura (issue() sale bien
  // sin ellos) pero sí son obligatorios para armar el PDF oficial después
  // (ver arcaVoucherDocument.js) — avisamos ANTES de emitir, no recién cuando
  // falla la descarga.
  const missingForPdf = issuerId ? [
    !issuer?.address && 'dirección',
    !issuer?.grossIncome && 'ingresos brutos',
    !issuer?.activitiesStartDate && 'inicio de actividades',
  ].filter(Boolean) : []
  const missingCustomerAddress = issuerId && customer && customer.ivaCondition !== 'consumidor_final' && !customer.address

  async function handleSave() {
    if (!itemId || !concept.trim() || !amount || Number(amount) <= 0) { setError('Revisá los campos requeridos'); return }
    if (!issuerId && !number.trim()) { setError('Número requerido'); return }
    if (issuer?.taxCondition === 'responsable_inscripto' && !ivaRate) { setError('Elegí una alícuota de IVA'); return }
    setSaving(true); setError('')
    try {
      const body = { itemId: Number(itemId), issueDate, dueDate, concept: concept.trim(), amount: Number(amount) }
      if (issuerId) {
        body.issuerId = Number(issuerId)
        if (issuer?.taxCondition === 'responsable_inscripto') body.ivaRate = Number(ivaRate)
      } else {
        body.number = number.trim()
      }
      const res = await api.post('/finanzas/invoices', body)
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
            {created.arcaStatus === 'authorized' ? (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/40 rounded-xl p-3">
                <p className="text-sm text-green-700 dark:text-green-400 font-medium">Factura {created.number} autorizada por ARCA</p>
                <p className="text-xs text-green-600 dark:text-green-500 mt-1">CAE {created.cae} · vence {fmtDate(created.caeExpiresAt)}</p>
              </div>
            ) : created.arcaStatus === 'rejected' ? (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-xl p-3">
                <p className="text-sm text-red-700 dark:text-red-400 font-medium">ARCA rechazó la factura</p>
                <p className="text-xs text-red-600 dark:text-red-500 mt-1">{(created.arcaResponseRaw?.issues || []).map(i => i.message).join(' · ') || 'Sin detalle del motivo.'}</p>
              </div>
            ) : created.arcaStatus ? (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-3">
                <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">Quedó pendiente de confirmar con ARCA</p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">No se perdió la emisión — se puede reconciliar más adelante.</p>
                {created.arcaResponseRaw?.error && (
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-2 font-mono break-all">{created.arcaResponseRaw.error}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-green-600 dark:text-green-400">Factura {created.number} creada.</p>
            )}
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
              <select className={input} value={itemId} onChange={e => handleItemChange(e.target.value)}>
                <option value="">Elegir…</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {customers.length === 0 && <p className="text-xs text-gray-400 mt-1">Solo aparecen los items con seguimiento de cuenta.</p>}
            </div>

            {issuers?.length > 0 && (
              <div>
                <label className={label}>Emisor</label>
                <select className={input} value={issuerId} onChange={e => setIssuerId(e.target.value)}>
                  <option value="">Factura informativa (sin ARCA)</option>
                  {issuers.map(is => <option key={is.id} value={is.id}>{is.name}{is.environment === 'test' ? ' (homologación)' : ''}</option>)}
                </select>
              </div>
            )}

            {!issuerId ? (
              <div>
                <label className={label}>Número</label>
                <input className={input} value={number} onChange={e => setNumber(e.target.value)} placeholder="FC A 0001-00000161" />
              </div>
            ) : issuer?.taxCondition === 'responsable_inscripto' ? (
              <div>
                <label className={label}>Alícuota de IVA</label>
                <select className={input} value={ivaRate} onChange={e => setIvaRate(e.target.value)}>
                  {ARCA_VAT_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                </select>
              </div>
            ) : null}

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

            {(missingForPdf.length > 0 || missingCustomerAddress) && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-400">
                La factura se puede emitir igual, pero después no vas a poder generar el PDF oficial hasta completar
                {missingForPdf.length > 0 && <> del emisor en Configuración: <strong>{missingForPdf.join(', ')}</strong>.</>}
                {missingForPdf.length > 0 && missingCustomerAddress && ' Y'}
                {missingCustomerAddress && <> la <strong>dirección</strong> de este cliente.</>}
              </div>
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-4 py-2 text-sm font-medium">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar factura'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
