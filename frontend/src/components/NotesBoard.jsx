import { useState, useEffect, useRef, useCallback, Fragment } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'

/**
 * Pizarra de Notas Desplegable.
 *
 * Se monta entre el Navbar y el contenido principal (ver Navbar.jsx).
 * - Tema claro  → pizarra negra, tiza clara.
 * - Tema oscuro → pizarra blanca, marcador oscuro.
 * Persiste contenido / estado abierto / altura / nº de columnas en localStorage
 * por usuario. Formato (color, tipografía y tamaño) se aplica POR SELECCIÓN /
 * texto que se escribe a continuación vía execCommand. En desktop se puede
 * dividir en 1, 2 o 3 columnas independientes (cada una con su contenido).
 * En mobile siempre es 1 columna a pantalla completa.
 */

const COLORS = [
  { name: 'Tiza',     key: 'default' },
  { name: 'Amarillo', chalk: '#f6e27a', marker: '#c79a00' },
  { name: 'Verde',    chalk: '#a3d977', marker: '#3f9d4a' },
  { name: 'Celeste',  chalk: '#7fd3e8', marker: '#2a93c4' },
  { name: 'Rosa',     chalk: '#f5a7c4', marker: '#d65a8e' },
  { name: 'Naranja',  chalk: '#f4a85a', marker: '#e07b1a' },
]

// Tipografías disponibles (se aplican a la selección / texto que se escribe)
const FONTS = [
  { label: 'Kalam',        family: "'Kalam', cursive" },
  { label: 'Caveat',       family: "'Caveat', cursive" },
  { label: 'Gloria',       family: "'Gloria Hallelujah', cursive" },
  { label: 'Shadows',      family: "'Shadows Into Light', cursive" },
  { label: 'Indie Flower', family: "'Indie Flower', cursive" },
  { label: 'Patrick Hand', family: "'Patrick Hand', cursive" },
]
const DEFAULT_FAMILY = "'Kalam', cursive"

// Tamaños (valores 1-7 de execCommand('fontSize') → keywords CSS)
const SIZES = [
  { n: 3, label: 'Pequeño', cls: 'text-xs' },
  { n: 4, label: 'Normal',  cls: 'text-sm' },
  { n: 6, label: 'Título',  cls: 'text-lg' },
  { n: 7, label: 'Grande',  cls: 'text-2xl' },
]

const DEFAULT_HEIGHT = () => Math.round(Math.min(window.innerHeight * 0.35, 460))
const clampHeight = (h) => Math.max(180, Math.min(h, Math.round(window.innerHeight * 0.7)))

