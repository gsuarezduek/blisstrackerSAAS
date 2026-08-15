import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../api/client'
import ConfirmModal from '../ConfirmModal'
import ContentStatusBadge from './ContentStatusBadge'
import ContentNetworkChips from './ContentNetworkChips'
import ContentHistoryList from './ContentHistoryList'
import ContentAssetGallery from './ContentAssetGallery'
import ContentAssetUploader from './ContentAssetUploader'
import ContentCommentThread from './ContentCommentThread'
import { useContentHistory, useContentComments } from './useContentPieces'
import useContentSocket from './useContentSocket'
import { CONTENT_STATUSES, CONTENT_TYPES, CONTENT_NETWORKS } from './contentCatalog'
import { toLocalInput } from './dateHelpers'

const LABEL = 'text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block'
const INPUT = 'w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 disabled:opacity-60 disabled:cursor-not-allowed'
const TABS  = [
  { id: 'detalles',    label: 'Detalles' },
  { id: 'comentarios', label: 'Comentarios' },
  { id: 'historial',   label: 'Historial' },
]

// Debounce genérico para inputs de texto libre: evita mandar un PATCH por tecla.
function useDebouncedCommit(value, onCommit, delay = 600) {
  const [draft, setDraft] = useState(value)
  const first = useRef(true)

  useEffect(() => { setDraft(value) }, [value])

  useEffect(() => {
    if (first.current) { first.current = false; return }
    const t = setTimeout(() => { if (draft !== value) onCommit(draft) }, delay)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  return [draft, setDraft]
}

/**
 * Detalle de una pieza. Recibe el objeto `piece` ya cargado (viene de la lista
 * en memoria, no se refetchea) — las mutaciones de campos pasan por `onUpdate`,
 * que ya trae optimismo + reconciliación con la respuesta del servidor.
 *
 * Los assets (imagen/video) van por sus propios endpoints (`/assets/*`, fuera
 * del PATCH general de la pieza) — por eso cualquier cambio ahí llama a
 * `onPieceChanged` (recarga la lista completa del hook) en vez de hacer
 * optimismo local: es la única forma de que la pieza en memoria refleje el
 * asset nuevo/borrado/reordenado sin duplicar la lógica de fetch acá.
 *
 * El tab "Comentarios" es el hilo interno del equipo (visibility: 'internal').
 * El hilo con el cliente ('client') llega en F7, cuando el portal pueda
 * escribirlo — ContentCommentThread ya está armado para reusarse ahí.
 */
export default function ContentPieceModal({ piece, members = [], canEdit, currentUserId, isAdmin, onUpdate, onDelete, onPieceChanged, onClose }) {
  const [tab, setTab] = useState('detalles')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [activeAssetId, setActiveAssetId] = useState(null)

  const { events, loading: historyLoading, error: historyError } = useContentHistory(piece.projectId, piece.id)
  const { comments, addComment, removeComment, applyRemoteAdd, applyRemoteDelete } = useContentComments(piece.projectId, piece.id)

  // El socket viaja por proyecto (no hay room por pieza) — acá se filtra por
  // pieceId antes de tocar el estado del hilo, para no mezclar comentarios de
  // otra pieza del mismo proyecto mientras este modal está abierto.
  useContentSocket(piece.projectId, {
    onCommentNew:     (pieceId, comment) => { if (pieceId === piece.id) applyRemoteAdd(comment) },
    onCommentDeleted: (pieceId, id)      => { if (pieceId === piece.id) applyRemoteDelete(id) },
  })

  useEffect(() => {
    if (piece.assets.length && !piece.assets.some(a => a.id === activeAssetId)) {
      setActiveAssetId(piece.assets[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece.assets])

  const activeAsset = piece.assets.find(a => a.id === activeAssetId) ?? null

  const handleAssetUploaded = useCallback(() => { onPieceChanged() }, [onPieceChanged])

  const handleReorderAsset = useCallback(async (assetId, order) => {
    await api.patch(`/contenido/projects/${piece.projectId}/pieces/${piece.id}/assets/${assetId}`, { order })
    onPieceChanged()
  }, [piece.projectId, piece.id, onPieceChanged])

  const handleDeleteAsset = useCallback(async (assetId) => {
    await api.delete(`/contenido/projects/${piece.projectId}/pieces/${piece.id}/assets/${assetId}`)
    onPieceChanged()
  }, [piece.projectId, piece.id, onPieceChanged])

  const [sendingToDashboard, setSendingToDashboard] = useState(false)
  const [dashboardError, setDashboardError] = useState(null)
  async function handleSendToDashboard() {
    setSendingToDashboard(true)
    setDashboardError(null)
    try {
      await api.post(`/contenido/projects/${piece.projectId}/pieces/${piece.id}/send-to-dashboard`)
      onPieceChanged()
    } catch (err) {
      setDashboardError(err.response?.data?.error || 'No se pudo enviar al dashboard')
    } finally {
      setSendingToDashboard(false)
    }
  }

  const [title, setTitle] = useDebouncedCommit(piece.title, t => {
    const clean = t.trim()
    if (clean && clean !== piece.title) onUpdate(piece.id, { title: clean })
  })
  const [copy, setCopy] = useDebouncedCommit(piece.copy ?? '', v => onUpdate(piece.id, { copy: v || null }))
  const [hashtags, setHashtags] = useDebouncedCommit(piece.hashtags ?? '', v => onUpdate(piece.id, { hashtags: v || null }))
  const [internalNotes, setInternalNotes] = useDebouncedCommit(piece.internalNotes ?? '', v => onUpdate(piece.id, { internalNotes: v || null }))

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggleNetwork(key) {
    const next = piece.networks.includes(key)
      ? piece.networks.filter(n => n !== key)
      : [...piece.networks, key]
    onUpdate(piece.id, { networks: next })
  }

  async function handleConfirmDelete() {
    setDeleting(true)
    try {
      await onDelete(piece.id)
      onClose()
    } catch { /* el error queda expuesto arriba, en la página */ } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <div className="flex-1 min-w-0">
            {canEdit ? (
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full text-lg font-bold text-gray-900 dark:text-white bg-transparent border-none p-0 focus:ring-0 focus:outline-none"
              />
            ) : (
              <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{piece.title}</h2>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <ContentStatusBadge status={piece.status} />
              <ContentNetworkChips networks={piece.networks} />
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canEdit && (
              <button
                onClick={() => setConfirmDelete(true)}
                title="Eliminar pieza"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                🗑
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
            >
              {t.label}
              {t.id === 'comentarios' && comments.length > 0 && (
                <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">{comments.filter(c => c.visibility === 'internal').length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'detalles' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
              {/* Visor + galería + uploader */}
              <div className="sm:col-span-2 space-y-2">
                {activeAsset ? (
                  <div className="aspect-video rounded-xl bg-black/90 overflow-hidden flex items-center justify-center">
                    {activeAsset.kind === 'video' ? (
                      <video
                        key={activeAsset.id}
                        src={activeAsset.url}
                        controls
                        preload="metadata"
                        poster={activeAsset.posterUrl || undefined}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <img src={activeAsset.url} alt="" className="w-full h-full object-contain" />
                    )}
                  </div>
                ) : !canEdit ? (
                  <div className="aspect-video rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center">
                    <span className="text-sm text-gray-400 dark:text-gray-500">Sin archivos</span>
                  </div>
                ) : null}

                <ContentAssetGallery
                  assets={piece.assets}
                  activeId={activeAssetId}
                  onSelectActive={setActiveAssetId}
                  onReorder={handleReorderAsset}
                  onDelete={handleDeleteAsset}
                  canEdit={canEdit}
                />

                {canEdit && (
                  <ContentAssetUploader projectId={piece.projectId} pieceId={piece.id} onUploaded={handleAssetUploaded} />
                )}
              </div>

              <div>
                <label className={LABEL}>Estado</label>
                <select
                  value={piece.status}
                  onChange={e => onUpdate(piece.id, { status: e.target.value })}
                  disabled={!canEdit}
                  className={INPUT}
                >
                  {CONTENT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>

              <div>
                <label className={LABEL}>Tipo</label>
                <select
                  value={piece.type}
                  onChange={e => onUpdate(piece.id, { type: e.target.value })}
                  disabled={!canEdit}
                  className={INPUT}
                >
                  {CONTENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>

              <div>
                <label className={LABEL}>Fecha de publicación</label>
                <input
                  type="datetime-local"
                  value={toLocalInput(piece.scheduledAt)}
                  onChange={e => onUpdate(piece.id, { scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  disabled={!canEdit}
                  className={INPUT}
                />
              </div>

              <div>
                <label className={LABEL}>Responsable</label>
                <select
                  value={piece.owner?.id ?? ''}
                  onChange={e => onUpdate(piece.id, { ownerId: e.target.value || null })}
                  disabled={!canEdit}
                  className={INPUT}
                >
                  <option value="">Sin asignar</option>
                  <optgroup label="Equipo del proyecto">
                    {members.filter(m => m.inTeam).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </optgroup>
                  <optgroup label="Otros del workspace">
                    {members.filter(m => !m.inTeam).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </optgroup>
                </select>
              </div>

              {canEdit && (
                <div className="sm:col-span-2 flex items-center gap-2 flex-wrap">
                  {piece.taskId ? (
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      piece.task?.status === 'COMPLETED'
                        ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                      {piece.task?.status === 'COMPLETED' ? '✅ Tarea completada' : '⏳ En el dashboard de ' + (piece.owner?.name ?? '—')}
                    </span>
                  ) : (
                    <button
                      onClick={handleSendToDashboard}
                      disabled={sendingToDashboard || !piece.owner}
                      title={!piece.owner ? 'Asigná un responsable primero' : undefined}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {sendingToDashboard ? 'Enviando…' : '→ Enviar al dashboard'}
                    </button>
                  )}
                  {dashboardError && <span className="text-xs text-red-600 dark:text-red-400">{dashboardError}</span>}
                </div>
              )}

              <div className="sm:col-span-2">
                <label className={LABEL}>Redes</label>
                <div className="flex flex-wrap gap-1.5">
                  {CONTENT_NETWORKS.map(n => (
                    <button
                      key={n.key}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => toggleNetwork(n.key)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors disabled:cursor-not-allowed ${
                        piece.networks.includes(n.key)
                          ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-400'
                          : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'}`}
                    >
                      {n.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className={LABEL}>Copy</label>
                <textarea
                  value={copy}
                  onChange={e => setCopy(e.target.value)}
                  disabled={!canEdit}
                  rows={4}
                  placeholder="Texto del posteo…"
                  className={`${INPUT} resize-y`}
                />
              </div>

              <div className="sm:col-span-2">
                <label className={LABEL}>Hashtags</label>
                <input
                  value={hashtags}
                  onChange={e => setHashtags(e.target.value)}
                  disabled={!canEdit}
                  placeholder="#marca #lanzamiento"
                  className={INPUT}
                />
              </div>

              <div className="sm:col-span-2">
                <label className={LABEL}>Notas internas <span className="italic text-gray-400">(el cliente nunca las ve)</span></label>
                <textarea
                  value={internalNotes}
                  onChange={e => setInternalNotes(e.target.value)}
                  disabled={!canEdit}
                  rows={3}
                  className={`${INPUT} resize-y`}
                />
              </div>
            </div>
          )}

          {tab === 'comentarios' && (
            <ContentCommentThread
              comments={comments}
              visibility="internal"
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              members={members}
              canPost={canEdit}
              onSubmit={addComment}
              onDelete={removeComment}
              emptyLabel="Sin comentarios internos todavía."
            />
          )}

          {tab === 'historial' && (
            <ContentHistoryList events={events} loading={historyLoading} error={historyError} />
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmDelete}
        title="Eliminar pieza"
        message={`Se va a eliminar «${piece.title}» y todo su historial. Esta acción no se puede deshacer.`}
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
