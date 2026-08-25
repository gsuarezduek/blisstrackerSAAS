import { useState, useMemo } from 'react'
import axios from 'axios'
import { statusBadgeClass, networkLabel } from '../contenido/contentCatalog'
import { linkify } from '../../utils/linkify'
import { findDriveEmbeds, driveEmbedUrl } from '../../utils/driveEmbed'

const API = import.meta.env.VITE_API_URL || ''

function formatDate(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

// 401 en cualquier fetch del portal = token vencido/revocado (o un token
// legacy sin contactId que pega a un endpoint que sí lo exige). En ambos
// casos el mismo tratamiento: volver al formulario de login.
function isAuthError(err) {
  return err.response?.status === 401 || err.response?.data?.code === 'CONTACT_REQUIRED'
}

/**
 * Una pieza del portal, colapsable. Colapsada muestra thumbnail + título +
 * estado + fecha; expandida trae el detalle completo (assets grandes +
 * comentarios) con GET .../content/:pid — la lista general no trae comentarios
 * para no pagar un N+1 en cada carga del tab.
 *
 * `onChanged(piece)` avisa al padre (ClientContentTab) cuando aprobar/pedir
 * cambios devuelve la pieza actualizada, para que la reordene entre "Esperando
 * tu aprobación" y "Resto del contenido" sin recargar todo el listado.
 */
export default function ClientPieceCard({ slug, token, requireReauth, piece, brandPrimary, onChanged, defaultOpen = false }) {
  const [expanded, setExpanded] = useState(defaultOpen)
  const [detail,   setDetail]   = useState(null) // { piece, comments } — cargado al expandir
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError,   setDetailError]   = useState(null)

  const [commentBody, setCommentBody] = useState('')
  const [posting, setPosting] = useState(false)

  const [activeAssetId, setActiveAssetId] = useState(null)

  const [decidingMode,    setDecidingMode]    = useState(null) // null | 'approve' | 'changes'
  const [decisionComment, setDecisionComment] = useState('')
  const [deciding,        setDeciding]        = useState(false)
  const [decisionError,   setDecisionError]   = useState(null)

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } }
  const base = `${API}/api/public/client-portal/${slug}/content/${piece.id}`

  function loadDetail() {
    setDetailLoading(true)
    setDetailError(null)
    axios.get(base, authHeaders)
      .then(r => setDetail(r.data))
      .catch(err => {
        if (isAuthError(err)) requireReauth()
        else setDetailError(err.response?.data?.error || 'No se pudo cargar el detalle')
      })
      .finally(() => setDetailLoading(false))
  }

  function toggleExpand() {
    const next = !expanded
    setExpanded(next)
    if (next && !detail && !detailLoading) loadDetail()
  }

  async function handlePostComment(e) {
    e.preventDefault()
    const body = commentBody.trim()
    if (!body || posting) return
    setPosting(true)
    try {
      const r = await axios.post(`${base}/comments`, { body }, authHeaders)
      setDetail(prev => (prev ? { ...prev, comments: [...prev.comments, r.data] } : prev))
      setCommentBody('')
    } catch (err) {
      if (isAuthError(err)) requireReauth()
    } finally { setPosting(false) }
  }

  async function submitDecision(action) {
    if (action === 'changes' && !decisionComment.trim()) {
      setDecisionError('Contanos qué cambios necesitás')
      return
    }
    setDeciding(true); setDecisionError(null)
    try {
      const payload = action === 'approve'
        ? (decisionComment.trim() ? { comment: decisionComment.trim() } : {})
        : { comment: decisionComment.trim() }
      const r = await axios.post(`${base}/${action === 'approve' ? 'approve' : 'request-changes'}`, payload, authHeaders)
      onChanged?.(r.data)
      setDetail(prev => (prev ? { ...prev, piece: r.data } : prev))
      setDecidingMode(null)
      setDecisionComment('')
    } catch (err) {
      if (isAuthError(err)) requireReauth()
      else setDecisionError(err.response?.data?.error || 'No se pudo enviar')
    } finally { setDeciding(false) }
  }

  const assets = piece.assets || []
  const firstAsset = assets[0] || null
  const activeAsset = assets.find(a => a.id === activeAssetId) || firstAsset
  const detailPiece = detail?.piece || piece
  const driveEmbeds = useMemo(() => findDriveEmbeds(detailPiece.copy), [detailPiece.copy])
  const activeAssetDrive = useMemo(() => (
    activeAsset?.kind === 'link' ? (findDriveEmbeds(activeAsset.url)[0] || null) : null
  ), [activeAsset])

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
      piece.canDecide ? 'border-amber-300' : 'border-gray-200'}`}
    >
      <button onClick={toggleExpand} className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors">
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center text-xl">
          {firstAsset ? (
            firstAsset.kind === 'video'
              ? (firstAsset.posterUrl ? <img src={firstAsset.posterUrl} className="w-full h-full object-cover" alt="" /> : '🎬')
              : firstAsset.kind === 'link'
                ? '🔗'
                : <img src={firstAsset.url} className="w-full h-full object-cover" alt="" />
          ) : '📄'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{piece.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusBadgeClass(piece.status)}`}>{piece.statusLabel}</span>
            {piece.scheduledDate && <span className="text-xs text-gray-400">{formatDate(piece.scheduledDate)}</span>}
            {(piece.networks || []).slice(0, 3).map(n => (
              <span key={n} className="text-[10px] text-gray-400">{networkLabel(n)}</span>
            ))}
          </div>
        </div>
        <span className="text-gray-400 text-sm shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100">
          {detailLoading && <p className="text-sm text-gray-400 py-3">Cargando…</p>}
          {detailError && <p className="text-sm text-red-600 py-3">{detailError}</p>}

          {!detailLoading && !detailError && (
            <>
              {activeAsset && (
                <div className="rounded-lg overflow-hidden bg-black mt-3 flex items-center justify-center" style={{ maxHeight: 420 }}>
                  {activeAsset.kind === 'video' ? (
                    <video src={activeAsset.url} poster={activeAsset.posterUrl || undefined} controls className="max-h-[420px] w-auto max-w-full" />
                  ) : activeAsset.kind === 'link' ? (
                    activeAssetDrive ? (
                      <iframe
                        src={driveEmbedUrl(activeAssetDrive)}
                        className="w-full"
                        style={{ border: 0, height: 420 }}
                        allow="autoplay"
                        loading="lazy"
                        title="Google Drive"
                      />
                    ) : (
                      <a
                        href={activeAsset.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col items-center gap-2 text-gray-300 hover:text-white transition-colors px-4 py-8 text-center"
                      >
                        <span className="text-4xl">🔗</span>
                        <span className="text-sm break-all">{activeAsset.fileName || activeAsset.url}</span>
                      </a>
                    )
                  ) : (
                    <img src={activeAsset.url} alt="" className="max-h-[420px] w-auto max-w-full object-contain" />
                  )}
                </div>
              )}
              {assets.length > 1 && (
                <div className="flex gap-2 mt-2 overflow-x-auto">
                  {assets.map(a => (
                    <button
                      key={a.id}
                      onClick={() => setActiveAssetId(a.id)}
                      className={`w-12 h-12 rounded-lg overflow-hidden border-2 shrink-0 flex items-center justify-center bg-gray-100 text-lg ${
                        a.id === (activeAsset?.id) ? 'border-primary-500' : 'border-transparent'}`}
                    >
                      {a.kind === 'link' ? '🔗' : (
                        <img src={a.kind === 'video' ? (a.posterUrl || a.url) : a.url} alt="" className="w-full h-full object-cover" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {piece.copy && <p className="text-sm text-gray-700 whitespace-pre-wrap break-words mt-3">{linkify(piece.copy)}</p>}
              {piece.hashtags && <p className="text-xs text-primary-600 mt-1.5">{piece.hashtags}</p>}

              {driveEmbeds.map(d => (
                <div
                  key={d.id}
                  className="mt-3 rounded-lg overflow-hidden border border-gray-200"
                  style={{ height: d.type === 'folder' ? 220 : 320 }}
                >
                  <iframe
                    src={driveEmbedUrl(d)}
                    className="w-full h-full"
                    style={{ border: 0 }}
                    allow="autoplay"
                    loading="lazy"
                    title="Google Drive"
                  />
                </div>
              ))}

              {(detailPiece.createdBy || detailPiece.owner || detailPiece.approvedBy) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
                  {detailPiece.createdBy && (
                    <span>📝 Creado por <span className="font-medium text-gray-700">{detailPiece.createdBy.name}</span></span>
                  )}
                  {detailPiece.owner && (
                    <span>🎨 Diseñado por <span className="font-medium text-gray-700">{detailPiece.owner.name}</span></span>
                  )}
                  {detailPiece.approvedBy && (
                    <span className="text-green-700">✅ Aprobado por <span className="font-medium">{detailPiece.approvedBy.name}</span></span>
                  )}
                </div>
              )}

              {piece.canDecide && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  {decidingMode === null ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDecidingMode('approve')}
                        className="flex-1 px-3 py-2 text-sm font-semibold rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
                      >
                        ✅ Aprobar
                      </button>
                      <button
                        onClick={() => setDecidingMode('changes')}
                        className="flex-1 px-3 py-2 text-sm font-semibold rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
                      >
                        ✏️ Pedir cambios
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <textarea
                        value={decisionComment}
                        onChange={e => setDecisionComment(e.target.value)}
                        placeholder={decidingMode === 'approve' ? 'Comentario opcional…' : 'Contanos qué cambios necesitás…'}
                        rows={3}
                        autoFocus
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                      />
                      {decisionError && <p className="text-xs text-red-600">{decisionError}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={() => submitDecision(decidingMode)}
                          disabled={deciding}
                          className={`flex-1 px-3 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50 transition-colors ${
                            decidingMode === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                        >
                          {deciding ? 'Enviando…' : decidingMode === 'approve' ? 'Confirmar aprobación' : 'Enviar pedido de cambios'}
                        </button>
                        <button
                          onClick={() => { setDecidingMode(null); setDecisionComment(''); setDecisionError(null) }}
                          className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {detail && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-2">Mensajes</p>
                  <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                    {detail.comments.length === 0 ? (
                      <p className="text-xs text-gray-400">Sin mensajes todavía.</p>
                    ) : detail.comments.map(c => (
                      <div key={c.id} className={`text-sm px-3 py-2 rounded-lg ${c.author.isTeam ? 'bg-gray-50 text-gray-700' : 'bg-primary-50 text-primary-800'}`}>
                        <p className="text-[11px] font-semibold mb-0.5 opacity-70">{c.author.isTeam ? c.author.name : (c.author.name || 'Vos')}</p>
                        <p className="whitespace-pre-wrap">{c.body}</p>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handlePostComment} className="flex gap-2">
                    <input
                      value={commentBody}
                      onChange={e => setCommentBody(e.target.value)}
                      placeholder="Escribí un mensaje…"
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                    />
                    <button
                      type="submit"
                      disabled={posting || !commentBody.trim()}
                      className="px-3 py-1.5 text-sm font-semibold rounded-lg text-white disabled:opacity-40 transition-colors"
                      style={{ backgroundColor: brandPrimary }}
                    >
                      Enviar
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
