import { useState, useCallback, useRef } from 'react'
import api from '../../api/client'

// Mismo tope que el backend (invoices.controller.js) — comprobantes/facturas,
// no media pesado, por eso es mucho más bajo que Archivos/Tareas (500MB).
export const MAX_FILE_BYTES = 20 * 1024 * 1024

export function fmtMb(bytes) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

/** PUT directo a la URL firmada, con progreso real. XHR (no fetch) por xhr.upload.onprogress. */
function uploadWithProgress(url, file, mimeType, onProgress, onXhr) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    onXhr?.(xhr)
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', mimeType)
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`La subida falló (HTTP ${xhr.status})`)))
    xhr.onerror = () => reject(new Error('La subida falló — revisá tu conexión'))
    xhr.onabort = () => reject(new Error('CANCELLED'))
    xhr.send(file)
  })
}

let nextLocalId = 1

/**
 * Orquesta presign → PUT directo a R2 → confirm para adjuntar un archivo a
 * una factura de Finanzas (mismo patrón que useTaskFileUpload/
 * useProjectFileUpload, pero contra /finanzas/invoices/:id/attachments/*).
 */
export function useFinanceAttachmentUpload({ invoiceId, onUploaded }) {
  const [queue, setQueue] = useState([]) // [{ id, name, progress, status, error }]
  const cancelRef = useRef(new Map())

  const updateItem = useCallback((id, patch) => {
    setQueue(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)))
  }, [])
  const removeItem = useCallback((id) => {
    cancelRef.current.delete(id)
    setQueue(prev => prev.filter(it => it.id !== id))
  }, [])

  async function runUpload(item, file) {
    let presign
    try {
      const { data } = await api.post(`/finanzas/invoices/${invoiceId}/attachments/presign`, {
        name: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size,
      })
      presign = data
    } catch (err) {
      if (err.response?.status === 503 && err.response?.data?.code === 'STORAGE_NOT_CONFIGURED') {
        throw new Error('La subida de archivos no está disponible en este workspace todavía.')
      }
      throw new Error(err.response?.data?.error || 'No se pudo iniciar la subida')
    }

    updateItem(item.id, { status: 'uploading' })
    await uploadWithProgress(
      presign.uploadUrl, file, file.type || 'application/octet-stream',
      pct => updateItem(item.id, { progress: pct }),
      xhr => cancelRef.current.set(item.id, xhr),
    )
    cancelRef.current.delete(item.id)
    updateItem(item.id, { status: 'confirming' })

    const { data: attachment } = await api.post(`/finanzas/invoices/${invoiceId}/attachments/${presign.attachmentId}/confirm`, {})
    return attachment
  }

  const handleFiles = useCallback((fileList) => {
    const files = Array.from(fileList)
    for (const file of files) {
      const id = nextLocalId++

      if (file.size > MAX_FILE_BYTES) {
        setQueue(prev => [...prev, { id, name: file.name, progress: 0, status: 'error', error: `Supera el máximo permitido (${fmtMb(MAX_FILE_BYTES)}).` }])
        continue
      }

      setQueue(prev => [...prev, { id, name: file.name, progress: 0, status: 'uploading' }])
      runUpload({ id }, file)
        .then(attachment => { removeItem(id); onUploaded?.(attachment) })
        .catch(err => {
          if (err.message === 'CANCELLED') { removeItem(id); return }
          updateItem(id, { status: 'error', error: err.message || 'No se pudo subir el archivo' })
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId])

  function cancel(id) {
    cancelRef.current.get(id)?.abort?.()
    removeItem(id)
  }

  return { queue, handleFiles, cancel, removeItem }
}
