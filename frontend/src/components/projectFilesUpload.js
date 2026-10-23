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

// Subidas simultáneas por pestaña. Debajo del tope del backend
// (MAX_PENDING_PER_PROJECT = 5) para dejar margen a otros usuarios del
// proyecto; el resto espera en la cola ("En cola") y arranca solo.
const MAX_CONCURRENT = 3
// Si igual el backend dice que hay demasiadas en curso (otros usuarios,
// pendientes viejos), se reintenta cada tanto en vez de marcar error.
const RETRY_WAIT_MS = 5000

const sleep = ms => new Promise(r => setTimeout(r, ms))

/**
 * Orquesta presign → PUT directo a R2 → confirm para el tab Archivos. A
 * diferencia de ContentAssetUploader.jsx, acepta cualquier tipo de archivo
 * (no solo imagen/video) y no genera thumbnail de video — eso queda para una
 * iteración futura (evita el problema que tiene Contenido hoy, donde el
 * poster queda como un segundo asset "suelto" visible en la galería).
 *
 * Los archivos se encolan y suben de a MAX_CONCURRENT: soltar 50 archivos de
 * golpe no choca contra el tope de subidas pendientes del backend.
 */
export function useProjectFileUpload({ projectId, onUploaded }) {
  const [queue, setQueue] = useState([]) // [{ id, name, progress, status: queued|waiting|uploading|confirming|error, error }]
  const cancelRef = useRef(new Map()) // localId -> xhr
  const waitingRef = useRef([])        // [{ id, file, folderId }] todavía sin arrancar
  const activeRef = useRef(0)
  const cancelledRef = useRef(new Set())
  const onUploadedRef = useRef(onUploaded)
  onUploadedRef.current = onUploaded

  const updateItem = useCallback((id, patch) => {
    setQueue(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)))
  }, [])
  const removeItem = useCallback((id) => {
    cancelRef.current.delete(id)
    setQueue(prev => prev.filter(it => it.id !== id))
  }, [])

  // Libera el lugar del upload en el backend (si no, cuenta como "en curso"
  // hasta que vence). Best-effort.
  function abortPending(fileId) {
    api.delete(`/projects/${projectId}/files/${fileId}/pending`).catch(() => {})
  }

  async function presign(id, file, folderId) {
    for (;;) {
      if (cancelledRef.current.has(id)) throw new Error('CANCELLED')
      try {
        const { data } = await api.post(`/projects/${projectId}/files/presign`, {
          name: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, parentId: folderId,
        })
        return data
      } catch (err) {
        if (err.response?.status === 429 && err.response?.data?.code === 'TOO_MANY_PENDING') {
          updateItem(id, { status: 'waiting' })
          await sleep(RETRY_WAIT_MS)
          continue
        }
        if (err.response?.status === 503 && err.response?.data?.code === 'STORAGE_NOT_CONFIGURED') {
          throw new Error('La subida de archivos no está disponible en este workspace todavía.')
        }
        throw new Error(err.response?.data?.error || 'No se pudo iniciar la subida')
      }
    }
  }

  async function runUpload(id, file, folderId) {
    const data = await presign(id, file, folderId)
    if (cancelledRef.current.has(id)) { abortPending(data.fileId); throw new Error('CANCELLED') }

    updateItem(id, { status: 'uploading', progress: 0 })
    try {
      await uploadWithProgress(
        data.uploadUrl, file, file.type || 'application/octet-stream',
        pct => updateItem(id, { progress: pct }),
        xhr => cancelRef.current.set(id, xhr),
      )
    } catch (err) {
      abortPending(data.fileId)
      throw err
    }
    cancelRef.current.delete(id)
    updateItem(id, { status: 'confirming' })

    let width = null, height = null
    if (file.type?.startsWith('image/')) {
      ;({ width, height } = await getImageDimensions(file))
    }

    const { data: fileRow } = await api.post(`/projects/${projectId}/files/${data.fileId}/confirm`, { width, height })
    return fileRow
  }

  function pump() {
    while (activeRef.current < MAX_CONCURRENT && waitingRef.current.length > 0) {
      const { id, file, folderId } = waitingRef.current.shift()
      activeRef.current++
      runUpload(id, file, folderId)
        .then(fileRow => { removeItem(id); onUploadedRef.current?.(fileRow) })
        .catch(err => {
          if (err.message === 'CANCELLED') { removeItem(id); return }
          updateItem(id, { status: 'error', error: err.response?.data?.error || err.message || 'No se pudo subir el archivo' })
        })
        .finally(() => {
          cancelledRef.current.delete(id)
          activeRef.current--
          pump()
        })
    }
  }

  const handleFiles = useCallback((fileList, folderId) => {
    const files = Array.from(fileList)
    for (const file of files) {
      const id = nextLocalId++

      if (file.size > MAX_FILE_BYTES) {
        setQueue(prev => [...prev, { id, name: file.name, progress: 0, status: 'error', error: `Supera el máximo permitido (${fmtMb(MAX_FILE_BYTES)}).` }])
        continue
      }

      setQueue(prev => [...prev, { id, name: file.name, progress: 0, status: 'queued' }])
      waitingRef.current.push({ id, file, folderId })
    }
    pump()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  function cancel(id) {
    const idx = waitingRef.current.findIndex(w => w.id === id)
    if (idx !== -1) {
      // Todavía en cola: se saca sin haber tocado el backend.
      waitingRef.current.splice(idx, 1)
      removeItem(id)
      return
    }
    // En curso: si está subiendo se aborta el PUT; si está esperando turno
    // del backend, el loop de presign lo ve en la próxima vuelta.
    cancelledRef.current.add(id)
    cancelRef.current.get(id)?.abort?.()
    removeItem(id)
  }

  return { queue, handleFiles, cancel, removeItem }
}
