import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Icon } from '../ui/Icon'
import api from '../../api/client'
import { fmtMoney } from '../../utils/format'
import { currentMonthKey, shiftMonth, monthLabel } from './financeMonths'

const input = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'
const MONTHS_IN_SELECT = 24

// Con `responseType: 'blob'` un error HTTP llega como Blob, no como JSON.
async function blobErrorMessage(err) {
  const blob = err?.response?.data
  if (blob instanceof Blob && blob.type.includes('json')) {
    try { return JSON.parse(await blob.text()).error } catch { /* no era JSON */ }
  }
  return err?.response?.data?.error || 'No se pudo generar el archivo'
}

// Exportar Libro IVA Digital (ventas): un emisor y un mes, que es como se
// presenta ante ARCA. Primero muestra el resumen y lo que queda afuera
// (comprobantes sin confirmar, emisor en homologación); recién después descarga.
// Solo emisores responsables inscriptos: monotributo y exento no llevan libro.
export default function LibroIvaModal({ issuers, defaultIssuerId, defaultMonth, onClose }) {
  const eligible = issuers.filter(i => i.taxCondition === 'responsable_inscripto')
  const initialIssuer = eligible.some(i => String(i.id) === String(defaultIssuerId)) ? String(defaultIssuerId) : (eligible.length === 1 ? String(eligible[0].id) : '')
  const [issuerId, setIssuerId] = useState(initialIssuer)
  // Por defecto, el mes ANTERIOR: el libro se presenta una vez cerrado el período.
  const [month, setMonth] = useState(defaultMonth || shiftMonth(currentMonthKey(), -1))
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const thisMonth = currentMonthKey()
  const months = Array.from({ length: MONTHS_IN_SELECT }, (_, i) => shiftMonth(thisMonth, -i))

  useEffect(() => {
    if (!issuerId) { setSummary(null); return }
    let cancelled = false
    setLoading(true); setError(null)
    api.get('/finanzas/invoices/libro-iva', { params: { issuerId, month } })
      .then(res => { if (!cancelled) setSummary(res.data) })
      .catch(err => { if (!cancelled) { setSummary(null); setError(err.response?.data?.error || 'No se pudo armar el resumen') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [issuerId, month])

  async function handleDownload() {
    setDownloading(true)
    try {
      const res = await api.get('/finanzas/invoices/libro-iva', { params: { issuerId, month, download: '1' }, responseType: 'blob' })
      const cuit = (summary?.issuer?.cuit || '').replace(/\D/g, '')
      const blobUrl = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = blobUrl; a.download = `LIBRO_IVA_DIGITAL_VENTAS_${cuit}_${month.replace('-', '')}.zip`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      setError(await blobErrorMessage(err))
    } finally { setDownloading(false) }
  }

  const counts = summary?.counts
  const canDownload = !!summary && counts?.total > 0 && !downloading

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-labelledby="libro-iva-title" className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h2 id="libro-iva-title" className="text-lg font-semibold text-gray-900 dark:text-white">Exportar Libro IVA Digital</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Ventas de un emisor en un mes: el archivo de comprobantes y el de alícuotas, listos para importar en ARCA o en el sistema contable.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><Icon as={X} size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {eligible.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              No hay emisores responsables inscriptos. El Libro IVA Digital lo presentan solo ellos: un monotributista o un exento no lleva libro.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="libro-iva-issuer" className={label}>Emisor</label>
                <select id="libro-iva-issuer" className={input} value={issuerId} onChange={e => setIssuerId(e.target.value)}>
                  <option value="">Elegí un emisor</option>
                  {eligible.map(i => <option key={i.id} value={i.id}>{i.name}{i.active ? '' : ' (desactivado)'}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="libro-iva-month" className={label}>Período</label>
                <select id="libro-iva-month" className={input} value={month} onChange={e => setMonth(e.target.value)}>
                  {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
                </select>
              </div>
            </div>
          )}

          {loading && <p className="text-sm text-gray-400">Armando el resumen…</p>}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          {summary && !loading && (
            <>
              {counts.total === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">No hay comprobantes autorizados por ARCA de este emisor en {monthLabel(month)}.</p>
              ) : (
                <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-4 text-sm space-y-1.5">
                  <p className="text-gray-900 dark:text-white font-medium">
                    {counts.total} comprobante{counts.total === 1 ? '' : 's'}
                    <span className="font-normal text-gray-500 dark:text-gray-400">
                      {' '}({[
                        counts.invoice && `${counts.invoice} factura${counts.invoice === 1 ? '' : 's'}`,
                        counts.creditNote && `${counts.creditNote} NC`,
                        counts.debitNote && `${counts.debitNote} ND`,
                      ].filter(Boolean).join(', ')})
                    </span>
                  </p>
                  <div className="flex justify-between text-gray-600 dark:text-gray-300"><span>Neto gravado</span><span>{fmtMoney(summary.amounts.netTaxed, 'ARS')}</span></div>
                  <div className="flex justify-between text-gray-600 dark:text-gray-300"><span>IVA débito fiscal</span><span>{fmtMoney(summary.amounts.vat, 'ARS')}</span></div>
                  <div className="flex justify-between text-gray-900 dark:text-white font-medium"><span>Total</span><span>{fmtMoney(summary.amounts.total, 'ARS')}</span></div>
                  <p className="text-xs text-gray-400 pt-1">Las notas de crédito restan. Solo entran los comprobantes emitidos desde BlissTracker con este emisor: si facturás también desde otro sistema, esos no están acá.</p>
                </div>
              )}

              {summary.warnings.map(w => (
                <div key={w.code} className="flex gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-200">
                  <Icon as={AlertTriangle} size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <p>{w.message}</p>
                    {w.invoices?.length > 0 && (
                      <p className="text-xs mt-1 opacity-80">{w.invoices.map(i => `${i.number || `#${i.id}`}${i.client ? ` (${i.client})` : ''}`).join(' · ')}</p>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onClose} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl px-4 py-2 text-sm font-medium">Cerrar</button>
          <button onClick={handleDownload} disabled={!canDownload} className="bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl px-4 py-2 text-sm disabled:opacity-50">
            {downloading ? 'Generando…' : 'Descargar (.zip)'}
          </button>
        </div>
      </div>
    </div>
  )
}
