import { useState, useEffect } from 'react'
import { Download, Eye, FileText, FileMinus, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { Icon } from '../ui/Icon'
import api from '../../api/client'
import { fmtMoney } from '../../utils/format'
import { invoiceStatusMeta, arcaStatusMeta, invoiceKindMeta, STATUS_BADGE } from './financeCatalog'
import NewNoteModal from './NewNoteModal'
import EditInvoiceModal from './EditInvoiceModal'

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
}

// Con `responseType: 'blob'`, un error HTTP también llega como Blob (no como
// JSON ya parseado) — sin esto, un 400/502 se tragaba en silencio y parecía
// que "no pasó nada".
async function blobErrorMessage(err) {
  const blob = err?.response?.data
  if (blob instanceof Blob && blob.type.includes('json')) {
    try { return JSON.parse(await blob.text()).error } catch { /* no era JSON */ }
  }
  return err?.response?.data?.error || err.message || 'No se pudo descargar'
}

async function downloadBlob(url, filename) {
  const res = await api.get(url, { responseType: 'blob' })
  const blobUrl = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = blobUrl; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(blobUrl)
}

async function downloadBlobChecked(url, filename) {
  try {
    await downloadBlob(url, filename)
  } catch (err) {
    alert(await blobErrorMessage(err))
  }
}

// Abre el PDF en una pestaña nueva en vez de forzar la descarga — la pestaña
// se abre ANTES del fetch (sincrónico, dentro del gesto del usuario) para que
// el navegador no la bloquee como popup; una vez que llega el blob se le
// asigna como ubicación.
async function viewBlob(url, filename) {
  const win = window.open('', '_blank')
  try {
    const res = await api.get(url, { responseType: 'blob' })
    const blobUrl = URL.createObjectURL(res.data)
    if (win) win.location.href = blobUrl
    else await downloadBlobChecked(url, filename) // popup bloqueado — bajamos el archivo como respaldo
  } catch (err) {
    win?.close()
    alert(await blobErrorMessage(err))
  }
}

