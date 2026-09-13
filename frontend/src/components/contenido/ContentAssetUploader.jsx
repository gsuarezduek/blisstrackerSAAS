import { useState, useRef, useCallback } from 'react'
import api from '../../api/client'

// Mismos topes que el backend (content.controller.js valida de nuevo, esto es
// solo para dar feedback instantáneo sin ida y vuelta al servidor).
const MAX_BYTES = { image: 15 * 1024 * 1024, video: 150 * 1024 * 1024 }
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm'

function fmtMb(bytes) { return `${Math.round(bytes / (1024 * 1024))}MB` }

function kindOf(file) {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return null
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

function getImageDimensions(file) {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload  = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }) }
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ width: null, height: null }) }
    img.src = url
  })
}

/**
 * Lee metadata del video (ancho/alto/duración) y captura un frame a los ~0.1s
 * como poster (canvas → JPEG). Nunca rechaza: si algo falla, devuelve lo que
 * pudo con `posterBlob: null` — el video igual se confirma sin thumbnail.
 */
function captureVideoMeta(file) {
  return new Promise(resolve => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    const url = URL.createObjectURL(file)
    let settled = false
    function finish(result) {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      resolve(result)
    }
    video.onloadedmetadata = () => {
      const meta = { width: video.videoWidth || null, height: video.videoHeight || null, duration: video.duration || null }
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
          canvas.toBlob(blob => finish({ ...meta, posterBlob: blob }), 'image/jpeg', 0.8)
        } catch { finish({ ...meta, posterBlob: null }) }
      }
      try { video.currentTime = Math.min(0.1, video.duration || 0.1) }
      catch { finish({ ...meta, posterBlob: null }) }
    }
    video.onerror = () => finish({ width: null, height: null, duration: null, posterBlob: null })
    video.src = url
    // Timeout de seguridad: si el navegador nunca dispara los eventos, seguimos sin poster.
    setTimeout(() => finish({ width: null, height: null, duration: null, posterBlob: null }), 8000)
  })
}

let nextLocalId = 1

const CARD_BASE = 'h-32 rounded-xl border-2 border-dashed p-3 flex flex-col items-center justify-center gap-1 text-center transition-colors'
const CARD_ENABLED = 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700 cursor-pointer'
const CARD_DISABLED = 'opacity-50 cursor-not-allowed border-gray-200 dark:border-gray-700'
const CARD_ACTIVE = 'border-primary-400 bg-primary-50/50 dark:bg-primary-900/10'

/**
 * Tres formas equivalentes de sumar multimedia a una pieza de Contenido, como
 * tres tarjetas del mismo tamaño (mismo peso visual, para que quede claro que
 * son alternativas para más o menos lo mismo, no una principal y dos accesorias):
 * (1) subir un archivo desde la computadora, (2) pegar un link externo (Google
 * Drive, etc. — crea un asset kind:'link' sin subir nada, va directo a
 * `POST .../assets/link` y queda 'ready' al instante), (3) elegir un archivo ya
 * subido al repositorio de Archivos del proyecto (delegado al padre vía
 * `onOpenLibrary`, que abre `ContentFileBrowserModal`).
 *
 * La subida en sí orquesta presign → PUT directo a R2 → confirm. Si R2 no está
 * configurado, el presign de una imagen cae automáticamente al fallback
 * multipart (`POST .../assets`, sin R2); un video sin R2 no tiene fallback y
 * se muestra como error. Sube varios archivos en paralelo, cada uno con su
 * propia barra de progreso y botón de cancelar.
 */
