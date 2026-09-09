import { useState, useCallback, useRef } from 'react'
import api from '../api/client'

// Mismo tope que el backend (projectFiles.controller.js) — solo para dar
// feedback instantáneo sin ida y vuelta al servidor.
export const MAX_FILE_BYTES = 500 * 1024 * 1024

export function fmtMb(bytes) {
  return `${Math.round(bytes / (1024 * 1024))}MB`
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

// Solo para imágenes: dimensiones, metadata liviana y opcional (no bloquea la
// subida si falla). Videos y el resto de los archivos no la necesitan.
function getImageDimensions(file) {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload  = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }) }
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ width: null, height: null }) }
    img.src = url
  })
}

let nextLocalId = 1

/**
 * Orquesta presign → PUT directo a R2 → confirm para el tab Archivos. A
 * diferencia de ContentAssetUploader.jsx, acepta cualquier tipo de archivo
 * (no solo imagen/video) y no genera thumbnail de video — eso queda para una
 * iteración futura (evita el problema que tiene Contenido hoy, donde el
 * poster queda como un segundo asset "suelto" visible en la galería).
 */
export function useProjectFileUpload({ projectId, onUploaded }) {
  const [queue, setQueue] = useState([]) // [{ id, name, progress, status, error }]
  const cancelRef = useRef(new Map()) // localId -> xhr

  const updateItem = useCallback((id, patch) => {
    setQueue(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)))
  }, [])
  const removeItem = useCallback((id) => {
    cancelRef.current.delete(id)
    setQueue(prev => prev.filter(it => it.id !== id))
  }, [])

  async function runUpload(item, file, folderId) {
    let presign
    try {
      const { data } = await api.post(`/projects/${projectId}/files/presign`, {
        name: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, parentId: folderId,
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

    let width = null, height = null
    if (file.type?.startsWith('image/')) {
      ;({ width, height } = await getImageDimensions(file))
    }

    const { data: fileRow } = await api.post(`/projects/${projectId}/files/${presign.fileId}/confirm`, { width, height })
    return fileRow
  }

  const handleFiles = useCallback((fileList, folderId) => {
    const files = Array.from(fileList)
    for (const file of files) {
      const id = nextLocalId++

      if (file.size > MAX_FILE_BYTES) {
        setQueue(prev => [...prev, { id, name: file.name, progress: 0, status: 'error', error: `Supera el máximo permitido (${fmtMb(MAX_FILE_BYTES)}).` }])
        continue
      }

      setQueue(prev => [...prev, { id, name: file.name, progress: 0, status: 'uploading' }])
      runUpload({ id }, file, folderId)
        .then(fileRow => { removeItem(id); onUploaded?.(fileRow) })
        .catch(err => {
          if (err.message === 'CANCELLED') { removeItem(id); return }
          updateItem(id, { status: 'error', error: err.message || 'No se pudo subir el archivo' })
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  function cancel(id) {
    cancelRef.current.get(id)?.abort?.()
    removeItem(id)
  }

  return { queue, handleFiles, cancel, removeItem }
}
