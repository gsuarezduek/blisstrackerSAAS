import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import LoadingSpinner from '../components/LoadingSpinner'
import { fmtBytes, iconFor } from '../lib/fileIcons'
import { FileX, Play } from 'lucide-react'
import { Icon } from '../components/ui/Icon'

const API = import.meta.env.VITE_API_URL || ''

// Vista pública de solo lectura de UN archivo compartido por link (generado
// desde ProjectFiles.jsx → menú ⋯ de un archivo → "Compartir"). Sin auth, sin
// JWT — mismo criterio que SharedFolderPublic/ProposalPublic/ReportPublic:
// todo lo que necesita viaja en la respuesta de /api/public/shared-file/:token.
// A diferencia de SharedFolderPublic no hay navegación/breadcrumb/buscador —
// el token identifica un único archivo, nada más del proyecto es alcanzable.

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

export default function SharedFilePublic() {
  const { token } = useParams()
  const [file, setFile] = useState(null)
  const [projectName, setProjectName] = useState('')
  const [workspace, setWorkspace] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null) // null | { status:'loading'|'ready'|'error', src }

  useEffect(() => {
    window.scrollTo(0, 0)
    axios.get(`${API}/api/public/shared-file/${token}`)
      .then(r => { setFile(r.data.file); setProjectName(r.data.projectName); setWorkspace(r.data.workspace) })
      .catch(err => {
        if (err.response?.status === 404) setNotFound(true)
        else setError(err.response?.data?.error || 'No se pudo cargar el archivo')
      })
      .finally(() => setLoading(false))
  }, [token])

  // URL firmada de R2 de vida corta: la descarga la hace el navegador y el
  // <video> habla directo con R2 (que sirve `Range`), en vez de traer el
  // archivo completo por XHR como blob. Mismo cambio y mismo motivo que en la
  // Nube del equipo (ProjectFiles.jsx). El backend niega `inline` para tipos
  // que el navegador podría ejecutar, igual que hacía el download proxied.
  async function signedUrl(inline) {
    const { data } = await axios.get(
      `${API}/api/public/shared-file/${token}/signed-url${inline ? '?inline=1' : ''}`,
    )
    return data.url
  }

  // El <a> no lleva `download`: cross-origin ese atributo se ignora, el nombre
  // lo pone el Content-Disposition que viaja firmado en la propia URL.
  async function handleDownload() {
    try {
      const a = document.createElement('a')
      a.href = await signedUrl()
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch {
      setError('No se pudo descargar el archivo')
    }
  }

  // PDF se abre en pestaña nueva (más confiable entre navegadores que un
  // <iframe> embebido), con el mismo fallback inline si el popup se bloquea
  // — mismo criterio que ProjectFiles.jsx/SharedFolderPublic.jsx. Ahora va por
  // URL firmada, que además le saca a Safari/iOS el problema del PDF-blob.
  function openPdfInNewTab() {
    const win = window.open('', '_blank')
    ;(async () => {
      try {
        const url = await signedUrl(true)
        if (win) win.location.href = url
        else openPreview(url)
      } catch {
        if (win) win.close()
        setError('No se pudo cargar la vista previa del PDF')
      }
    })()
  }

  async function openPreview(preloadedSrc) {
    if (preloadedSrc) { setPreview({ status: 'ready', src: preloadedSrc }); return }
    setPreview({ status: 'loading', src: null })
    try {
      setPreview({ status: 'ready', src: await signedUrl(true) })
    } catch {
      setPreview({ status: 'error', src: null })
    }
  }

  // Ya no hay blob URLs que liberar: todo el preview va por URL firmada.
  function closePreview() {
    setPreview(null)
  }

  const isImage = file?.mimeType?.startsWith('image/')
  const isPdf = file?.mimeType === 'application/pdf'
  const isVideo = file?.mimeType?.startsWith('video/')
  // `posterUrl` es la miniatura liviana que se generó al subir; un archivo
  // subido antes de que existieran cae al original (imagen) o al ícono.
  const thumbUrl = file ? (file.posterUrl || (isImage ? file.url : null)) : null

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="mb-4"><Icon as={FileX} size={32} className="inline-block text-gray-300" /></p>
          <p className="text-lg font-semibold text-gray-800 mb-2">Este link no está disponible</p>
          <p className="text-sm text-gray-500">Puede haber sido desactivado, o el archivo ya no existe.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {loading ? (
          <LoadingSpinner className="py-16" />
        ) : file && (
          <>
            <div className="mb-6 pb-4 border-b-[3px] border-primary-500">
              {(workspace?.name || projectName) && (
                <p className="text-xs text-gray-400">{workspace?.name}{projectName ? ` · ${projectName}` : ''}</p>
              )}
              <h1 className="text-xl font-bold text-gray-900 break-all">{file.name}</h1>
            </div>

            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

            <div className="rounded-xl border border-gray-200 bg-white p-5 flex items-center gap-4">
              <div className="w-16 h-16 flex items-center justify-center rounded-lg bg-gray-50 overflow-hidden shrink-0">
                {thumbUrl ? (
                  <div className="relative w-full h-full">
                    <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                    {isVideo && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                        <Icon as={Play} size={20} className="text-white drop-shadow" />
                      </span>
                    )}
                  </div>
                ) : (
                  <Icon as={iconFor(file.mimeType)} size={32} className="text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-500">{fmtBytes(file.sizeBytes)}</p>
                <p className="text-xs text-gray-400">
                  {file.uploadedBy ? `${file.uploadedBy.name} · ${fmtDate(file.createdAt)}` : fmtDate(file.createdAt)}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {file.previewable && (
                  <button
                    onClick={() => { if (isImage) window.open(file.url, '_blank'); else if (isPdf) openPdfInNewTab(); else openPreview() }}
                    className="text-sm px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
                  >
                    Ver
                  </button>
                )}
                <button onClick={handleDownload} className="text-sm px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium">
                  Descargar
                </button>
              </div>
            </div>
          </>
        )}

        <p className="mt-10 text-center text-[11px] text-gray-400">Compartido con BlissTracker</p>
      </div>

      {preview && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={closePreview}>
          <div className="w-full max-w-4xl max-h-[85vh] flex items-center justify-center" onClick={e => e.stopPropagation()}>
            {preview.status === 'loading' && <LoadingSpinner size="lg" />}
            {preview.status === 'error' && <p className="text-white text-sm">No se pudo cargar la vista previa.</p>}
            {preview.status === 'ready' && isVideo && (
              <video src={preview.src} controls autoPlay playsInline className="max-w-full max-h-[85vh] rounded-lg" />
            )}
            {preview.status === 'ready' && isPdf && (
              <iframe src={preview.src} title={file.name} className="w-full h-[85vh] bg-white rounded-lg" />
            )}
          </div>
          <button onClick={closePreview} className="absolute top-4 right-4 text-white text-3xl leading-none">×</button>
        </div>
      )}
    </div>
  )
}
