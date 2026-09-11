import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'
import { fmtBytes, iconFor } from '../../lib/fileIcons'

/**
 * "📂 Seleccionar archivo del proyecto" — navegador de carpetas del repositorio
 * de Archivos (mismo árbol y endpoints que ProjectFiles.jsx/MoveModal), pero en
 * vez de elegir una carpeta destino para mover algo, clickear un ARCHIVO lo
 * vincula a la pieza (onLink). Queda abierto para poder vincular varios de
 * corrido; los ya vinculados se marcan con ✓ (a partir de `linkedFileIds`, ya
 * conocido por el modal padre — no hace falta pedirle ese estado al backend).
 */
export default function ContentFileBrowserModal({ projectId, linkedFileIds, onLink, onClose }) {
  const [folderId, setFolderId] = useState(null)
  const [path, setPath] = useState([])
  const [folders, setFolders] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [linkingId, setLinkingId] = useState(null)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    const params = folderId ? `?parentId=${folderId}` : ''
    api.get(`/projects/${projectId}/files${params}`)
      .then(({ data }) => { if (active) { setFolders(data.folders); setFiles(data.files); setPath(data.path) } })
      .catch(() => { if (active) setError('No se pudieron cargar los archivos') })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [projectId, folderId])

  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) { setSearchResults(null); setSearching(false); return }
    let active = true
    setSearching(true)
    const t = setTimeout(() => {
      api.get(`/projects/${projectId}/files/search?q=${encodeURIComponent(q)}`)
        .then(({ data }) => { if (active) setSearchResults(data.items.filter(it => it.type === 'file')) })
        .catch(() => { if (active) setSearchResults([]) })
        .finally(() => { if (active) setSearching(false) })
    }, 300)
    return () => { active = false; clearTimeout(t) }
  }, [searchQuery, projectId])

  const handleLink = useCallback(async (file) => {
    setLinkingId(file.id)
    setError('')
    try {
      await onLink(file)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo vincular el archivo')
    } finally {
      setLinkingId(null)
    }
  }, [onLink])

  function FileRow({ file, caption }) {
    const linked = linkedFileIds.has(file.id)
    return (
      <button
        onClick={() => !linked && handleLink(file)}
        disabled={linked || linkingId === file.id}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-left disabled:cursor-default"
      >
        <span className="text-lg shrink-0">{iconFor(file.mimeType)}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-gray-700 dark:text-gray-200 truncate">{file.name}</span>
          <span className="block text-[11px] text-gray-400 dark:text-gray-500 truncate">
            {caption ? `${caption} · ` : ''}{fmtBytes(file.sizeBytes)}
          </span>
        </span>
        {linked ? (
          <span className="text-xs text-primary-600 dark:text-primary-400 shrink-0">✓ Vinculado</span>
        ) : linkingId === file.id ? (
          <span className="text-xs text-gray-400 shrink-0">Vinculando…</span>
        ) : (
          <span className="text-xs text-gray-400 shrink-0">+ Vincular</span>
        )}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 border-b dark:border-gray-700 flex items-center justify-between gap-3 shrink-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white">📂 Seleccionar archivo del proyecto</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none shrink-0">×</button>
        </div>

        <div className="px-5 pt-3 shrink-0">
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍 Buscar en todo el proyecto…"
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {searchResults === null && (
          <div className="px-5 py-2.5 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 flex-wrap border-b dark:border-gray-700 mt-2">
            <button onClick={() => setFolderId(null)} className={`hover:text-primary-600 dark:hover:text-primary-400 ${!folderId ? 'font-semibold text-gray-700 dark:text-gray-200' : ''}`}>🏠 Raíz</button>
            {path.map(p => (
              <span key={p.id} className="flex items-center gap-1">
                <span>/</span>
                <button onClick={() => setFolderId(p.id)} className="hover:text-primary-600 dark:hover:text-primary-400">{p.name}</button>
              </span>
            ))}
          </div>
        )}

        <div className="overflow-y-auto px-3 py-2 flex-1 min-h-[220px]">
          {error && <p className="px-2 pb-2 text-xs text-red-500 dark:text-red-400">{error}</p>}

          {searchResults !== null ? (
            searching && searchResults.length === 0 ? (
              <LoadingSpinner className="py-8" />
            ) : searchResults.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">Sin resultados.</p>
            ) : (
              <div className="space-y-0.5">
                {searchResults.map(f => (
                  <FileRow key={f.id} file={f} caption={f.path.length ? `🏠 / ${f.path.map(p => p.name).join(' / ')}` : '🏠 Raíz'} />
                ))}
              </div>
            )
          ) : loading ? (
            <LoadingSpinner className="py-8" />
          ) : folders.length === 0 && files.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">No hay nada acá.</p>
          ) : (
            <div className="space-y-0.5">
              {folders.map(f => (
                <button
                  key={f.id} onClick={() => setFolderId(f.id)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-left text-gray-700 dark:text-gray-200"
                >
                  <span>📁</span><span className="truncate">{f.name}</span>
                </button>
              ))}
              {files.map(f => <FileRow key={f.id} file={f} />)}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t dark:border-gray-700 flex justify-end shrink-0">
          <button onClick={onClose} className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Cerrar</button>
        </div>
      </div>
    </div>
  )
}
