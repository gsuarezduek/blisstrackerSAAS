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
// misma / de una subcarpeta" la hace el backend — acá solo se oculta del
// listado las propias carpetas que se están moviendo, como guía visual, sin
// duplicar esa lógica. `items` siempre es un array (1 elemento = mover uno
// solo desde el menú ⋯, N = acción en lote desde la selección múltiple).
function MoveModal({ projectId, items, onClose, onMoved }) {
  const [folderId, setFolderId] = useState(null)
  const [path, setPath] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const movingIds = new Set(items.map(it => it.id))

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
    const results = await Promise.allSettled(
      items.map(it => api.patch(`/projects/${projectId}/files/${it.id}`, { parentId: folderId }))
    )
    const failed = results.filter(r => r.status === 'rejected').length
    setSaving(false)
    if (failed > 0) {
      setError(failed === items.length ? 'No se pudo mover' : `${failed} de ${items.length} no se pudieron mover`)
      if (failed < items.length) onMoved()
    } else {
      onMoved()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 border-b dark:border-gray-700 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
            📂 Mover {items.length > 1 ? `${items.length} elementos` : `"${items[0].name}"`}
          </p>
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
          {loading ? <LoadingSpinner className="py-8" /> : folders.filter(f => !movingIds.has(f.id)).length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">No hay subcarpetas acá</p>
          ) : (
            <div className="space-y-0.5">
              {folders.filter(f => !movingIds.has(f.id)).map(f => (
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

// `items` siempre es un array (1 = borrado individual desde el menú ⋯, N =
// acción en lote). `onConfirm` recibe el array y decide cómo borrarlos.
function ConfirmDeleteModal({ items, onClose, onConfirm }) {
  const [saving, setSaving] = useState(false)
  const hasFolder = items.some(it => it.type === 'folder')

  async function handleConfirm() {
    setSaving(true)
    try { await onConfirm(items) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-bold text-gray-900 dark:text-white mb-2">
          🗑️ Eliminar {items.length > 1 ? `${items.length} elementos` : (items[0].type === 'folder' ? 'carpeta' : 'archivo')}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {items.length > 1
            ? <>Se van a mover <strong>{items.length} elementos</strong>{hasFolder ? ' (y el contenido de las carpetas)' : ''} a la Papelera.</>
            : items[0].type === 'folder'
              ? <>Se va a mover <strong>"{items[0].name}"</strong> y todo su contenido (subcarpetas y archivos) a la Papelera.</>
              : <>Se va a mover <strong>"{items[0].name}"</strong> a la Papelera.</>}
          {' '}Se puede restaurar desde ahí durante un tiempo.
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

// Fecha corta: "3 sep" (o "3 sep 2025" si no es el año en curso) — se usa para
// mostrar quién subió/borró algo sin ocupar mucho espacio en la grilla.
function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

// "🗑️ Papelera" — lista solo las raíces de cada subárbol borrado (el backend
// ya colapsa una carpeta con contenido en una sola fila) con quién y cuándo lo
// borró, y un botón para restaurar (cascadea a todo el contenido, si aplica).
function TrashModal({ projectId, onClose, onRestored }) {
  const [items, setItems] = useState(null) // null = cargando
  const [restoringId, setRestoringId] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setItems(null)
    api.get(`/projects/${projectId}/files/trash`)
      .then(({ data }) => setItems(data.items))
      .catch(() => { setItems([]); setError('No se pudo cargar la papelera') })
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function handleRestore(item) {
    setRestoringId(item.id); setError('')
    try {
      await api.post(`/projects/${projectId}/files/${item.id}/restore`)
      setItems(prev => prev.filter(it => it.id !== item.id))
      onRestored()
    } catch {
      setError('No se pudo restaurar')
    } finally { setRestoringId(null) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 border-b dark:border-gray-700 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-gray-900 dark:text-white">🗑️ Papelera</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none shrink-0">×</button>
        </div>
        <div className="overflow-y-auto px-3 py-2 flex-1 min-h-[160px]">
          {items === null ? <LoadingSpinner className="py-8" /> : items.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">La papelera está vacía</p>
          ) : (
            <div className="space-y-0.5">
              {items.map(it => (
                <div key={it.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <span className="text-xl shrink-0">{it.type === 'folder' ? '📁' : iconFor(it.mimeType)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 dark:text-gray-200 truncate">{it.name}</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                      Eliminado por {it.deletedBy?.name ?? 'alguien'} · {fmtDate(it.deletedAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRestore(it)} disabled={restoringId === it.id}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 shrink-0"
                  >
                    {restoringId === it.id ? 'Restaurando…' : '↩️ Restaurar'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {error && <p className="px-5 pb-3 text-xs text-red-500 dark:text-red-400">{error}</p>}
      </div>
    </div>
  )
}

// ─── Tarjeta de ítem (carpeta o archivo) con menú contextual ──────────────────

function ItemCard({ item, menuOpen, onOpenMenu, onOpen, onRename, onMove, onDelete, onDownload, onCopyLink, onCreateTask, caption, selected, onToggleSelect }) {
  const isFolder = item.type === 'folder'
  const isImage = !isFolder && item.mimeType?.startsWith('image/')
  const isPreviewable = !isFolder && !isImage && item.previewable
  return (
    <div className={`relative group rounded-xl ${selected ? 'ring-2 ring-primary-500' : ''}`}>
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
        {caption && <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate w-full">{caption}</span>}
      </button>

      {onToggleSelect && (
        <button
          onClick={e => { e.stopPropagation(); onToggleSelect(item) }}
          className={`absolute top-1 left-1 w-5 h-5 flex items-center justify-center rounded-md border text-[11px] transition-opacity ${
            selected
              ? 'bg-primary-600 border-primary-600 text-white opacity-100'
              : 'bg-white/90 dark:bg-gray-800/90 border-gray-300 dark:border-gray-600 text-transparent opacity-0 group-hover:opacity-100 focus:opacity-100'
          }`}
          title="Seleccionar"
        >
          ✓
        </button>
      )}

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

const SORT_OPTIONS = [
  { value: 'name-asc',  label: 'Nombre (A-Z)' },
  { value: 'name-desc', label: 'Nombre (Z-A)' },
  { value: 'date-desc', label: 'Más reciente primero' },
  { value: 'date-asc',  label: 'Más antiguo primero' },
  { value: 'size-desc', label: 'Tamaño (mayor primero)' },
]

function sortItems(list, sortBy) {
  const sorted = [...list]
  switch (sortBy) {
    case 'name-desc': return sorted.sort((a, b) => b.name.localeCompare(a.name))
    case 'date-desc': return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    case 'date-asc':  return sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    case 'size-desc': return sorted.sort((a, b) => (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1))
    default:          return sorted.sort((a, b) => a.name.localeCompare(b.name)) // name-asc
  }
}

export default function ProjectFiles({ projectId, deepLinkFileId, onCreateTaskFromFile }) {
  const [folderId, setFolderId] = useState(null)
  const [path, setPath] = useState([])
  const [folders, setFolders] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [dragOver, setDragOver] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [modal, setModal] = useState(null) // null | {type:'newFolder'|'rename'|'move'|'delete'|'copyLink'|'bulkMove'|'bulkDelete', item?, items?}
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState(null) // url de imagen a mostrar en grande
  const [preview, setPreview] = useState(null) // null | { item, status:'loading'|'ready'|'error', blobUrl }
  const [highlightId, setHighlightId] = useState(null) // resalta brevemente el ítem abierto por deep-link
  const [sortBy, setSortBy] = useState('name-asc')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null) // null = no buscando
  const [searching, setSearching] = useState(false)
  const [showTrash, setShowTrash] = useState(false)
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
  useEffect(() => { setSelectedIds(new Set()) }, [folderId]) // no arrastrar selección entre carpetas

  // Buscador global del proyecto — debounce 300ms, cancela resultados viejos
  // si la query cambió antes de que respondiera el servidor.
  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) { setSearchResults(null); setSearching(false); return }
    let active = true
    setSearching(true)
    const t = setTimeout(() => {
      api.get(`/projects/${projectId}/files/search?q=${encodeURIComponent(q)}`)
        .then(({ data }) => { if (active) setSearchResults(data.items) })
        .catch(() => { if (active) setSearchResults([]) })
        .finally(() => { if (active) setSearching(false) })
    }, 300)
    return () => { active = false; clearTimeout(t) }
  }, [searchQuery, projectId])

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

  // Click en un resultado de búsqueda: navega a la carpeta contenedora (según
  // el `path` que ya trajo el propio resultado) y abre el ítem — sin esperar
  // a que recargue esa carpeta, ya tenemos toda la data del ítem en mano.
  function openFoundItem(item) {
    setSearchQuery('')
    if (item.type === 'folder') { setFolderId(item.id); return }
    const parentId = item.path.length ? item.path[item.path.length - 1].id : null
    setFolderId(parentId)
    const isImage = item.mimeType?.startsWith('image/')
    if (isImage && item.url) { setLightbox(item.url); return }
    if (!isImage && item.previewable) { openPreview(item); return }
    handleDownload(item)
  }

  function toggleSelect(item) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
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

  async function handleDeleteConfirmed(items) {
    await Promise.allSettled(items.map(it => api.delete(`/projects/${projectId}/files/${it.id}`)))
    setModal(null)
    setSelectedIds(prev => {
      const next = new Set(prev)
      items.forEach(it => next.delete(it.id))
      return next
    })
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
            onClick={() => setShowTrash(true)}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
            title="Papelera"
          >
            🗑️
          </button>
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

      {/* Buscador + orden */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <input
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍 Buscar en todo el proyecto…"
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg pl-3 pr-7 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm">✕</button>
          )}
        </div>
        {searchResults === null && (
          <select
            value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
      </div>

      {/* Barra de acciones en lote — reemplaza la explicación de tamaño mientras haya selección */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 text-sm bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg px-3 py-2">
          <span className="text-primary-700 dark:text-primary-300 font-medium">{selectedIds.size} seleccionado{selectedIds.size > 1 ? 's' : ''}</span>
          <button
            onClick={() => setModal({ type: 'bulkMove', items: [...folders, ...files].filter(it => selectedIds.has(it.id)) })}
            className="text-gray-600 dark:text-gray-300 hover:text-primary-700 dark:hover:text-primary-300"
          >📂 Mover</button>
          <button
            onClick={() => setModal({ type: 'bulkDelete', items: [...folders, ...files].filter(it => selectedIds.has(it.id)) })}
            className="text-red-600 dark:text-red-400 hover:text-red-700"
          >🗑️ Eliminar</button>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">Cancelar</button>
        </div>
      )}

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

      {/* Grilla — modo búsqueda (flat, todo el proyecto) o modo carpeta (normal) */}
      {searchResults !== null ? (
        searching && searchResults.length === 0 ? (
          <LoadingSpinner className="py-16" />
        ) : searchResults.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-3xl mb-2">🔍</p>
            <p>Sin resultados para "{searchQuery}".</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {searchResults.map(item => (
              <ItemCard
                key={`${item.type}-${item.id}`}
                item={item}
                menuOpen={menuOpenId === item.id}
                onOpenMenu={setMenuOpenId}
                onOpen={openFoundItem}
                onRename={it => setModal({ type: 'rename', item: it })}
                onMove={it => setModal({ type: 'move', item: it })}
                onDelete={it => setModal({ type: 'delete', item: it })}
                onDownload={handleDownload}
                onCopyLink={it => setModal({ type: 'copyLink', item: it })}
                onCreateTask={onCreateTaskFromFile ? it => onCreateTaskFromFile(it, fileDeepLink(projectId, it)) : null}
                caption={item.path.length ? `🏠 / ${item.path.map(p => p.name).join(' / ')}` : '🏠 Raíz'}
              />
            ))}
          </div>
        )
      ) : loading ? (
        <LoadingSpinner className="py-16" />
      ) : folders.length === 0 && files.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-2">🗂️</p>
          <p>Todavía no hay nada acá.</p>
          <p className="text-xs mt-1">Arrastrá archivos a esta ventana o usá "Subir archivos".</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {[...sortItems(folders, sortBy), ...sortItems(files, sortBy)].map(item => (
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
                caption={item.uploadedBy ? `${item.uploadedBy.name} · ${fmtDate(item.createdAt)}` : fmtDate(item.createdAt)}
                selected={selectedIds.has(item.id)}
                onToggleSelect={toggleSelect}
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
      {(modal?.type === 'move' || modal?.type === 'bulkMove') && (
        <MoveModal
          projectId={projectId} items={modal.items ?? [modal.item]}
          onClose={() => setModal(null)}
          onMoved={() => { setModal(null); setSelectedIds(new Set()); reload(folderId) }}
        />
      )}
      {(modal?.type === 'delete' || modal?.type === 'bulkDelete') && (
        <ConfirmDeleteModal
          items={modal.items ?? [modal.item]}
          onClose={() => setModal(null)}
          onConfirm={handleDeleteConfirmed}
        />
      )}
      {modal?.type === 'copyLink' && (
        <CopyLinkModal projectId={projectId} item={modal.item} onClose={() => setModal(null)} />
      )}
      {showTrash && (
        <TrashModal
          projectId={projectId}
          onClose={() => setShowTrash(false)}
          onRestored={() => reload(folderId)}
        />
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
