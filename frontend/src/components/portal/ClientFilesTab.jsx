import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import LoadingSpinner from '../LoadingSpinner'
import { fmtBytes, iconFor } from '../../lib/fileIcons'

const API = import.meta.env.VITE_API_URL || ''

// Pestaña "Archivos" del portal de cliente — mismo repositorio (ProjectFile)
// que ve el equipo interno (components/ProjectFiles.jsx), pero de SOLO
// LECTURA: sin crear carpetas, subir, renombrar, mover, borrar ni papelera.
// Reusa los mismos tres endpoints de solo lectura (list/search/download) pero
// vía el namespace público del portal (clientPortalFiles.controller.js), con
// el JWT del portal en vez del JWT de equipo.

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

function ItemCard({ item, onOpen }) {
  const isFolder = item.type === 'folder'
  const isImage = !isFolder && item.mimeType?.startsWith('image/')
  return (
    <button
      onClick={() => onOpen(item)}
      className="w-full flex flex-col items-center gap-1.5 p-3 rounded-xl border border-gray-200 bg-white hover:border-primary-300 hover:bg-gray-50 transition-colors text-center"
      title={item.name}
    >
      <div className="w-14 h-14 flex items-center justify-center rounded-lg bg-gray-50 overflow-hidden">
        {isImage && item.url ? (
          <img src={item.url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl">{isFolder ? '📁' : iconFor(item.mimeType)}</span>
        )}
      </div>
      <span className="text-xs text-gray-700 truncate w-full">{item.name}</span>
      {!isFolder && <span className="text-[10px] text-gray-400">{fmtBytes(item.sizeBytes)}</span>}
      <span className="text-[10px] text-gray-400 truncate w-full">
        {item.uploadedBy ? `${item.uploadedBy.name} · ${fmtDate(item.createdAt)}` : fmtDate(item.createdAt)}
      </span>
    </button>
  )
}

export default function ClientFilesTab({ slug, token, requireReauth }) {
  const [folderId, setFolderId] = useState(null)
  const [path, setPath]         = useState([])
  const [folders, setFolders]   = useState([])
  const [files, setFiles]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [lightbox, setLightbox] = useState(null)
  const [preview, setPreview]   = useState(null) // null | { item, status:'loading'|'ready'|'error', blobUrl }
  const [searchQuery, setSearchQuery]     = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searching, setSearching]         = useState(false)

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } }

  const reload = useCallback((fid) => {
    setLoading(true)
    setError('')
    const params = fid ? `?parentId=${fid}` : ''
    axios.get(`${API}/api/public/client-portal/${slug}/files${params}`, authHeaders)
      .then(r => { setFolders(r.data.folders); setFiles(r.data.files); setPath(r.data.path) })
      .catch(err => {
        if (err.response?.status === 401) requireReauth()
        else setError(err.response?.data?.error || 'No se pudieron cargar los archivos')
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token])

  useEffect(() => { reload(folderId) }, [folderId, reload])

  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) { setSearchResults(null); setSearching(false); return }
    let active = true
    setSearching(true)
    const t = setTimeout(() => {
      axios.get(`${API}/api/public/client-portal/${slug}/files/search?q=${encodeURIComponent(q)}`, authHeaders)
        .then(r => { if (active) setSearchResults(r.data.items) })
        .catch(err => {
          if (!active) return
          if (err.response?.status === 401) requireReauth()
          setSearchResults([])
        })
        .finally(() => { if (active) setSearching(false) })
    }, 300)
    return () => { active = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, slug, token])

  function downloadUrl(item, inline) {
    return `${API}/api/public/client-portal/${slug}/files/${item.id}/download${inline ? '?inline=1' : ''}`
  }

  async function handleDownload(item) {
    try {
      const res = await axios.get(downloadUrl(item), { ...authHeaders, responseType: 'blob' })
      const blobUrl = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = item.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      if (err.response?.status === 401) requireReauth()
      else setError('No se pudo descargar el archivo')
    }
  }

  function openPdfInNewTab(item) {
    const win = window.open('', '_blank')
    ;(async () => {
      try {
        const res = await axios.get(downloadUrl(item, true), { ...authHeaders, responseType: 'blob' })
        const blobUrl = URL.createObjectURL(res.data)
        if (win) win.location.href = blobUrl
        else openPreview(item, blobUrl)
      } catch (err) {
        if (win) win.close()
        if (err.response?.status === 401) requireReauth()
        else setError('No se pudo cargar la vista previa del PDF')
      }
    })()
  }

  async function openPreview(item, preloadedBlobUrl) {
    if (preloadedBlobUrl) { setPreview({ item, status: 'ready', blobUrl: preloadedBlobUrl }); return }
    setPreview({ item, status: 'loading', blobUrl: null })
    try {
      const res = await axios.get(downloadUrl(item, true), { ...authHeaders, responseType: 'blob' })
      setPreview({ item, status: 'ready', blobUrl: URL.createObjectURL(res.data) })
    } catch (err) {
      if (err.response?.status === 401) requireReauth()
      setPreview({ item, status: 'error', blobUrl: null })
    }
  }

  function closePreview() {
    if (preview?.blobUrl) URL.revokeObjectURL(preview.blobUrl)
    setPreview(null)
  }

  function openItem(item) {
    if (item.type === 'folder') { setFolderId(item.id); return }
    const isImage = item.mimeType?.startsWith('image/')
    if (isImage && item.url) { setLightbox(item.url); return }
    if (item.mimeType === 'application/pdf') { openPdfInNewTab(item); return }
    if (item.previewable) { openPreview(item); return }
    handleDownload(item)
  }

  function openFoundItem(item) {
    setSearchQuery('')
    if (item.type === 'folder') { setFolderId(item.id); return }
    const parentId = item.path.length ? item.path[item.path.length - 1].id : null
    setFolderId(parentId)
    openItem(item)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-gray-500 flex items-center gap-1 flex-wrap min-w-0">
          <button onClick={() => setFolderId(null)} className={`hover:text-primary-600 ${!folderId ? 'font-semibold text-gray-800' : ''}`}>
            🏠 Raíz
          </button>
          {path.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1 min-w-0">
              <span>/</span>
              <button onClick={() => setFolderId(p.id)} className={`truncate hover:text-primary-600 ${i === path.length - 1 ? 'font-semibold text-gray-800' : ''}`}>
                {p.name}
              </button>
            </span>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <input
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍 Buscar en todo el proyecto…"
            className="w-full border border-gray-300 rounded-lg pl-3 pr-7 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">✕</button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

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
            {searchResults.map(item => <ItemCard key={`${item.type}-${item.id}`} item={item} onOpen={openFoundItem} />)}
          </div>
        )
      ) : loading ? (
        <LoadingSpinner className="py-16" />
      ) : folders.length === 0 && files.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-2">🗂️</p>
          <p>Todavía no hay archivos acá.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {[...folders, ...files].map(item => (
            <ItemCard key={`${item.type}-${item.id}`} item={item} onOpen={openItem} />
          ))}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg" />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white text-3xl leading-none">×</button>
        </div>
      )}

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
