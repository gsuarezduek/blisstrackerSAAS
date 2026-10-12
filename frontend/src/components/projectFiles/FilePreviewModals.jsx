import LoadingSpinner from '../LoadingSpinner'

// ─── Lightbox de imagen + preview de video/PDF ────────────────────────────────
// El preview se pide como blob autenticado (?inline=1), no un link directo a R2.

export default function FilePreviewModals({ lightbox, onCloseLightbox, preview, onClosePreview }) {
  return (
    <>
      {lightbox && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onCloseLightbox}>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg" />
          <button onClick={onCloseLightbox} className="absolute top-4 right-4 text-white text-3xl leading-none">×</button>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClosePreview}>
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
          <button onClick={onClosePreview} className="absolute top-4 right-4 text-white text-3xl leading-none">×</button>
        </div>
      )}
    </>
  )
}
