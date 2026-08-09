import { useState, useEffect, useRef, useCallback } from 'react'
import DOMPurify from 'dompurify'
import RichTextEditor from './RichTextEditor'
import './situation-editor.css'

const SAVE_DELAY_MS = 2000 // guarda recién cuando el usuario deja de tipear
const MAX_WAIT_MS   = 8000 // pero nunca deja pasar más que esto sin guardar, aunque siga tipeando

// Editor de notas con autoguardado. Reemplaza el viejo patrón "borrador + botón Guardar",
// que perdía todo lo tipeado si se cerraba la pestaña (o se navegaba) antes de guardar a
// mano — nos pasó varias veces en las notas de reunión. Guarda solo, con un debounce corto
// tras la última tecla (+ un tope de espera si no para de escribir), guarda al perder el
// foco del editor, y bloquea el cierre de la pestaña si por algún motivo (ej. falló la red)
// quedó algo sin confirmar.
//
// Mantiene su propio `savedContent` (en vez de usar directo el prop `content` para la vista
// de lectura): así, apenas autoguarda, la vista refleja lo último guardado sin depender de
// que el padre vuelva a pasar el `content` actualizado en cada tick.
//
// `editorKey` identifica QUÉ se está editando (id de la reunión/lead/proyecto). Solo cuando
// cambia se resetea el draft — así un cambio de prop ajeno a una edición en curso no la interrumpe.
export default function AutosaveNotes({
  content, onSave, label, emptyText = 'Sin información todavía.', addLabel = '+ Agregar',
  minHeight = 140, canEdit = true, editorKey,
}) {
  const [editing,      setEditing]      = useState(false)
  const [draft,        setDraft]        = useState(content || '')
  const [savedContent, setSavedContent] = useState(content || '')
  const [status,       setStatus]       = useState('idle') // idle | dirty | saving | saved | error

  const draftRef    = useRef(draft)
  const savedRef    = useRef(content || '')
  const timerRef    = useRef(null)
  const maxTimerRef = useRef(null)
  const savingRef   = useRef(false)
  const pendingRef  = useRef(false)

  useEffect(() => {
    setDraft(content || '')
    draftRef.current = content || ''
    savedRef.current = content || ''
    setSavedContent(content || '')
    setEditing(false)
    setStatus('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorKey])

  const doSave = useCallback(async () => {
    if (savingRef.current) { pendingRef.current = true; return }
    if (draftRef.current === savedRef.current) return
    savingRef.current = true
    setStatus('saving')
    const toSave = draftRef.current
    try {
      await onSave(toSave)
      savedRef.current = toSave
      setSavedContent(toSave)
      setStatus(draftRef.current === toSave ? 'saved' : 'dirty')
    } catch {
      setStatus('error')
    } finally {
      savingRef.current = false
      if (pendingRef.current) {
        pendingRef.current = false
        doSave()
      }
    }
  }, [onSave])

  function scheduleSave() {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(doSave, SAVE_DELAY_MS)
    if (!maxTimerRef.current) {
      maxTimerRef.current = setTimeout(() => {
        maxTimerRef.current = null
        doSave()
      }, MAX_WAIT_MS)
    }
  }

  function handleChange(html) {
    draftRef.current = html
    setDraft(html)
    setStatus('dirty')
    scheduleSave()
  }

  function handleBlur() {
    clearTimeout(timerRef.current)
    clearTimeout(maxTimerRef.current)
    maxTimerRef.current = null
    doSave()
  }

  // Cerrar la pestaña / refrescar con cambios sin confirmar todavía → preguntar.
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (draftRef.current !== savedRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Desmontar (ej. navegación dentro de la app a otra sección) con cambios pendientes →
  // guardar ya, sin esperar el debounce. Best-effort: no bloquea el desmontaje.
  useEffect(() => () => {
    clearTimeout(timerRef.current)
    clearTimeout(maxTimerRef.current)
    if (draftRef.current !== savedRef.current) doSave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleEdit() {
    setDraft(savedContent)
    draftRef.current = savedContent
    setEditing(true)
  }

  // Si el guardado falla, nos quedamos en modo edición (con el error visible y "Reintentar")
  // en vez de volver a la vista de solo lectura — así no parece que el cambio se perdió.
  async function handleDone() {
    clearTimeout(timerRef.current)
    clearTimeout(maxTimerRef.current)
    maxTimerRef.current = null
    await doSave()
    if (draftRef.current === savedRef.current) setEditing(false)
  }

  const isEmpty = !savedContent || savedContent === '<p></p>'
  const statusLabel = {
    saving: 'Guardando…',
    saved:  'Guardado ✓',
    dirty:  'Cambios sin guardar',
    error:  '⚠ No se pudo guardar',
  }[status]

  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        {label && (
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
        )}
        {canEdit && !editing && (
          <button
            onClick={handleEdit}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
          >
            {isEmpty ? addLabel : 'Editar'}
          </button>
        )}
        {editing && statusLabel && (
          <span className={`text-xs flex-shrink-0 ${status === 'error' ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}>
            {statusLabel}
            {status === 'error' && (
              <button onClick={doSave} className="ml-1.5 underline hover:no-underline">Reintentar</button>
            )}
          </span>
        )}
      </div>

      {editing ? (
        <div>
          <RichTextEditor defaultContent={draft} onChange={handleChange} onBlur={handleBlur} minHeight={minHeight} />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleDone}
              className="text-sm px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
            >
              Listo
            </button>
          </div>
        </div>
      ) : isEmpty ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">{emptyText}</p>
      ) : (
        <div
          className="situation-content text-sm text-gray-700 dark:text-gray-300"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(savedContent) }}
        />
      )}
    </div>
  )
}
