import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from './LoadingSpinner'
import { useProjectFileUpload, fmtMb, MAX_FILE_BYTES } from './projectFilesUpload'
import ContentFilePiecesModal from './contenido/ContentFilePiecesModal'
import { FolderOpen, Search } from 'lucide-react'
import { Icon } from './ui/Icon'
import { NewFolderModal, RenameModal, CopyLinkModal, ConfirmDeleteModal } from './projectFiles/SimpleModals'
import MoveModal from './projectFiles/MoveModal'
import ShareFolderModal from './projectFiles/ShareFolderModal'
import TrashModal from './projectFiles/TrashModal'
import ItemCard from './projectFiles/ItemCard'
import FilesToolbar from './projectFiles/FilesToolbar'
import FilesSearchBar from './projectFiles/FilesSearchBar'
import BulkActionBar from './projectFiles/BulkActionBar'
import UploadQueue from './projectFiles/UploadQueue'
import FilePreviewModals from './projectFiles/FilePreviewModals'
import { fmtDate, fileDeepLink, sortItems } from './projectFiles/projectFilesHelpers'

// ─── Componente principal ──────────────────────────────────────────────────

export default function ProjectFiles({ projectId, deepLinkFileId, onCreateTaskFromFile, contenidoEnabled }) {
  const { user } = useAuth()
  const isAdmin = !!user?.isAdmin
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
  const [preview, setPreview] = useState(null) // null | { item, status:'loading'|'ready'|'error', src }
  const [highlightId, setHighlightId] = useState(null) // resalta brevemente el ítem abierto por deep-link
  const [sortBy, setSortBy] = useState('name-asc')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [downloadingZip, setDownloadingZip] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null) // null = no buscando
  const [searching, setSearching] = useState(false)
  const [showTrash, setShowTrash] = useState(false)
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
        // PDF NO se auto-abre acá: no hay gesto de click en este momento (es un
        // efecto al montar), así que window.open quedaría bloqueado como popup
        // — el highlight ya señala el archivo, un click del usuario lo abre bien.
        else if (data.file.mimeType?.startsWith('video/') && data.file.previewable) openPreview(data.file)
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

  // Abre un ítem según su tipo: carpeta navega, imagen va al lightbox, video
  // se previsualiza inline (modal), PDF se abre en una pestaña nueva (más
  // confiable entre navegadores que un <iframe> embebido), el resto descarga.
  function openItem(item) {
    if (item.type === 'folder') { setFolderId(item.id); return }
    const isImage = item.mimeType?.startsWith('image/')
    if (isImage && item.url) { setLightbox(item.url); return }
    if (item.mimeType === 'application/pdf') { openPdfInNewTab(item); return }
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
    if (item.mimeType === 'application/pdf') { openPdfInNewTab(item); return }
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

  // Abre la pestaña VACÍA de forma sincrónica (dentro del gesto del click, o
  // el navegador la bloquea como popup) y recién después la apunta al blob ya
  // descargado — si el navegador igual bloqueó la apertura (`win` null), cae
  // al modal inline de siempre como fallback.
  function openPdfInNewTab(item) {
    const win = window.open('', '_blank')
    if (!win) { openPreview(item); return }
    ;(async () => {
      try {
        win.location.href = await signedUrl(item, true)
      } catch {
        win.close()
        setError('No se pudo cargar la vista previa del PDF')
      }
    })()
  }

  // URL firmada de R2 (`?inline=1`) directo en el <video>/<iframe>: el video
  // arranca con los primeros bytes y el seek es instantáneo (R2 sirve `Range`
  // nativo). Antes se pedía el archivo COMPLETO por XHR como blob, así que no
  // se veía un solo frame hasta que terminaba de bajarse entero.
  async function openPreview(item) {
    setPreview({ item, status: 'loading', src: null })
    try {
      setPreview({ item, status: 'ready', src: await signedUrl(item, true) })
    } catch {
      setPreview({ item, status: 'error', src: null })
    }
  }

  // Ya no hay blob URLs que liberar: todo el preview va por URL firmada.
  function closePreview() {
    setPreview(null)
  }

  // Descarga directa desde R2 con una URL firmada de vida corta en vez de
  // traer el archivo por XHR como blob: la baja el navegador (con su propia
  // barra de progreso, y reanudable), y un video de 300MB no queda entero en
  // la RAM de la pestaña — eso era lo que hacía sentir "trabado" al tracker.
  // El <a> no lleva `download` a propósito: con una respuesta cross-origin ese
  // atributo se ignora, el nombre del archivo lo pone el Content-Disposition
  // que viene firmado dentro de la propia URL.
  async function signedUrl(item, inline) {
    const { data } = await api.get(`/projects/${projectId}/files/${item.id}/signed-url${inline ? '?inline=1' : ''}`)
    return data.url
  }

  async function handleDownload(item) {
    try {
      const a = document.createElement('a')
      a.href = await signedUrl(item)
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch {
      setError('No se pudo descargar el archivo')
    }
  }

  // Descarga en lote: un solo archivo suelto va por handleDownload (URL
  // firmada, sin pasar por el backend de zip); cualquier otra combinación
  // (varios ítems, o al menos una carpeta) arma un .zip en el servidor y lo
  // baja como blob — el ZIP se construye al vuelo, así que no hay objeto en
  // R2 que firmar y sí tiene que pasar por nosotros.
  async function handleBulkDownload(items) {
    if (items.length === 0) return
    if (items.length === 1 && items[0].type !== 'folder') { handleDownload(items[0]); return }
    setDownloadingZip(true); setError('')
    try {
      const res = await api.post(
        `/projects/${projectId}/files/download-zip`,
        { ids: items.map(it => it.id) },
        { responseType: 'blob' }
      )
      const blobUrl = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = items.length === 1 && items[0].type === 'folder' ? `${items[0].name}.zip` : 'archivos.zip'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
    } catch {
      setError('No se pudo descargar el ZIP')
    } finally {
      setDownloadingZip(false)
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

  const selectedItems = [...folders, ...files].filter(it => selectedIds.has(it.id))

  return (
    <div
      className={`space-y-3 rounded-2xl transition-colors ${dragOver ? 'ring-2 ring-primary-400 bg-primary-50/30 dark:bg-primary-900/10' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={e => { if (e.target === e.currentTarget) setDragOver(false) }}
      onDrop={handleDrop}
    >
      <FilesToolbar
        folderId={folderId}
        path={path}
        onNavigate={setFolderId}
        onShowTrash={() => setShowTrash(true)}
        onNewFolder={() => setModal({ type: 'newFolder' })}
        onFilesSelected={fileList => handleFiles(fileList, folderId)}
      />

      <FilesSearchBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortBy={sortBy}
        onSortChange={setSortBy}
        showSort={searchResults === null}
      />

      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          downloading={downloadingZip}
          onDownload={() => handleBulkDownload(selectedItems)}
          onMove={() => setModal({ type: 'bulkMove', items: selectedItems })}
          onDelete={() => setModal({ type: 'bulkDelete', items: selectedItems })}
          onCancel={() => setSelectedIds(new Set())}
        />
      )}

      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

      <UploadQueue queue={queue} onCancel={cancel} />

      {/* Grilla — modo búsqueda (flat, todo el proyecto) o modo carpeta (normal) */}
      {searchResults !== null ? (
        searching && searchResults.length === 0 ? (
          <LoadingSpinner className="py-16" />
        ) : searchResults.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="mb-2"><Icon as={Search} size={28} className="inline-block text-gray-300 dark:text-gray-600" /></p>
            <p>Sin resultados para "{searchQuery}".</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {searchResults.map(item => (
              <ItemCard
                key={`${item.type}-${item.id}`}
                item={item}
                projectId={projectId}
                menuOpen={menuOpenId === item.id}
                onOpenMenu={setMenuOpenId}
                onOpen={openFoundItem}
                onRename={it => setModal({ type: 'rename', item: it })}
                onMove={it => setModal({ type: 'move', item: it })}
                onDelete={it => setModal({ type: 'delete', item: it })}
                onDownload={handleDownload}
                onCopyLink={it => setModal({ type: 'copyLink', item: it })}
                onShare={it => setModal({ type: 'share', item: it })}
                onCreateTask={onCreateTaskFromFile ? it => onCreateTaskFromFile(it, fileDeepLink(projectId, it)) : null}
                onLinkToContent={contenidoEnabled ? it => setModal({ type: 'linkContent', item: it }) : null}
                caption={item.path.length ? `Raíz / ${item.path.map(p => p.name).join(' / ')}` : 'Raíz'}
              />
            ))}
          </div>
        )
      ) : loading ? (
        <LoadingSpinner className="py-16" />
      ) : folders.length === 0 && files.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="mb-2"><Icon as={FolderOpen} size={28} className="inline-block text-gray-300 dark:text-gray-600" /></p>
          <p>Todavía no hay nada acá.</p>
          <p className="text-xs mt-1">Arrastrá archivos a esta ventana o usá "Subir archivos".</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {[...sortItems(folders, sortBy), ...sortItems(files, sortBy)].map(item => (
            <div key={`${item.type}-${item.id}`} className={highlightId === item.id ? 'rounded-xl ring-2 ring-primary-400 animate-pulse' : ''}>
              <ItemCard
                item={item}
                projectId={projectId}
                menuOpen={menuOpenId === item.id}
                onOpenMenu={setMenuOpenId}
                onOpen={openItem}
                onRename={it => setModal({ type: 'rename', item: it })}
                onMove={it => setModal({ type: 'move', item: it })}
                onDelete={it => setModal({ type: 'delete', item: it })}
                onDownload={handleDownload}
                onCopyLink={it => setModal({ type: 'copyLink', item: it })}
                onShare={it => setModal({ type: 'share', item: it })}
                onCreateTask={onCreateTaskFromFile ? it => onCreateTaskFromFile(it, fileDeepLink(projectId, it)) : null}
                onLinkToContent={contenidoEnabled ? it => setModal({ type: 'linkContent', item: it }) : null}
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
      {modal?.type === 'share' && (
        <ShareFolderModal
          projectId={projectId} item={modal.item}
          onClose={() => setModal(null)}
          onChanged={() => reload(folderId)}
        />
      )}
      {modal?.type === 'linkContent' && (
        <ContentFilePiecesModal projectId={projectId} file={modal.item} onClose={() => setModal(null)} />
      )}
      {showTrash && (
        <TrashModal
          projectId={projectId}
          isAdmin={isAdmin}
          onClose={() => setShowTrash(false)}
          onRestored={() => reload(folderId)}
        />
      )}

      <FilePreviewModals
        lightbox={lightbox}
        onCloseLightbox={() => setLightbox(null)}
        preview={preview}
        onClosePreview={closePreview}
      />
    </div>
  )
}
