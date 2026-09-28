import { useState, useEffect, useMemo, useRef } from 'react'
import axios from 'axios'
import { networkLabel, statusMeta } from '../contenido/contentCatalog'
import { linkify } from '../../utils/linkify'
import { findDriveEmbeds, driveEmbedUrl } from '../../utils/driveEmbed'
import { ClientStatusBadge } from './clientStatus'
import { Icon, PrimaryButton, SecondaryButton, Skeleton, friendlyDate, useModalBehavior, useToast, readableOn } from './portalUi'

const API = import.meta.env.VITE_API_URL || ''

// 401 = sesión vencida/revocada; CONTACT_REQUIRED = token legacy sin contacto
// que intenta una acción con identidad. En ambos casos, volver a loguearse.
function isAuthError(err) {
  return err.response?.status === 401 || err.response?.data?.code === 'CONTACT_REQUIRED'
}

function timeAgo(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'recién'
  if (mins < 60) return `hace ${mins} min`
  const h = Math.round(mins / 60)
  if (h < 24) return `hace ${h} h`
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

// ─── Media ───────────────────────────────────────────────────────────────────

function MediaStage({ assets }) {
  const [activeId, setActiveId] = useState(null)
  const active = assets.find(a => a.id === activeId) || assets[0] || null
  const drive = useMemo(() => (active?.kind === 'link' ? (findDriveEmbeds(active.url)[0] || null) : null), [active])

  if (!active) {
    return (
      <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-gray-400 gap-2 p-8 text-center">
        <Icon name="content" className="w-10 h-10" />
        <p className="text-sm">Todavía no hay imágenes ni videos para esta pieza.</p>
      </div>
    )
  }

  return (
    <div className="lg:h-full flex flex-col">
      <div className="relative lg:flex-1 min-h-[220px] flex items-center justify-center p-3 sm:p-6">
        {active.kind === 'video' ? (
          <video key={active.id} src={active.url} poster={active.posterUrl || undefined} controls playsInline className="max-h-[46vh] lg:max-h-[72vh] max-w-full rounded-lg" />
        ) : active.kind === 'link' ? (
          drive ? (
            <iframe src={driveEmbedUrl(drive)} className="w-full h-[46vh] lg:h-[60vh] rounded-lg bg-white" style={{ border: 0 }} allow="autoplay" loading="lazy" title="Google Drive" />
          ) : (
            <a href={active.url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-3 text-gray-300 hover:text-white px-6 py-10 text-center">
              <Icon name="link" className="w-10 h-10" />
              <span className="text-sm break-all">{active.fileName || active.url}</span>
              <span className="text-xs font-semibold underline underline-offset-4">Abrir enlace</span>
            </a>
          )
        ) : (
          <img key={active.id} src={active.url} alt="" className="max-h-[46vh] lg:max-h-[72vh] max-w-full object-contain rounded-lg" />
        )}
        {active.downloadUrl && (
          <a href={active.downloadUrl} download={active.fileName || undefined}
            className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-lg bg-black/55 hover:bg-black/75 text-white text-xs font-semibold px-2.5 py-1.5 backdrop-blur">
            <Icon name="download" className="w-4 h-4" /> Descargar
          </a>
        )}
      </div>
      {assets.length > 1 && (
        <div className="flex gap-2 px-3 pb-3 sm:px-6 sm:pb-5 overflow-x-auto justify-center">
          {assets.map((a, i) => (
            <button key={a.id} type="button" onClick={() => setActiveId(a.id)} aria-label={`Ver archivo ${i + 1}`}
              className={`relative w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-white/10 flex items-center justify-center ring-2 transition-all ${
                a.id === active.id ? 'ring-white' : 'ring-transparent opacity-60 hover:opacity-100'}`}>
              {a.kind === 'link'
                ? <Icon name="link" className="w-5 h-5 text-white" />
                : <img src={a.kind === 'video' ? (a.posterUrl || a.url) : a.url} alt="" className="w-full h-full object-cover" />}
              {a.kind === 'video' && <span className="absolute inset-0 flex items-center justify-center text-white"><Icon name="play" className="w-4 h-4" /></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Texto del posteo ────────────────────────────────────────────────────────

function CopyBlock({ piece, locked, base, authHeaders, requireReauth, onSaved, brandPrimary }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)
  const toast = useToast()

  async function save() {
    setSaving(true); setError(null)
    try {
      const r = await axios.patch(`${base}/copy`, { copy: draft }, authHeaders)
      onSaved(r.data)
      setEditing(false)
      toast('Texto actualizado')
    } catch (err) {
      if (isAuthError(err)) requireReauth()
      else setError(err.response?.data?.error || 'No se pudo guardar el texto')
    } finally { setSaving(false) }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Texto del posteo</h3>
        {!locked && !editing && (
          <button type="button" onClick={() => { setDraft(piece.copy || ''); setEditing(true) }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-900">
            <Icon name="edit" className="w-3.5 h-3.5" /> {piece.copy ? 'Editar texto' : 'Escribir texto'}
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={6} autoFocus
            className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ '--tw-ring-color': brandPrimary }} placeholder="Texto del posteo…" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <p className="text-xs text-gray-400">El equipo va a ver tu versión y la va a usar en la publicación.</p>
          <div className="flex gap-2">
            <PrimaryButton brandPrimary={brandPrimary} onClick={save} disabled={saving} className="!py-2">
              {saving ? 'Guardando…' : 'Guardar texto'}
            </PrimaryButton>
            <SecondaryButton onClick={() => { setEditing(false); setError(null) }} disabled={saving} className="!py-2">Cancelar</SecondaryButton>
          </div>
        </div>
      ) : piece.copy ? (
        <p className="text-[15px] leading-relaxed text-gray-800 whitespace-pre-wrap break-words">{linkify(piece.copy)}</p>
      ) : (
        <p className="text-sm text-gray-400 italic">Esta pieza todavía no tiene texto.</p>
      )}
      {piece.hashtags && !editing && <p className="text-sm mt-2 break-words" style={{ color: brandPrimary }}>{piece.hashtags}</p>}
    </section>
  )
}

// ─── Conversación ────────────────────────────────────────────────────────────

function Conversation({ comments, onSend, posting }) {
  const [body, setBody] = useState('')
  // Scrollea SOLO la lista de mensajes (no scrollIntoView: en mobile movía
  // toda la vista del revisor y cortaba la imagen de arriba).
  const listRef = useRef(null)
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight }, [comments.length])

  async function submit(e) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    if (await onSend(text)) setBody('')
  }

  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Conversación con el equipo</h3>
      {comments.length === 0 ? (
        <p className="text-sm text-gray-400 mb-3">Si tenés una duda sobre esta pieza, escribila acá.</p>
      ) : (
        <div ref={listRef} className="space-y-2.5 mb-3 max-h-72 overflow-y-auto pr-1">
          {comments.map(c => {
            const mine = !c.author.isTeam
            return (
              <div key={c.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${mine ? 'bg-gray-900 text-white rounded-br-md' : 'bg-gray-100 text-gray-800 rounded-bl-md'}`}>
                  <p className={`text-[11px] font-semibold mb-0.5 ${mine ? 'text-white/60' : 'text-gray-500'}`}>
                    {mine ? (c.author.name || 'Vos') : c.author.name} · {timeAgo(c.createdAt)}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{c.body}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <form onSubmit={submit} className="flex gap-2">
        <input value={body} onChange={e => setBody(e.target.value)} placeholder="Escribí un mensaje…"
          className="flex-1 min-w-0 px-3.5 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:border-gray-500" />
        <button type="submit" disabled={posting || !body.trim()}
          className="px-3.5 py-2 text-sm font-semibold rounded-xl bg-gray-900 text-white disabled:opacity-30">
          Enviar
        </button>
      </form>
    </section>
  )
}

// ─── Barra de decisión ───────────────────────────────────────────────────────

/**
 * Aprobar = un solo click (el comentario es opcional y está a la vista).
 * Pedir cambios = exige contar qué cambiar; el primer click abre el campo en
 * modo "obligatorio" en vez de disparar un error. "Pedir cambios" es un botón
 * neutro, no rojo: pedir ajustes es parte normal del proceso, no un problema.
 */
function DecisionBar({ onDecide, deciding, error, brandPrimary }) {
  const [mode, setMode] = useState('idle') // 'idle' | 'changes'
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)
  const noteRef = useRef(null)

  function askChanges() {
    setMode('changes'); setShowNote(true)
    setTimeout(() => noteRef.current?.focus(), 0)
  }

  const needsNote = mode === 'changes' && !note.trim()

  return (
    <div className="border-t border-gray-200 bg-white/95 backdrop-blur px-4 sm:px-6 py-3 space-y-2.5">
      {showNote ? (
        <textarea ref={noteRef} value={note} onChange={e => setNote(e.target.value)} rows={mode === 'changes' ? 3 : 2}
          placeholder={mode === 'changes' ? '¿Qué te gustaría cambiar? Cuanto más concreto, más rápido lo ajustamos.' : 'Comentario para el equipo (opcional)'}
          className={`w-full px-3 py-2 text-sm rounded-xl border focus:outline-none ${mode === 'changes' ? 'border-violet-300 bg-violet-50/40 focus:border-violet-500' : 'border-gray-300 focus:border-gray-500'}`} />
      ) : (
        <button type="button" onClick={() => { setShowNote(true); setTimeout(() => noteRef.current?.focus(), 0) }}
          className="text-xs font-semibold text-gray-500 hover:text-gray-800">
          + Agregar un comentario
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {mode === 'changes' ? (
        <div className="flex gap-2">
          <SecondaryButton onClick={() => { setMode('idle'); setNote(''); setShowNote(false) }} disabled={deciding}>Volver</SecondaryButton>
          <button type="button" onClick={() => onDecide('changes', note.trim())} disabled={deciding || needsNote}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 transition-all">
            {deciding ? 'Enviando…' : 'Enviar pedido de cambios'}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <SecondaryButton onClick={askChanges} disabled={deciding} className="flex-1 sm:flex-none">
            <Icon name="edit" className="w-4 h-4" /> Pedir cambios
          </SecondaryButton>
          <PrimaryButton brandPrimary={brandPrimary} onClick={() => onDecide('approve', note.trim())} disabled={deciding} className="flex-1">
            <Icon name="check" className="w-4 h-4" strokeWidth={2.4} /> {deciding ? 'Aprobando…' : 'Aprobar'}
          </PrimaryButton>
        </div>
      )}
    </div>
  )
}

// ─── Revisor ─────────────────────────────────────────────────────────────────

/**
 * Vista enfocada de UNA pieza: media grande a la izquierda (fondo oscuro, como
 * un visor), contexto + decisión + conversación a la derecha. En mobile ocupa
 * toda la pantalla con la barra de decisión fija abajo. Reemplaza la tarjeta
 * expandible dentro del listado, donde los botones de aprobar quedaban
 * enterrados debajo de assets, copy e iframes.
 *
 * `position`/`total` + `onPrev`/`onNext` permiten recorrer la cola ("2 de 5")
 * sin volver al listado. `onDecided(updated)` avisa al padre para que avance
 * solo a la siguiente pieza pendiente.
 */
export default function PieceReviewer({
  slug, token, requireReauth, piece, brandPrimary, viewerCanApprove = true,
  position, total, onPrev, onNext, onClose, onChanged, onDecided,
}) {
  const [detail, setDetail]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [posting, setPosting] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [decisionError, setDecisionError] = useState(null)
  const toast = useToast()

  useModalBehavior(true, onClose)

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } }
  const base = `${API}/api/public/client-portal/${slug}/content/${piece.id}`

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null); setDetail(null); setDecisionError(null)
    axios.get(base, authHeaders)
      .then(r => { if (!cancelled) setDetail(r.data) })
      .catch(err => {
        if (cancelled) return
        if (isAuthError(err)) requireReauth()
        else setError(err.response?.data?.error || 'No se pudo cargar la pieza')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece.id])

  const p = detail?.piece || piece
  const locked = Boolean(statusMeta(p.status)?.isTerminal)
  const driveEmbeds = useMemo(() => findDriveEmbeds(p.copy), [p.copy])

  function applyUpdate(updated) {
    onChanged?.(updated)
    setDetail(prev => (prev ? { ...prev, piece: updated } : prev))
  }

  async function sendComment(body) {
    setPosting(true)
    try {
      const r = await axios.post(`${base}/comments`, { body }, authHeaders)
      setDetail(prev => (prev ? { ...prev, comments: [...prev.comments, r.data] } : prev))
      return true
    } catch (err) {
      if (isAuthError(err)) requireReauth()
      else toast('No se pudo enviar el mensaje', 'warn')
      return false
    } finally { setPosting(false) }
  }

  async function decide(action, note) {
    setDeciding(true); setDecisionError(null)
    try {
      const url = `${base}/${action === 'approve' ? 'approve' : 'request-changes'}`
      const payload = note ? { comment: note } : {}
      const r = await axios.post(url, payload, authHeaders)
      applyUpdate(r.data)
      toast(action === 'approve' ? `Aprobaste «${r.data.title}»` : 'Le pasamos tus cambios al equipo')
      onDecided?.(r.data)
    } catch (err) {
      if (isAuthError(err)) requireReauth()
      else setDecisionError(err.response?.data?.error || 'No se pudo enviar tu respuesta. Probá de nuevo.')
    } finally { setDeciding(false) }
  }

  const networks = (p.networks || []).map(networkLabel).join(' · ')
  const canDecide = p.canDecide && viewerCanApprove

  return (
    <div className="fixed inset-0 z-[60] bg-gray-950/70 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={p.title}>
      <div className="relative w-full sm:max-w-6xl h-full sm:h-[min(92vh,860px)] bg-white sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Barra superior: navegación de la cola + cerrar */}
        <div className="flex items-center gap-2 px-3 sm:px-4 h-14 border-b border-gray-200 shrink-0">
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-600">
            <Icon name="close" />
          </button>
          <div className="flex-1 min-w-0 text-center">
            {total > 1 && <p className="text-xs font-semibold text-gray-500">{position} de {total}</p>}
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={onPrev} disabled={!onPrev} aria-label="Anterior" className="w-9 h-9 rounded-full hover:bg-gray-100 disabled:opacity-25 flex items-center justify-center text-gray-600">
              <Icon name="chevronLeft" />
            </button>
            <button type="button" onClick={onNext} disabled={!onNext} aria-label="Siguiente" className="w-9 h-9 rounded-full hover:bg-gray-100 disabled:opacity-25 flex items-center justify-center text-gray-600">
              <Icon name="chevronRight" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
          <div className="lg:flex-[1.35] bg-gray-950 lg:overflow-y-auto shrink-0">
            <MediaStage key={p.id} assets={p.assets || []} />
          </div>

          <div className="lg:flex-1 lg:max-w-[460px] flex flex-col min-h-0 lg:border-l border-gray-200">
            <div className="flex-1 lg:overflow-y-auto px-4 sm:px-6 py-5 space-y-6">
              <header>
                <ClientStatusBadge status={p.status} />
                <h2 className="mt-2 text-xl font-semibold text-gray-900 leading-snug">{p.title}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {p.scheduledDate ? `Sale el ${friendlyDate(p.scheduledDate)}` : 'Sin fecha de publicación todavía'}
                  {networks && <> · {networks}</>}
                </p>
                {p.canDecide && !viewerCanApprove && (
                  <p className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                    Podés ver y comentar esta pieza. La aprobación la hace otra persona de tu equipo.
                  </p>
                )}
                {p.approvedBy && (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                    <Icon name="checkCircle" className="w-4 h-4" /> Aprobado por {p.approvedBy.name}
                  </p>
                )}
              </header>

              {loading && !detail ? (
                <div className="space-y-3"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-20" /><Skeleton className="h-16" /></div>
              ) : error ? (
                <p className="text-sm text-red-600">{error}</p>
              ) : (
                <>
                  <CopyBlock piece={p} locked={locked} base={base} authHeaders={authHeaders} requireReauth={requireReauth} onSaved={applyUpdate} brandPrimary={brandPrimary} />

                  {driveEmbeds.map(d => (
                    <div key={d.id} className="rounded-xl overflow-hidden border border-gray-200" style={{ height: d.type === 'folder' ? 220 : 320 }}>
                      <iframe src={driveEmbedUrl(d)} className="w-full h-full" style={{ border: 0 }} allow="autoplay" loading="lazy" title="Google Drive" />
                    </div>
                  ))}

                  {(p.createdBy || p.owner) && (
                    <p className="text-xs text-gray-400">
                      {p.createdBy && <>Preparado por <span className="text-gray-600 font-medium">{p.createdBy.name}</span></>}
                      {p.createdBy && p.owner && ' · '}
                      {p.owner && <>Diseño de <span className="text-gray-600 font-medium">{p.owner.name}</span></>}
                    </p>
                  )}

                  {detail && <Conversation comments={detail.comments} onSend={sendComment} posting={posting} />}
                </>
              )}
            </div>

            {canDecide && (
              <div className="sticky bottom-0 shrink-0">
                <DecisionBar key={p.id} onDecide={decide} deciding={deciding} error={decisionError} brandPrimary={brandPrimary} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Pantalla de cierre al terminar la cola de revisión. */
export function ReviewComplete({ onClose, brandPrimary }) {
  useModalBehavior(true, onClose)
  return (
    <div className="fixed inset-0 z-[60] bg-gray-950/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="w-full max-w-sm bg-white rounded-3xl p-8 text-center shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: brandPrimary, color: readableOn(brandPrimary) }}>
          <Icon name="check" className="w-7 h-7" strokeWidth={2.6} />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">¡Listo, revisaste todo!</h2>
        <p className="text-sm text-gray-500 mt-1.5">El equipo ya recibió tus respuestas. Te avisamos por email cuando haya algo nuevo para revisar.</p>
        <PrimaryButton brandPrimary={brandPrimary} onClick={onClose} className="mt-6 w-full">Volver al portal</PrimaryButton>
      </div>
    </div>
  )
}