export default function NotesBoard() {
  const { dark } = useTheme()
  const { user } = useAuth()
  const uid = user?.id ?? 'anon'

  const K_OPEN    = `bliss_notes_open_${uid}`
  const K_HEIGHT  = `bliss_notes_height_${uid}`
  const K_COLS    = `bliss_notes_cols_${uid}`
  const K_LEGACY  = `bliss_notes_html_${uid}`              // contenido de la v1 (1 sola columna)
  const keyFor    = (i) => `bliss_notes_html_${uid}_${i}`

  const [open, setOpen]     = useState(() => localStorage.getItem(K_OPEN) === '1')
  const [height, setHeight] = useState(() => {
    const stored = parseInt(localStorage.getItem(K_HEIGHT) || '', 10)
    return clampHeight(Number.isFinite(stored) ? stored : DEFAULT_HEIGHT())
  })
  const [cols, setCols] = useState(() => {
    const n = parseInt(localStorage.getItem(K_COLS) || '', 10)
    return [1, 2, 3].includes(n) ? n : 1
  })
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  const [confirmClear, setConfirmClear] = useState(false)
  const [fontMenu, setFontMenu] = useState(false)

  const editorsRef  = useRef([])     // nodos contentEditable por columna
  const activeIdx   = useRef(0)      // última columna enfocada
  const savedSel    = useRef(null)   // { idx, range } para no perder la selección al usar la toolbar
  const saveTimer   = useRef(null)
  const clearTimer  = useRef(null)

  const effectiveCols = isMobile ? 1 : cols

  // ── Colores resueltos según tema ──────────────────────────────────────
  const boardBg    = dark ? '#f7f7f2' : '#15171a'
  const defaultInk = dark ? '#1d1d1d' : '#f3f3ec'
  const resolve = useCallback(
    (c) => (c.key === 'default' ? defaultInk : (dark ? c.marker : c.chalk)),
    [dark, defaultInk],
  )
  const [activeColor, setActiveColor] = useState(defaultInk)
  useEffect(() => { setActiveColor(defaultInk) }, [defaultInk])

  // ── Persistencia de estado abierto / altura / columnas ───────────────
  useEffect(() => { localStorage.setItem(K_OPEN, open ? '1' : '0') }, [open, K_OPEN])
  useEffect(() => { localStorage.setItem(K_HEIGHT, String(height)) }, [height, K_HEIGHT])
  useEffect(() => { localStorage.setItem(K_COLS, String(cols)) }, [cols, K_COLS])

  // ── Breakpoint mobile ────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const h = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  // ── Carga / guardado de contenido por columna ────────────────────────
  const loadFor = useCallback((i) => {
    const v = localStorage.getItem(keyFor(i))
    if (v !== null) return v
    if (i === 0) return localStorage.getItem(K_LEGACY) || ''   // migra la nota v1 a la col 1
    return ''
  }, [uid])

  const saveAll = useCallback(() => {
    editorsRef.current.forEach((el, i) => { if (el) localStorage.setItem(keyFor(i), el.innerHTML) })
  }, [uid])

  // ref callback estable-por-índice: carga el contenido una sola vez por nodo
  const mountEditor = (i) => (el) => {
    editorsRef.current[i] = el
    if (el && !el.dataset.loaded) {
      el.innerHTML = loadFor(i)
      el.dataset.loaded = '1'
    }
  }

  // ── Autosave (debounce, silencioso) ──────────────────────────────────
  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(saveAll, 500)
  }, [saveAll])

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  // ── Selección: guardar / restaurar (la toolbar no roba el cursor) ────
  const saveSelection = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const idx = editorsRef.current.findIndex((el) => el && el.contains(range.commonAncestorContainer))
    if (idx === -1) return
    activeIdx.current = idx
    savedSel.current = { idx, range: range.cloneRange() }
  }, [])

  const restoreSelection = useCallback(() => {
    const saved = savedSel.current
    const el = editorsRef.current[saved?.idx ?? activeIdx.current] || editorsRef.current[0]
    if (!el) return null
    el.focus()
    if (saved) {
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(saved.range)
    }
    return el
  }, [])

  // ── Aplicar formato a la selección / texto siguiente ─────────────────
  const applyFormat = useCallback((cmd, value) => {
    if (!restoreSelection()) return
    try {
      document.execCommand('styleWithCSS', false, true)
      document.execCommand(cmd, false, value)
    } catch { /* navegadores muy viejos */ }
    scheduleSave()
    saveSelection()
  }, [restoreSelection, saveSelection, scheduleSave])

  const applyColor = useCallback((hex) => { applyFormat('foreColor', hex); setActiveColor(hex) }, [applyFormat])
  const applyFont  = useCallback((family) => { applyFormat('fontName', family) }, [applyFormat])
  const applySize  = useCallback((n) => { applyFormat('fontSize', String(n)) }, [applyFormat])

  // ── Limpiar la columna activa (doble confirmación) ───────────────────
  const clearBoard = useCallback(() => {
    if (!confirmClear) {
      setConfirmClear(true)
      clearTimeout(clearTimer.current)
      clearTimer.current = setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    setConfirmClear(false)
    const idx = editorsRef.current[activeIdx.current] ? activeIdx.current : 0
    const el = editorsRef.current[idx]
    if (el) { el.innerHTML = ''; localStorage.setItem(keyFor(idx), '') }
  }, [confirmClear, uid])

  // ── Cambiar nº de columnas (guarda antes de desmontar) ───────────────
  const changeCols = useCallback((n) => { saveAll(); setCols(n) }, [saveAll])

  // ── Atajo de teclado Ctrl/Cmd + B + Escape (mobile) ──────────────────
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') { if (isMobile) setOpen(false); setFontMenu(false) }
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

  const noSteal = (e) => e.preventDefault()   // mantiene la selección del editor al clickear la toolbar

  // ── Contenido de la pizarra (toolbar + columnas) ─────────────────────
  const board = (
    <div
      className="chalk-texture flex flex-col h-full"
      style={{ backgroundColor: boardBg, color: defaultInk }}
    >
      {/* Toolbar / bandeja de tizas */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b chalk-divider flex-wrap">
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
                onMouseDown={noSteal}
                onClick={() => applyColor(hex)}
                className={`w-5 h-5 rounded-full border border-black/20 transition-transform hover:scale-110 ${
                  active ? 'ring-2 ring-offset-1' : ''
                }`}
                style={{ backgroundColor: hex, '--tw-ring-color': hex, '--tw-ring-offset-color': boardBg }}
              />
            )
          })}
        </div>

        {/* Tipografía (menú; se aplica a la selección) */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={noSteal}
            onClick={() => setFontMenu((o) => !o)}
            title="Tipografía"
            className="chalk-font text-base px-2 py-0.5 rounded border chalk-divider chalk-hover leading-none"
          >
            Aa ▾
          </button>
          {fontMenu && (
            <>
              <div className="fixed inset-0 z-10" onMouseDown={(e) => { e.preventDefault(); setFontMenu(false) }} />
              <div
                className="absolute left-0 mt-1 z-20 rounded border chalk-divider shadow-lg py-1 min-w-[140px]"
                style={{ backgroundColor: boardBg, color: defaultInk }}
              >
                {FONTS.map((f) => (
                  <button
                    key={f.label}
                    type="button"
                    onMouseDown={noSteal}
                    onClick={() => { applyFont(f.family); setFontMenu(false) }}
                    className="block w-full text-left px-3 py-1 text-lg chalk-hover"
                    style={{ fontFamily: f.family }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Tamaño (se aplica a la selección) */}
        <div className="flex items-center gap-0.5 border chalk-divider rounded px-0.5" title="Tamaño de letra">
          {SIZES.map((s) => (
            <button
              key={s.n}
              type="button"
              onMouseDown={noSteal}
              onClick={() => applySize(s.n)}
              title={s.label}
              className={`chalk-font leading-none px-1.5 py-0.5 rounded chalk-hover ${s.cls}`}
            >
              A
            </button>
          ))}
        </div>

        {/* Selector de columnas (solo desktop) */}
        <div className="hidden md:flex items-center rounded border chalk-divider overflow-hidden" title="Columnas">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              onMouseDown={noSteal}
              onClick={() => changeCols(n)}
              className={`px-2 py-0.5 text-sm chalk-font transition-colors ${cols === n ? '' : 'opacity-50 chalk-hover'}`}
              style={cols === n ? { backgroundColor: 'rgba(128,128,128,.2)' } : undefined}
              title={`${n} columna${n > 1 ? 's' : ''}`}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Limpiar columna activa */}
        <button
          type="button"
          onMouseDown={noSteal}
          onClick={clearBoard}
          title={effectiveCols > 1 ? 'Limpia la columna activa' : 'Limpia la pizarra'}
          className="chalk-font text-sm px-2 py-0.5 rounded border chalk-divider chalk-hover transition-colors"
        >
          {confirmClear ? (effectiveCols > 1 ? '¿Borrar columna?' : '¿Borrar todo?') : 'Limpiar'}
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

      {/* Columnas editables */}
      <div className="flex-1 flex overflow-hidden">
        {Array.from({ length: effectiveCols }).map((_, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <div className="w-px self-stretch shrink-0" style={{ backgroundColor: 'rgba(128,128,128,.22)' }} />
            )}
            <div
              ref={mountEditor(i)}
              contentEditable
              suppressContentEditableWarning
              onInput={scheduleSave}
              onFocus={() => { activeIdx.current = i }}
              onKeyUp={saveSelection}
              onMouseUp={saveSelection}
              spellCheck={false}
              className="chalk-text flex-1 basis-0 min-w-0 overflow-y-auto px-4 sm:px-6 py-3 outline-none whitespace-pre-wrap"
              style={{ caretColor: activeColor, fontFamily: DEFAULT_FAMILY, fontSize: '1.125rem' }}
            />
          </Fragment>
        ))}
      </div>

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
