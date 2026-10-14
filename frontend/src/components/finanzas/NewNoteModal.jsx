import { useState } from 'react'
import api from '../../api/client'
import { ARCA_VAT_RATES } from './financeCatalog'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Nota de crédito (anula POR COMPLETO la factura original — única modalidad
// soportada en v1, ver nota de alcance en el backend) o débito (monto nuevo
// asociado) sobre una factura con CAE. Mismo panel de resultado de 3 estados
// que NewInvoiceModal (autorizada/rechazada/a reconciliar).
export default function NewNoteModal({ invoice, customer, issuers, financeIvaMode, onClose, onSaved }) {
  const [kind, setKind] = useState('credit_note')
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState('')
  const [ivaRate, setIvaRate] = useState(String(ARCA_VAT_RATES[ARCA_VAT_RATES.length - 2])) // 21% default
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)

  const isResponsableInscripto = invoice.issuer?.taxCondition === 'responsable_inscripto'
  const addsIva = isResponsableInscripto && financeIvaMode !== 'included'
  const totalWithIva = addsIva && amount ? Number(amount) * (1 + Number(ivaRate) / 100) : null

  // Mismo aviso no bloqueante que NewInvoiceModal: la nota también termina
  // generando un PDF (buildInvoiceVoucherDocument), que exige estos datos del
  // emisor/cliente aunque `issue()`/`issueCreditNote()`/`issueDebitNote()` no
  // los pidan. `invoice.issuer` solo trae id/name/taxCondition — se busca el
  // emisor completo en `issuers` para los campos extra.
  const fullIssuer = issuers?.find(i => i.id === invoice.issuer?.id)
  const missingForPdf = fullIssuer ? [
    !fullIssuer.address && 'dirección',
    !fullIssuer.grossIncome && 'ingresos brutos',
    !fullIssuer.activitiesStartDate && 'inicio de actividades',
  ].filter(Boolean) : []
  const missingCustomerAddress = customer && customer.ivaCondition !== 'consumidor_final' && !customer.address

  async function handleSave() {
    if (kind === 'debit_note') {
      if (!concept.trim() || !amount || Number(amount) <= 0) { setError('Revisá los campos requeridos'); return }
      if (isResponsableInscripto && !ivaRate) { setError('Elegí una alícuota de IVA'); return }
    }
    setSaving(true); setError('')
    try {
      const path = kind === 'credit_note' ? 'credit-note' : 'debit-note'
      const body = kind === 'credit_note'
        ? { concept: concept.trim() || undefined }
        : { concept: concept.trim(), amount: Number(amount), ivaRate: isResponsableInscripto ? Number(ivaRate) : undefined }
      const res = await api.post(`/finanzas/invoices/${invoice.id}/${path}`, body)
      setCreated(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo emitir')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={created ? undefined : onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {!created && <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>}
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1 pr-8">Corregir factura {invoice.number}</h2>
        <p className="text-xs text-gray-400 mb-4">Emisor: {invoice.issuer?.name}</p>

        {created ? (
          <div className="space-y-4">
            {created.arcaStatus === 'authorized' ? (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/40 rounded-xl p-3">
                <p className="text-sm text-green-700 dark:text-green-400 font-medium">{kind === 'credit_note' ? 'Nota de crédito' : 'Nota de débito'} {created.number} autorizada por ARCA</p>
                <p className="text-xs text-green-600 dark:text-green-500 mt-1">CAE {created.cae} · vence {fmtDate(created.caeExpiresAt)}</p>
              </div>
            ) : created.arcaStatus === 'rejected' ? (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-xl p-3">
                <p className="text-sm text-red-700 dark:text-red-400 font-medium">ARCA rechazó la nota</p>
                <p className="text-xs text-red-600 dark:text-red-500 mt-1">{(created.arcaResponseRaw?.issues || []).map(i => i.message).join(' · ') || 'Sin detalle del motivo.'}</p>
              </div>
            ) : (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-3">
                <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">Quedó pendiente de confirmar con ARCA</p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">No se perdió la emisión — se puede reconciliar más adelante.</p>
                {created.arcaResponseRaw?.error && (
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-2 font-mono break-all">{created.arcaResponseRaw.error}</p>
                )}
              </div>
            )}
            <button onClick={() => onSaved(created)} className="w-full bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-2 text-sm font-medium">Listo</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-900/40 rounded-xl p-1">
              <button onClick={() => setKind('credit_note')} className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${kind === 'credit_note' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>Nota de crédito</button>
              <button onClick={() => setKind('debit_note')} className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${kind === 'debit_note' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>Nota de débito</button>
            </div>

            {kind === 'credit_note' ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3">
                Anula por completo esta factura (${invoice.amount}) — es la única modalidad disponible. Para corregir solo una parte, contactá soporte.
              </p>
            ) : null}

            <div>
              <label className={label}>{kind === 'credit_note' ? 'Motivo (opcional)' : 'Concepto'}</label>
              <input className={input} value={concept} onChange={e => setConcept(e.target.value)} placeholder={kind === 'credit_note' ? `Anula factura ${invoice.number}` : ''} />
            </div>

            {kind === 'debit_note' && (
              <>
                <div>
                  <label className={label}>{addsIva ? 'Monto (neto, sin IVA)' : 'Monto'}</label>
                  <input type="number" step="any" className={input} value={amount} onChange={e => setAmount(e.target.value)} />
                  {totalWithIva != null && (
                    <p className="text-xs text-gray-400 mt-1">Total con IVA ({ivaRate}%): <strong className="text-gray-600 dark:text-gray-300">{totalWithIva.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</strong></p>
                  )}
                </div>
                {isResponsableInscripto && (
                  <div>
                    <label className={label}>Alícuota de IVA</label>
                    <select className={input} value={ivaRate} onChange={e => setIvaRate(e.target.value)}>
                      {ARCA_VAT_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                )}
              </>
            )}

            {(missingForPdf.length > 0 || missingCustomerAddress) && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-400">
                La nota se puede emitir igual, pero después no vas a poder generar el PDF oficial hasta completar
                {missingForPdf.length > 0 && <> del emisor en Configuración: <strong>{missingForPdf.join(', ')}</strong>.</>}
                {missingForPdf.length > 0 && missingCustomerAddress && ' Y'}
                {missingCustomerAddress && <> la <strong>dirección</strong> de este cliente.</>}
              </div>
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-4 py-2 text-sm font-medium">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">{saving ? 'Emitiendo…' : 'Emitir'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