// Tabla de facturas con sus acciones (PDF, nota de crédito/débito, reconciliar,
// editar, eliminar) + selección múltiple (Descargar ZIP / Enviar por mail).
// La comparten el detalle de un cliente (CustomerInvoicesPanel) y la pestaña
// Facturas de todo el workspace (InvoicesTab, con `showCustomer`).
// `customer` es el cliente del detalle; sin él, la nota se abre con `inv.item`.
export default function InvoicesTable({ invoices, onReload, showCustomer = false, customer, issuers, financeIvaMode }) {
  const [selected, setSelected] = useState(new Set())
  const [sending, setSending] = useState(false)
  const [noteInvoice, setNoteInvoice] = useState(null)
  const [editInvoice, setEditInvoice] = useState(null)
  const [reconcilingId, setReconcilingId] = useState(null)

  // Al cambiar los filtros, lo seleccionado que ya no está en la lista se
  // descarta: si no, "Descargar" bajaría facturas que no se ven.
  useEffect(() => {
    setSelected(prev => {
      const visible = new Set(invoices.map(i => i.id))
      const next = new Set([...prev].filter(id => visible.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [invoices])

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const allSelected = invoices.length > 0 && invoices.every(i => selected.has(i.id))
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(invoices.map(i => i.id)))
  }

  // download-zip es POST (manda `ids` en el body) — downloadBlob asume GET, se maneja aparte.
  async function handleDownloadZip() {
    try {
      const res = await api.post('/finanzas/invoices/download-zip', { ids: [...selected] }, { responseType: 'blob' })
      const blobUrl = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = blobUrl; a.download = 'facturas.zip'
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      alert(await blobErrorMessage(err))
    }
  }

  async function handleDelete(inv) {
    if (!confirm(`¿Eliminar ${inv.number || 'esta factura'}? No se puede deshacer.`)) return
    try {
      await api.delete(`/finanzas/invoices/${inv.id}`)
      await onReload()
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo eliminar')
    }
  }

  async function handleReconcile(inv) {
    setReconcilingId(inv.id)
    try {
      const res = await api.post(`/finanzas/invoices/${inv.id}/reconcile`)
      await onReload()
      // Sin esto, si ARCA todavía no resolvió la factura (sigue
      // indeterminate/conflict) el estado visual no cambia y parece que
      // "no pasó nada" al tocar el botón — avisamos siempre el resultado.
      const updated = res.data
      if (updated.arcaStatus === 'authorized') {
        alert(`${invoiceKindMeta(updated.kind).label} ${updated.number} autorizada por ARCA.\nCAE ${updated.cae}`)
      } else if (updated.arcaStatus === 'rejected') {
        const reason = (updated.arcaResponseRaw?.issues || []).map(i => i.message).join(' · ') || 'Sin detalle del motivo.'
        alert(`ARCA rechazó el comprobante.\n${reason}`)
      } else {
        alert('ARCA todavía no tiene un resultado definitivo para este comprobante — seguí probando más tarde.')
      }
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo reconciliar')
    } finally { setReconcilingId(null) }
  }

  async function handleSendEmail() {
    setSending(true)
    try {
      await api.post('/finanzas/invoices/send-email', { ids: [...selected] })
      alert('Factura(s) enviada(s) por mail.')
      setSelected(new Set())
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo enviar')
    } finally { setSending(false) }
  }

  const colCount = showCustomer ? 9 : 8

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th className="py-2 pr-2 w-6">
                <input type="checkbox" aria-label="Seleccionar todas" checked={allSelected} onChange={toggleAll} disabled={invoices.length === 0} />
              </th>
              <th className="py-2 pr-2 font-medium">Número</th>
              <th className="py-2 pr-2 font-medium">Emisión</th>
              {showCustomer && <th className="py-2 pr-2 font-medium">Cliente</th>}
              <th className="py-2 pr-2 font-medium">Concepto</th>
              <th className="py-2 pr-2 font-medium">Emisor</th>
              <th className="py-2 pr-2 font-medium text-right">Monto</th>
              <th className="py-2 pr-2 font-medium">Estado</th>
              <th className="py-2 pl-2 font-medium text-right"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => {
              const meta = invoiceStatusMeta(inv.status)
              const kindMeta = invoiceKindMeta(inv.kind)
              const canReconcile = inv.arcaStatus === 'indeterminate' || inv.arcaStatus === 'conflict'
              // Sin emisor = factura informativa, cargada a mano: se puede corregir.
              // Un comprobante de ARCA no (con CAE es un documento legal, sin CAE
              // se reconcilia o se elimina) — ver updateInvoice en el backend.
              const canEdit = !inv.issuerId
              return (
                <tr key={inv.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-900/30">
                  <td className="py-2 pr-2"><input type="checkbox" checked={selected.has(inv.id)} onChange={() => toggle(inv.id)} /></td>
                  <td className={`py-2 pr-2 text-gray-900 dark:text-white whitespace-nowrap ${canEdit ? 'cursor-pointer' : ''}`} onClick={() => canEdit && setEditInvoice(inv)}>
                    {kindMeta.short && <span className="mr-1 text-[10px] font-semibold text-gray-400 border border-gray-300 dark:border-gray-600 rounded px-1 align-middle">{kindMeta.short}</span>}
                    {inv.number || <span className="text-gray-400 italic">pendiente de ARCA</span>}
                  </td>
                  <td className="py-2 pr-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(inv.issueDate)}</td>
                  {showCustomer && <td className="py-2 pr-2 text-gray-700 dark:text-gray-300">{inv.item?.name || '—'}</td>}
                  <td className="py-2 pr-2 text-gray-700 dark:text-gray-300">{inv.concept}</td>
                  <td className="py-2 pr-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{inv.issuer?.name || '—'}</td>
                  <td className="py-2 pr-2 text-right font-medium text-gray-900 dark:text-white whitespace-nowrap">{fmtMoney(inv.amount, inv.currency || 'ARS')}</td>
                  <td className="py-2 pr-2">
                    {inv.kind === 'invoice' ? (
                      <span className={`text-[11px] rounded-full px-2 py-0.5 ${STATUS_BADGE[meta.color]}`}>{meta.label}</span>
                    ) : (
                      <span className="text-[11px] rounded-full px-2 py-0.5 bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{kindMeta.label}</span>
                    )}
                    {/* Para una factura (kind='invoice') rechazada, el badge principal de arriba ya dice "Rechazada" (status la cubre) — evita duplicarlo. Para una nota, el status siempre es su kind (NC/ND), así que este es el único indicador de que ARCA la rechazó. */}
                    {inv.arcaStatus && inv.arcaStatus !== 'authorized' && !(inv.kind === 'invoice' && inv.arcaStatus === 'rejected') && (
                      <span className={`ml-1 text-[11px] rounded-full px-2 py-0.5 ${STATUS_BADGE[arcaStatusMeta(inv.arcaStatus).color]}`}>{arcaStatusMeta(inv.arcaStatus).label}</span>
                    )}
                  </td>
                  <td className="py-2 pl-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {canReconcile && (
                        <button title="Reconciliar con ARCA" disabled={reconcilingId === inv.id} onClick={() => handleReconcile(inv)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-40">
                          <Icon as={RefreshCw} size={14} className={reconcilingId === inv.id ? 'animate-spin' : ''} />
                        </button>
                      )}
                      {inv.cae && inv.kind === 'invoice' && (
                        <button title="Nota de crédito/débito" onClick={() => setNoteInvoice(inv)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                          <Icon as={FileMinus} size={14} />
                        </button>
                      )}
                      {inv.cae && (
                        <button title="Ver PDF oficial" onClick={() => viewBlob(`/finanzas/invoices/${inv.id}/pdf`, `Factura ${inv.number}.pdf`)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                          <Icon as={Eye} size={14} />
                        </button>
                      )}
                      {inv.cae && (
                        <button title="Descargar PDF oficial" onClick={() => downloadBlobChecked(`/finanzas/invoices/${inv.id}/pdf`, `Factura ${inv.number}.pdf`)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                          <Icon as={FileText} size={14} />
                        </button>
                      )}
                      {inv.attachments?.[0] && (
                        <button title="Descargar adjunto" onClick={() => downloadBlobChecked(`/finanzas/invoices/${inv.id}/attachments/${inv.attachments[0].id}/download`, inv.attachments[0].name)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                          <Icon as={Download} size={14} />
                        </button>
                      )}
                      {canEdit && (
                        <button title="Editar" onClick={() => setEditInvoice(inv)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                          <Icon as={Pencil} size={14} />
                        </button>
                      )}
                      {!inv.cae && (
                        <button title="Eliminar" onClick={() => handleDelete(inv)} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400">
                          <Icon as={Trash2} size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {invoices.length === 0 && <tr><td colSpan={colCount} className="text-center text-xs text-gray-400 py-6">Sin facturas.</td></tr>}
          </tbody>
        </table>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900/40 rounded-xl px-4 py-2.5 mt-3">
          <span className="text-sm text-gray-600 dark:text-gray-300">{selected.size} factura{selected.size === 1 ? '' : 's'} seleccionada{selected.size === 1 ? '' : 's'}</span>
          <div className="flex-1" />
          <button onClick={handleDownloadZip} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 rounded-lg px-3 py-1.5 text-xs font-medium">Descargar</button>
          <button onClick={handleSendEmail} disabled={sending} className="bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50">Enviar por mail</button>
        </div>
      )}

      {editInvoice && (
        <EditInvoiceModal invoice={editInvoice}
          onClose={() => { setEditInvoice(null); onReload() }}
          onSaved={() => { setEditInvoice(null); onReload() }}
        />
      )}

      {noteInvoice && (
        <NewNoteModal invoice={noteInvoice} customer={customer || noteInvoice.item} issuers={issuers} financeIvaMode={financeIvaMode}
          onClose={() => setNoteInvoice(null)}
          onSaved={() => { setNoteInvoice(null); onReload() }}
        />
      )}
    </div>
  )
}
