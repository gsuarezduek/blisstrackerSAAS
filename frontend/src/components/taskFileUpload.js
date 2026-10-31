import { useState, useCallback, useRef } from 'react'
import api from '../api/client'
import { makeThumbnail } from './projectFiles/makeThumbnail'
import { MAX_FILE_BYTES, fmtMb } from './projectFilesUpload'

export { MAX_FILE_BYTES, fmtMb }

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
 * Orquesta presign → PUT directo a R2 → confirm → miniatura para adjuntar un
 * archivo a una tarea (mismo patrón que useProjectFileUpload en
 * projectFilesUpload.js, pero contra /tasks/:id/attachments/* — la carpeta
 * destino ("Tareas / <mes> / <tarea>") la resuelve el backend solo, no hace
 * falta elegir parentId).
 *
 * Un adjunto ES un ProjectFile de la Nube del proyecto, así que lleva la misma
 * miniatura: si no la generara acá, un video adjuntado desde una tarea se
 * vería con el ícono genérico mientras el mismo video subido desde la Nube se
 * ve con su primer frame.
 */
export function useTaskFileUpload({ taskId, onUploaded }) {
  const [queue, setQueue] = useState([]) // [{ id, name, progress, status, error }]
  const cancelRef = useRef(new Map()) // localId -> xhr

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
      const { data } = await api.post(`/tasks/${taskId}/attachments/presign`, {
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

    // Miniatura + dimensiones del original, en una sola decodificación. Para
    // los tipos que no la llevan (PDF, docx, zip…) devuelve null y seguimos.
    updateItem(item.id, { status: 'thumbnail' })
    const thumb = await makeThumbnail(file).catch(() => null)

    updateItem(item.id, { status: 'confirming' })
    const { data: fileRow } = await api.post(`/tasks/${taskId}/attachments/${presign.fileId}/confirm`, {
      width: thumb?.width ?? null, height: thumb?.height ?? null,
    })

    // La miniatura va al endpoint de la Nube (el adjunto ya es un ProjectFile
    // de ese proyecto, y el `projectId` viene en la respuesta del confirm).
    // Best-effort: si falla, el adjunto ya quedó confirmado igual.
    if (thumb?.blob && fileRow?.projectId) {
      try {
        const form = new FormData()
        form.append('thumbnail', thumb.blob, 'thumbnail')
        const { data: withThumb } = await api.post(
          `/projects/${fileRow.projectId}/files/${presign.fileId}/thumbnail`, form)
        return { ...withThumb, projectId: fileRow.projectId }
      } catch { /* sin miniatura, nada más que hacer */ }
    }
    return fileRow
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
        .then(fileRow => { removeItem(id); onUploaded?.(fileRow) })
        .catch(err => {
          if (err.message === 'CANCELLED') { removeItem(id); return }
          updateItem(id, { status: 'error', error: err.message || 'No se pudo subir el archivo' })
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  function cancel(id) {
    cancelRef.current.get(id)?.abort?.()
    removeItem(id)
  }

  return { queue, handleFiles, cancel, removeItem }
}
