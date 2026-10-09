import { useRef } from 'react'
import { Paperclip, X, Download } from 'lucide-react'
import { Icon } from '../ui/Icon'
import { iconFor, fmtBytes } from '../../lib/fileIcons'
import api from '../../api/client'
import { useFinanceAttachmentUpload, fmtMb } from './financeAttachmentUpload'

// Lista de adjuntos de una factura (sección 4.8/4.5b): ícono/nombre/tamaño,
// descarga vía blob (mismo patrón que ProjectFiles.jsx) y "+ Adjuntar archivo".
export default function InvoiceAttachmentsList({ invoiceId, attachments, onChanged, readOnly }) {
  const inputRef = useRef(null)
  const { queue, handleFiles } = useFinanceAttachmentUpload({ invoiceId, onUploaded: () => onChanged() })

  async function handleDownload(att) {
    const res = await api.get(`/finanzas/invoices/${invoiceId}/attachments/${att.id}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url; a.download = att.name
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  async function handleDelete(att) {
    await api.delete(`/finanzas/invoices/${invoiceId}/attachments/${att.id}`)
    onChanged()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Adjuntos</p>
        {!readOnly && (
          <button onClick={() => inputRef.current?.click()} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
            <Icon as={Paperclip} size={13} /> Adjuntar archivo
          </button>
        )}
        <input ref={inputRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files.length) handleFiles(e.target.files); e.target.value = '' }} />
      </div>

      <div className="space-y-1.5">
        {attachments.map(att => (
          <div key={att.id} className="flex items-center gap-2 text-sm bg-gray-50 dark:bg-gray-900/40 rounded-lg px-2.5 py-1.5">
            <Icon as={iconFor(att.mimeType)} size={15} className="text-gray-400 shrink-0" />
            <span className="flex-1 text-gray-700 dark:text-gray-300 truncate">{att.name}</span>
            <span className="text-xs text-gray-400 shrink-0">{fmtBytes(att.sizeBytes || 0)}</span>
            <button onClick={() => handleDownload(att)} title="Descargar" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0"><Icon as={Download} size={14} /></button>
            {!readOnly && (
              <button onClick={() => handleDelete(att)} title="Quitar" className="text-gray-400 hover:text-red-500 shrink-0"><Icon as={X} size={14} /></button>
            )}
          </div>
        ))}
        {queue.map(q => (
          <div key={q.id} className="flex items-center gap-2 text-sm bg-gray-50 dark:bg-gray-900/40 rounded-lg px-2.5 py-1.5">
            <span className="flex-1 text-gray-500 dark:text-gray-400 truncate">{q.name}</span>
            {q.status === 'error' ? (
              <span className="text-xs text-red-500">{q.error}</span>
            ) : (
              <span className="text-xs text-gray-400">{q.status === 'uploading' ? `${q.progress}%` : 'Confirmando…'}</span>
            )}
          </div>
        ))}
        {attachments.length === 0 && queue.length === 0 && (
          <p className="text-xs text-gray-400">Sin adjuntos. Máximo {fmtMb(20 * 1024 * 1024)} por archivo.</p>
        )}
      </div>
    </div>
  )
}