export default function ContentAssetUploader({ projectId, pieceId, onUploaded, disabled, onOpenLibrary, libraryDisabled }) {
  const [queue, setQueue] = useState([]) // [{ id, name, kind, progress, status, error }]
  const [dragOver, setDragOver] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkError, setLinkError] = useState(null)
  const inputRef = useRef(null)
  const cancelRef = useRef(new Map()) // localId -> xhr | AbortController

  const updateItem = useCallback((id, patch) => {
    setQueue(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)))
  }, [])

  const removeItem = useCallback((id) => {
    cancelRef.current.delete(id)
    setQueue(prev => prev.filter(it => it.id !== id))
  }, [])

  async function runFallback(item, file) {
    const form = new FormData()
    form.append('file', file)
    const controller = new AbortController()
    cancelRef.current.set(item.id, controller)
    const { data } = await api.post(`/contenido/projects/${projectId}/pieces/${pieceId}/assets`, form, {
      signal: controller.signal,
      onUploadProgress: e => { if (e.total) updateItem(item.id, { progress: Math.round((e.loaded / e.total) * 100) }) },
    })
    return data
  }

  async function runUpload(item, file, kind) {
    let presign
    try {
      const { data } = await api.post(`/contenido/projects/${projectId}/pieces/${pieceId}/assets/presign`, {
        kind, mimeType: file.type, sizeBytes: file.size, fileName: file.name,
      })
      presign = data
    } catch (err) {
      if (err.response?.status === 503 && err.response?.data?.code === 'STORAGE_NOT_CONFIGURED') {
        if (kind === 'image') return runFallback(item, file)
        throw new Error('La subida de video no está disponible en este workspace todavía.')
      }
      throw new Error(err.response?.data?.error || 'No se pudo iniciar la subida')
    }

    updateItem(item.id, { status: 'uploading' })
    await uploadWithProgress(
      presign.uploadUrl, file, file.type,
      pct => updateItem(item.id, { progress: pct }),
      xhr => cancelRef.current.set(item.id, xhr),
    )
    cancelRef.current.delete(item.id)

    let width = null, height = null, durationSec = null, posterAssetId = null
    if (kind === 'image') {
      updateItem(item.id, { status: 'confirming' })
      ;({ width, height } = await getImageDimensions(file))
    } else {
      updateItem(item.id, { status: 'poster' })
      const meta = await captureVideoMeta(file)
      width = meta.width; height = meta.height
      durationSec = meta.duration ? Math.round(meta.duration) : null

      if (meta.posterBlob) {
        try {
          const posterFile = new File([meta.posterBlob], 'poster.jpg', { type: 'image/jpeg' })
          const { data: posterPresign } = await api.post(`/contenido/projects/${projectId}/pieces/${pieceId}/assets/presign`, {
            kind: 'image', mimeType: 'image/jpeg', sizeBytes: posterFile.size, fileName: 'poster.jpg',
          })
          await uploadWithProgress(posterPresign.uploadUrl, posterFile, 'image/jpeg', () => {})
          const { data: posterAsset } = await api.post(
            `/contenido/projects/${projectId}/pieces/${pieceId}/assets/${posterPresign.assetId}/confirm`,
            { width, height },
          )
          posterAssetId = posterAsset.id
        } catch { /* el poster es best-effort: si falla, el video se confirma sin thumbnail */ }
      }
      updateItem(item.id, { status: 'confirming' })
    }

    const { data: asset } = await api.post(
      `/contenido/projects/${projectId}/pieces/${pieceId}/assets/${presign.assetId}/confirm`,
      { width, height, durationSec, posterAssetId },
    )
    return asset
  }

  const handleFiles = useCallback((fileList) => {
    const files = Array.from(fileList)
    for (const file of files) {
      const kind = kindOf(file)
      const id = nextLocalId++

      if (!kind) {
        setQueue(prev => [...prev, { id, name: file.name, kind: null, progress: 0, status: 'error', error: 'Formato no soportado.' }])
        continue
      }
      if (file.size > MAX_BYTES[kind]) {
        setQueue(prev => [...prev, { id, name: file.name, kind, progress: 0, status: 'error', error: `Supera el máximo permitido (${fmtMb(MAX_BYTES[kind])}).` }])
        continue
      }

      setQueue(prev => [...prev, { id, name: file.name, kind, progress: 0, status: 'uploading' }])
      runUpload({ id }, file, kind)
        .then(asset => { removeItem(id); onUploaded?.(asset) })
        .catch(err => {
          if (err.message === 'CANCELLED') { removeItem(id); return }
          updateItem(id, { status: 'error', error: err.message || 'No se pudo subir el archivo' })
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, pieceId])

  async function handleAddLink(e) {
    e.preventDefault()
    const url = linkUrl.trim()
    if (!url || linkBusy) return
    setLinkBusy(true)
    setLinkError(null)
    try {
      const { data } = await api.post(`/contenido/projects/${projectId}/pieces/${pieceId}/assets/link`, { url })
      setLinkUrl('')
      onUploaded?.(data)
    } catch (err) {
      setLinkError(err.response?.data?.error || 'No se pudo agregar el link')
    } finally {
      setLinkBusy(false)
    }
  }

  function cancel(id) {
    const token = cancelRef.current.get(id)
    if (token instanceof AbortController) token.abort()
    else token?.abort?.()
    removeItem(id)
  }

  const STATUS_LABEL = { uploading: 'Subiendo…', poster: 'Generando miniatura…', confirming: 'Confirmando…' }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {/* 1. Subir desde la computadora */}
        <div
          onClick={() => !disabled && inputRef.current?.click()}
          onDragOver={e => { if (!disabled) { e.preventDefault(); setDragOver(true) } }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault()
            setDragOver(false)
            if (!disabled) handleFiles(e.dataTransfer.files)
          }}
          title={`PNG, JPG, WEBP, GIF (hasta ${fmtMb(MAX_BYTES.image)}) · MP4, MOV, WEBM (hasta ${fmtMb(MAX_BYTES.video)})`}
          className={`${CARD_BASE} ${disabled ? CARD_DISABLED : dragOver ? CARD_ACTIVE : CARD_ENABLED}`}
        >
          <span className="text-xl">📤</span>
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            {dragOver ? 'Soltá para subir' : 'Desde tu computadora'}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight">
            Arrastrá o hacé click
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            disabled={disabled}
            onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
            className="hidden"
          />
        </div>

        {/* 2. Link externo (Google Drive, etc.) */}
        <form
          onSubmit={handleAddLink}
          className={`${CARD_BASE} ${disabled ? CARD_DISABLED : 'border-gray-200 dark:border-gray-700 cursor-default'}`}
        >
          <span className="text-xl">🔗</span>
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Link externo</p>
          <div className="w-full flex items-center gap-1">
            <input
              type="url"
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              placeholder="Google Drive, etc."
              disabled={disabled || linkBusy}
              className="w-full min-w-0 text-[11px] px-1.5 py-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={disabled || linkBusy || !linkUrl.trim()}
              className="shrink-0 text-[11px] px-2 py-1 rounded-md bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white font-medium transition-colors"
            >
              {linkBusy ? '…' : 'Agregar'}
            </button>
          </div>
        </form>

        {/* 3. Archivo ya subido a la nube de BlissTracker (repositorio de Archivos del proyecto) */}
        {onOpenLibrary && (
          <button
            type="button"
            onClick={() => { if (!disabled && !libraryDisabled) onOpenLibrary() }}
            disabled={disabled || libraryDisabled}
            title={libraryDisabled ? 'No disponible con la pieza publicada' : undefined}
            className={`${CARD_BASE} ${disabled || libraryDisabled ? CARD_DISABLED : CARD_ENABLED}`}
          >
            <span className="text-xl">☁️</span>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Nube de BlissTracker</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight">
              Archivo ya subido al proyecto
            </p>
          </button>
        )}
      </div>

      {linkError && <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">{linkError}</p>}

      {queue.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {queue.map(it => (
            <div key={it.id} className="flex items-center gap-2 text-xs bg-gray-50 dark:bg-gray-900/40 rounded-lg px-2.5 py-1.5">
              <span className="truncate flex-1 text-gray-600 dark:text-gray-300">{it.name}</span>
              {it.status === 'error' ? (
                <span className="text-red-500 dark:text-red-400 shrink-0">{it.error}</span>
              ) : (
                <>
                  <span className="text-gray-400 shrink-0">{STATUS_LABEL[it.status] || '…'}{it.status === 'uploading' ? ` ${it.progress}%` : ''}</span>
                  <div className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden shrink-0">
                    <div className="h-full bg-primary-500 transition-all" style={{ width: `${it.status === 'uploading' ? it.progress : 100}%` }} />
                  </div>
                  <button onClick={() => cancel(it.id)} className="text-gray-400 hover:text-red-500 shrink-0" title="Cancelar">✕</button>
                </>
              )}
              {it.status === 'error' && (
                <button onClick={() => removeItem(it.id)} className="text-gray-400 hover:text-gray-600 shrink-0">✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
