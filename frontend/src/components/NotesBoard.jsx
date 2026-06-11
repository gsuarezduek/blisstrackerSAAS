import { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'

/**
 * Pizarra de Notas Desplegable.
 *
 * Se monta entre el Navbar y el contenido principal (ver Navbar.jsx).
 * - Tema claro  → pizarra negra, tiza clara.
 * - Tema oscuro → pizarra blanca, marcador oscuro.
 * Persiste contenido / estado abierto / altura en localStorage por usuario.
 * Multicolor por selección vía execCommand('foreColor') sobre un contentEditable.
 */

const COLORS = [
  { name: 'Tiza',     key: 'default' },
  { name: 'Amarillo', chalk: '#f6e27a', marker: '#c79a00' },
  { name: 'Verde',    chalk: '#a3d977', marker: '#3f9d4a' },
  { name: 'Celeste',  chalk: '#7fd3e8', marker: '#2a93c4' },
  { name: 'Rosa',     chalk: '#f5a7c4', marker: '#d65a8e' },
  { name: 'Naranja',  chalk: '#f4a85a', marker: '#e07b1a' },
]

const DEFAULT_HEIGHT = () => Math.round(Math.min(window.innerHeight * 0.35, 460))
const clampHeight = (h) => Math.max(180, Math.min(h, Math.round(window.innerHeight * 0.7)))

export default function NotesBoard() {
  const { dark } = useTheme()
  const { user } = useAuth()
  const uid = user?.id ?? 'anon'

  const K_HTML   = `bliss_notes_html_${uid}`
  const K_OPEN   = `bliss_notes_open_${uid}`
  const K_HEIGHT = `bliss_notes_height_${uid}`

  const [open, setOpen]       = useState(() => localStorage.getItem(K_OPEN) === '1')
  const [height, setHeight]   = useState(() => {
    const stored = parseInt(localStorage.getItem(K_HEIGHT) || '', 10)
    return clampHeight(Number.isFinite(stored) ? stored : DEFAULT_HEIGHT())
  })
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  const [status, setStatus]     = useState('idle')   // 'idle' | 'typing' | 'saved'
  const [confirmClear, setConfirmClear] = useState(false)

  const editorRef = useRef(null)
  const saveTimer = useRef(null)
  const clearTimer = useRef(null)

  // ── Colores resueltos según tema ──────────────────────────────────────
  const boardBg    = dark ? '#f7f7f2' : '#15171a'
  const defaultInk = dark ? '#1d1d1d' : '#f3f3ec'
  const resolve = useCallback(
    (c) => (c.key === 'default' ? defaultInk : (dark ? c.marker : c.chalk)),
    [dark, defaultInk],
  )
  const [activeColor, setActiveColor] = useState(defaultInk)
  useEffect(() => { setActiveColor(defaultInk) }, [defaultInk])

  // ── Persistencia de estado abierto / altura ──────────────────────────
  useEffect(() => { localStorage.setItem(K_OPEN, open ? '1' : '0') }, [open, K_OPEN])
  useEffect(() => { localStorage.setItem(K_HEIGHT, String(height)) }, [height, K_HEIGHT])

  // ── Breakpoint mobile ────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const h = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  // ── Cargar contenido guardado al montar el editor ────────────────────
  const mountEditor = useCallback((el) => {
    editorRef.current = el
    if (el && el.innerHTML === '') {
      el.innerHTML = localStorage.getItem(K_HTML) || ''
    }
  }, [K_HTML])

  // ── Autosave (debounce) ──────────────────────────────────────────────
  const scheduleSave = useCallback(() => {
    setStatus('typing')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (editorRef.current) {
        localStorage.setItem(K_HTML, editorRef.current.innerHTML)
        setStatus('saved')
      }
    }, 500)
  }, [K_HTML])

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  // ── Aplicar color de tiza a la selección / escritura ─────────────────
  const applyColor = useCallback((hex) => {
    const el = editorRef.current
    if (!el) return
    el.focus()
    try {
      document.execCommand('styleWithCSS', false, true)
      document.execCommand('foreColor', false, hex)
    } catch { /* navegadores muy viejos */ }
    setActiveColor(hex)
    scheduleSave()
  }, [scheduleSave])

  // ── Limpiar (doble confirmación) ─────────────────────────────────────
  const clearBoard = useCallback(() => {
    if (!confirmClear) {
      setConfirmClear(true)
      clearTimeout(clearTimer.current)
      clearTimer.current = setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    setConfirmClear(false)
    if (editorRef.current) editorRef.current.innerHTML = ''
    localStorage.setItem(K_HTML, '')
    setStatus('saved')
  }, [confirmClear])

  // ── Atajo de teclado Ctrl/Cmd + B ────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape' && isMobile) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isMobile])

  // ── Resize handle (solo desktop) ─────────────────────────────────────
  const startResize = useCallback((e) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = height
    const onMove = (ev) => setHeight(clampHeight(startH + (ev.clientY - startY)))
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [height])

  if (!user) return null

  // ── Contenido de la pizarra (toolbar + editor) ───────────────────────
  const board = (
    <div
      className="chalk-texture flex flex-col h-full"
      style={{ backgroundColor: boardBg, color: defaultInk }}
    >
      {/* Toolbar / bandeja de tizas */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b chalk-divider flex-wrap">
        <span className="chalk-font text-base sm:text-lg opacity-70 mr-1 select-none">Pizarra</span>

        {/* Tizas de colores */}
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => {
            const hex = resolve(c)
            const active = activeColor === hex
            return (
              <button
                key={c.name}
                type="button"
                title={c.name}
                onMouseDown={(e) => e.preventDefault()}   // no robar la selección del editor
                onClick={() => applyColor(hex)}
                className={`w-5 h-5 rounded-full border border-black/20 transition-transform hover:scale-110 ${
                  active ? 'ring-2 ring-offset-1' : ''
                }`}
                style={{
                  backgroundColor: hex,
                  '--tw-ring-color': hex,
                  '--tw-ring-offset-color': boardBg,
                }}
              />
            )
          })}
        </div>

        <div className="flex-1" />

        {/* Indicador de guardado */}
        <span className="chalk-font text-sm opacity-60 select-none min-w-[68px] text-right">
          {status === 'typing' ? 'Escribiendo…' : status === 'saved' ? 'Guardado ✓' : ''}
        </span>

        {/* Limpiar */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={clearBoard}
          className="chalk-font text-sm px-2 py-0.5 rounded border chalk-divider chalk-hover transition-colors"
        >
          {confirmClear ? '¿Borrar todo?' : 'Limpiar'}
        </button>

        {/* Cerrar (mobile) */}
        {isMobile && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="chalk-font text-lg px-2 leading-none rounded chalk-hover"
            title="Cerrar"
          >
            ✕
          </button>
        )}
      </div>

      {/* Editor */}
      <div
        ref={mountEditor}
        contentEditable
        suppressContentEditableWarning
        onInput={scheduleSave}
        spellCheck={false}
        className="chalk-font chalk-text flex-1 overflow-y-auto px-4 sm:px-6 py-3 text-lg sm:text-xl outline-none whitespace-pre-wrap"
        data-placeholder="Escribí acá tus notas, ideas o recordatorios…"
        style={{ caretColor: activeColor }}
      />

      {/* Handle de resize (solo desktop) */}
      {!isMobile && (
        <div
          onPointerDown={startResize}
          className="h-2 cursor-ns-resize flex items-center justify-center chalk-hover transition-colors"
          title="Arrastrar para ajustar la altura"
        >
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'rgba(128,128,128,.4)' }} />
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Estilo del placeholder cuando el editor está vacío */}
      <style>{`
        [contenteditable][data-placeholder]:empty::before {
          content: attr(data-placeholder);
          opacity: .45;
          pointer-events: none;
        }
      `}</style>

      {/* ── Desktop: pizarra inline con slide por altura ── */}
      {!isMobile && (
        <div
          className="overflow-hidden transition-[height] duration-300 ease-in-out"
          style={{ height: open ? height : 0 }}
        >
          {board}
        </div>
      )}

      {/* ── Flecha de apertura/cierre (siempre en el flujo) ── */}
      <div className="flex justify-center bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title={open ? 'Cerrar pizarra (Ctrl/Cmd+B)' : 'Abrir pizarra (Ctrl/Cmd+B)'}
          className="group -mb-px px-6 py-0.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-5 h-5 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* ── Mobile: overlay full-screen con slide vertical ── */}
      {isMobile && (
        <div
          className={`fixed inset-0 z-[60] transition-transform duration-300 ease-in-out ${
            open ? 'translate-y-0' : 'translate-y-full pointer-events-none'
          }`}
        >
          {board}
        </div>
      )}
    </>
  )
}
