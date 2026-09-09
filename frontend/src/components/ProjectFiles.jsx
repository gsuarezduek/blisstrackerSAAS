import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api/client'
import LoadingSpinner from './LoadingSpinner'
import { useProjectFileUpload, fmtMb, MAX_FILE_BYTES } from './projectFilesUpload'

function fmtBytes(n) {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function iconFor(mimeType) {
  if (!mimeType) return '📎'
  if (mimeType.startsWith('image/')) return '🖼️'
  if (mimeType.startsWith('video/')) return '🎬'
  if (mimeType.startsWith('audio/')) return '🎵'
  if (mimeType === 'application/pdf') return '📕'
  if (mimeType.includes('word')) return '📝'
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📈'
  if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('rar') || mimeType.includes('tar')) return '📦'
  if (mimeType.startsWith('text/')) return '📄'
  return '📎'
}

// ─── Modales chicos (nueva carpeta / renombrar / mover / confirmar borrado) ───

function NewFolderModal({ projectId, parentId, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true); setError('')
    try {
      const { data } = await api.post(`/projects/${projectId}/files/folders`, { name: trimmed, parentId })
      onCreated(data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear la carpeta')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-bold text-gray-900 dark:text-white mb-3">📁 Nueva carpeta</p>
        <input
          autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Nombre de la carpeta"
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        {error && <p className="text-xs text-red-500 dark:text-red-400 mt-1.5">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Cancelar</button>
          <button type="submit" disabled={saving || !name.trim()} className="text-sm px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium">
            {saving ? 'Creando…' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  )
}

function RenameModal({ projectId, item, onClose, onRenamed }) {
  const [name, setName] = useState(item.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true); setError('')
    try {
      const { data } = await api.patch(`/projects/${projectId}/files/${item.id}`, { name: trimmed })
      onRenamed(data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo renombrar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-bold text-gray-900 dark:text-white mb-3">✏️ Renombrar</p>
        <input
          autoFocus value={name} onChange={e => setName(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        {error && <p className="text-xs text-red-500 dark:text-red-400 mt-1.5">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Cancelar</button>
          <button type="submit" disabled={saving || !name.trim()} className="text-sm px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}

// Selector de carpeta destino: navega el mismo árbol con el mismo endpoint de
// listado (filtrando solo carpetas). La validación de "no mover dentro de sí
// misma / de una subcarpeta" la hace el backend — acá solo se oculta la
// propia carpeta del listado como guía visual, sin duplicar esa lógica.
function MoveModal({ projectId, item, onClose, onMoved }) {
  const [folderId, setFolderId] = useState(null)
  const [path, setPath] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    const params = folderId ? `?parentId=${folderId}` : ''
    api.get(`/projects/${projectId}/files${params}`)
      .then(({ data }) => { if (active) { setFolders(data.folders); setPath(data.path) } })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [projectId, folderId])

  async function handleMove() {
    setSaving(true); setError('')
    try {
      await api.patch(`/projects/${projectId}/files/${item.id}`, { parentId: folderId })
      onMoved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo mover')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 border-b dark:border-gray-700 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">📂 Mover "{item.name}"</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none shrink-0">×</button>
        </div>
        <div className="px-5 py-2.5 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 flex-wrap border-b dark:border-gray-700">
          <button onClick={() => setFolderId(null)} className={`hover:text-primary-600 dark:hover:text-primary-400 ${!folderId ? 'font-semibold text-gray-700 dark:text-gray-200' : ''}`}>Raíz</button>
          {path.map(p => (
            <span key={p.id} className="flex items-center gap-1">
              <span>/</span>
              <button onClick={() => setFolderId(p.id)} className="hover:text-primary-600 dark:hover:text-primary-400">{p.name}</button>
            </span>
          ))}
        </div>
        <div className="overflow-y-auto px-3 py-2 flex-1 min-h-[160px]">
          {loading ? <LoadingSpinner className="py-8" /> : folders.filter(f => f.id !== item.id).length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">No hay subcarpetas acá</p>
          ) : (
            <div className="space-y-0.5">
              {folders.filter(f => f.id !== item.id).map(f => (
                <button
                  key={f.id} onClick={() => setFolderId(f.id)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-left text-gray-700 dark:text-gray-200"
                >
                  <span>📁</span><span className="truncate">{f.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {error && <p className="px-5 pb-1 text-xs text-red-500 dark:text-red-400">{error}</p>}
        <div className="px-5 py-3 border-t dark:border-gray-700 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Cancelar</button>
          <button onClick={handleMove} disabled={saving} className="text-sm px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium">
            {saving ? 'Moviendo…' : 'Mover acá'}
          </button>
        </div>
      </div>
    </div>
  )
}

// "🔗 Copiar enlace" — deep-link para pegar en la descripción/comentario de una
// tarea (linkify.jsx la vuelve clickeable). Al abrirlo, ProjectFiles resuelve
// la carpeta contenedora y abre el archivo automáticamente (ver `locate`).
function fileDeepLink(projectId, item) {
  return `${window.location.origin}/my-projects/${projectId}?infoTab=archivos&fileId=${item.id}`
}

function CopyLinkModal({ projectId, item, onClose }) {
  const [copied, setCopied] = useState(false)
  const link = fileDeepLink(projectId, item)

  async function handleCopy() {
    try { await navigator.clipboard.writeText(link) } catch { /* fallback: seleccionar el input */ }
    setCopied(true)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-bold text-gray-900 dark:text-white mb-1">🔗 Enlace a "{item.name}"</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Pegalo en la descripción o un comentario de una tarea — cualquiera del equipo lo abre directo en este archivo.</p>
        <div className="flex items-center gap-2">
          <input readOnly value={link} onFocus={e => e.target.select()} className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-xs" />
          <button onClick={handleCopy} className="text-sm px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium shrink-0">
            {copied ? '✓ Copiado' : 'Copiar'}
          </button>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Cerrar</button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDeleteModal({ item, onClose, onConfirm }) {
  const [saving, setSaving] = useState(false)
  const isFolder = item.type === 'folder'

  async function handleConfirm() {
    setSaving(true)
    try { await onConfirm() } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-bold text-gray-900 dark:text-white mb-2">🗑️ Eliminar {isFolder ? 'carpeta' : 'archivo'}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {isFolder
            ? <>Se va a eliminar <strong>"{item.name}"</strong> y todo su contenido (subcarpetas y archivos). Esta acción no se puede deshacer.</>
            : <>Se va a eliminar <strong>"{item.name}"</strong>. Esta acción no se puede deshacer.</>}
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Cancelar</button>
          <button onClick={handleConfirm} disabled={saving} className="text-sm px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium">
            {saving ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tarjeta de ítem (carpeta o archivo) con menú contextual ──────────────────

function ItemCard({ item, menuOpen, onOpenMenu, onOpen, onRename, onMove, onDelete, onDownload, onCopyLink, onCreateTask }) {
  const isFolder = item.type === 'folder'
  const isImage = !isFolder && item.mimeType?.startsWith('image/')
  const isPreviewable = !isFolder && !isImage && item.previewable
  return (
    <div className="relative group">
      <button
        onClick={() => onOpen(item)}
        className="w-full flex flex-col items-center gap-1.5 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-center"
        title={item.name}
      >
        <div className="w-14 h-14 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-900/40 overflow-hidden">
          {isImage && item.url ? (
            <img src={item.url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-3xl">{isFolder ? '📁' : iconFor(item.mimeType)}</span>
          )}
        </div>
        <span className="text-xs text-gray-700 dark:text-gray-200 truncate w-full">{item.name}</span>
        {!isFolder && <span className="text-[10px] text-gray-400 dark:text-gray-500">{fmtBytes(item.sizeBytes)}</span>}
      </button>

      <button
        onClick={e => { e.stopPropagation(); onOpenMenu(menuOpen ? null : item.id) }}
        className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-700 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-sm"
        title="Más acciones"
      >
        ⋯
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => onOpenMenu(null)} />
          <div className="absolute top-7 right-1 z-50 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 text-sm">
            {isPreviewable && (
              <button onClick={() => { onOpenMenu(null); onOpen(item) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">👁️ Ver</button>
            )}
            <button onClick={() => { onOpenMenu(null); onRename(item) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">✏️ Renombrar</button>
            <button onClick={() => { onOpenMenu(null); onMove(item) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">📂 Mover</button>
            {!isFolder && (
              <>
                <button onClick={() => { onOpenMenu(null); onDownload(item) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">⬇️ Descargar</button>
                <button onClick={() => { onOpenMenu(null); onCopyLink(item) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">🔗 Copiar enlace</button>
                {onCreateTask && (
                  <button onClick={() => { onOpenMenu(null); onCreateTask(item) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">➕ Crear tarea</button>
                )}
              </>
            )}
            <button onClick={() => { onOpenMenu(null); onDelete(item) }} className="w-full text-left px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400">🗑️ Eliminar</button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────

export default function ProjectFiles({ projectId, deepLinkFileId, onCreateTaskFromFile }) {
  const [folderId, setFolderId] = useState(null)
  const [path, setPath] = useState([])
  const [folders, setFolders] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [dragOver, setDragOver] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [modal, setModal] = useState(null) // null | {type:'newFolder'|'rename'|'move'|'delete'|'copyLink', item?}
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState(null) // url de imagen a mostrar en grande
  const [preview, setPreview] = useState(null) // null | { item, status:'loading'|'ready'|'error', blobUrl }
  const [highlightId, setHighlightId] = useState(null) // resalta brevemente el ítem abierto por deep-link
  const inputRef = useRef(null)
  const deepLinkConsumedRef = useRef(false)

  const reload = useCallback(async (fid) => {
    setLoading(true)
    setError('')
    try {
      const params = fid ? `?parentId=${fid}` : ''
      const { data } = await api.get(`/projects/${projectId}/files${params}`)
      setFolders(data.folders)
      setFiles(data.files)
      setPath(data.path)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar los archivos')
    } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { reload(folderId) }, [folderId, reload])

  // Deep-link "🔗 Copiar enlace": ?fileId= resuelto una sola vez al montar —
  // navega a la carpeta contenedora y abre el archivo (preview o lightbox).
  useEffect(() => {
    if (!deepLinkFileId || deepLinkConsumedRef.current) return
    deepLinkConsumedRef.current = true
    let active = true
    ;(async () => {
      try {
        const { data } = await api.get(`/projects/${projectId}/files/${deepLinkFileId}/locate`)
        if (!active) return
        setFolderId(data.parentId ?? null)
        setHighlightId(data.file.id)
        setTimeout(() => setHighlightId(null), 2500)
        if (data.file.mimeType?.startsWith('image/') && data.file.url) setLightbox(data.file.url)
        else if (data.file.previewable) openPreview(data.file)
      } catch {
        setError('No se encontró el archivo del enlace (puede haber sido eliminado)')
      }
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkFileId, projectId])

  const { queue, handleFiles, cancel } = useProjectFileUpload({
    projectId,
    onUploaded: () => reload(folderId),
  })

  function openItem(item) {
    if (item.type === 'folder') { setFolderId(item.id); return }
    const isImage = item.mimeType?.startsWith('image/')
    if (isImage && item.url) { setLightbox(item.url); return }
    if (!isImage && item.previewable) { openPreview(item); return }
    handleDownload(item)
  }

  async function openPreview(item) {
    setPreview({ item, status: 'loading', blobUrl: null })
    try {
      const res = await api.get(`/projects/${projectId}/files/${item.id}/download?inline=1`, { responseType: 'blob' })
      const blobUrl = URL.createObjectURL(res.data)
      setPreview({ item, status: 'ready', blobUrl })
    } catch {
      setPreview({ item, status: 'error', blobUrl: null })
    }
  }

  function closePreview() {
    if (preview?.blobUrl) URL.revokeObjectURL(preview.blobUrl)
    setPreview(null)
  }

  async function handleDownload(item) {
    try {
      const res = await api.get(`/projects/${projectId}/files/${item.id}/download`, { responseType: 'blob' })
      const blobUrl = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = item.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
    } catch {
      setError('No se pudo descargar el archivo')
    }
  }

  async function handleDeleteConfirmed(item) {
    await api.delete(`/projects/${projectId}/files/${item.id}`)
    setModal(null)
    reload(folderId)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files, folderId)
  }

  return (
    <div
      className={`space-y-3 rounded-2xl transition-colors ${dragOver ? 'ring-2 ring-primary-400 bg-primary-50/30 dark:bg-primary-900/10' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={e => { if (e.target === e.currentTarget) setDragOver(false) }}
      onDrop={handleDrop}
    >
      {/* Breadcrumb + toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 flex-wrap min-w-0">
          <button onClick={() => setFolderId(null)} className={`hover:text-primary-600 dark:hover:text-primary-400 ${!folderId ? 'font-semibold text-gray-800 dark:text-gray-100' : ''}`}>
            🏠 Raíz
          </button>
          {path.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1 min-w-0">
              <span>/</span>
              <button
                onClick={() => setFolderId(p.id)}
                className={`truncate hover:text-primary-600 dark:hover:text-primary-400 ${i === path.length - 1 ? 'font-semibold text-gray-800 dark:text-gray-100' : ''}`}
              >
                {p.name}
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setModal({ type: 'newFolder' })}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
          >
            📁 Nueva carpeta
          </button>
          <button
            onClick={() => inputRef.current?.click()}
            className="text-sm px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium"
          >
            ⬆ Subir archivos
          </button>
          <input
            ref={inputRef} type="file" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) handleFiles(e.target.files, folderId); e.target.value = '' }}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

      {/* Cola de subida */}
      {queue.length > 0 && (
        <div className="space-y-1.5">
          {queue.map(it => (
            <div key={it.id} className="flex items-center gap-2 text-xs bg-gray-50 dark:bg-gray-900/40 rounded-lg px-2.5 py-1.5">
              <span className="truncate flex-1 text-gray-600 dark:text-gray-300">{it.name}</span>
              {it.status === 'error' ? (
                <span className="text-red-500 dark:text-red-400 shrink-0">{it.error}</span>
              ) : (
                <>
                  <span className="text-gray-400 shrink-0">
                    {it.status === 'confirming' ? 'Confirmando…' : `Subiendo… ${it.progress}%`}
                  </span>
                  <div className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden shrink-0">
                    <div className="h-full bg-primary-500 transition-all" style={{ width: `${it.status === 'uploading' ? it.progress : 100}%` }} />
                  </div>
                  <button onClick={() => cancel(it.id)} className="text-gray-400 hover:text-red-500 shrink-0" title="Cancelar">✕</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Grilla */}
      {loading ? (
        <LoadingSpinner className="py-16" />
      ) : folders.length === 0 && files.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-2">🗂️</p>
          <p>Todavía no hay nada acá.</p>
          <p className="text-xs mt-1">Arrastrá archivos a esta ventana o usá "Subir archivos".</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {[...folders, ...files].map(item => (
            <div key={`${item.type}-${item.id}`} className={highlightId === item.id ? 'rounded-xl ring-2 ring-primary-400 animate-pulse' : ''}>
              <ItemCard
                item={item}
                menuOpen={menuOpenId === item.id}
                onOpenMenu={setMenuOpenId}
                onOpen={openItem}
                onRename={it => setModal({ type: 'rename', item: it })}
                onMove={it => setModal({ type: 'move', item: it })}
                onDelete={it => setModal({ type: 'delete', item: it })}
                onDownload={handleDownload}
                onCopyLink={it => setModal({ type: 'copyLink', item: it })}
                onCreateTask={onCreateTaskFromFile ? it => onCreateTaskFromFile(it, fileDeepLink(projectId, it)) : null}
              />
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500">Hasta {fmtMb(MAX_FILE_BYTES)} por archivo.</p>

      {/* Modales */}
      {modal?.type === 'newFolder' && (
        <NewFolderModal
          projectId={projectId} parentId={folderId}
          onClose={() => setModal(null)}
          onCreated={() => { setModal(null); reload(folderId) }}
        />
      )}
      {modal?.type === 'rename' && (
        <RenameModal
          projectId={projectId} item={modal.item}
          onClose={() => setModal(null)}
          onRenamed={() => { setModal(null); reload(folderId) }}
        />
      )}
      {modal?.type === 'move' && (
        <MoveModal
          projectId={projectId} item={modal.item}
          onClose={() => setModal(null)}
          onMoved={() => { setModal(null); reload(folderId) }}
        />
      )}
      {modal?.type === 'delete' && (
        <ConfirmDeleteModal
          item={modal.item}
          onClose={() => setModal(null)}
          onConfirm={() => handleDeleteConfirmed(modal.item)}
        />
      )}
      {modal?.type === 'copyLink' && (
        <CopyLinkModal projectId={projectId} item={modal.item} onClose={() => setModal(null)} />
      )}

      {/* Lightbox de imagen */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg" />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white text-3xl leading-none">×</button>
        </div>
      )}

      {/* Preview de video/PDF — se pide como blob autenticado (?inline=1), no un link directo a R2 */}
      {preview && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={closePreview}>
          <div className="w-full max-w-4xl max-h-[85vh] flex items-center justify-center" onClick={e => e.stopPropagation()}>
            {preview.status === 'loading' && <LoadingSpinner size="lg" />}
            {preview.status === 'error' && <p className="text-white text-sm">No se pudo cargar la vista previa.</p>}
            {preview.status === 'ready' && preview.item.mimeType?.startsWith('video/') && (
              <video src={preview.blobUrl} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg" />
            )}
            {preview.status === 'ready' && preview.item.mimeType === 'application/pdf' && (
              <iframe src={preview.blobUrl} title={preview.item.name} className="w-full h-[85vh] bg-white rounded-lg" />
            )}
          </div>
          <button onClick={closePreview} className="absolute top-4 right-4 text-white text-3xl leading-none">×</button>
        </div>
      )}
    </div>
  )
}
