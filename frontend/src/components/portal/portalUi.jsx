import { useEffect, useState, useCallback, createContext, useContext } from 'react'

// Primitivas visuales del portal de cliente. Viven aparte del resto de la app
// porque el portal tiene su propio lenguaje (marca del workspace, audiencia no
// técnica, sin dark mode) y no debe heredar cambios de las pantallas internas.

// ─── Marca ────────────────────────────────────────────────────────────────────

/** Texto blanco o casi negro según la luminancia del color de marca. */
export function readableOn(hex) {
  try {
    const h = String(hex).replace('#', '')
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#111827' : '#ffffff'
  } catch { return '#ffffff' }
}

/** Color de marca con transparencia (hex de 6 dígitos + alpha 0..1). */
export function withAlpha(hex, alpha) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return hex
  return `#${h}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`
}

// ─── Íconos (trazo, 24px) ────────────────────────────────────────────────────
// Set mínimo inline: el portal reemplaza los emojis de navegación por íconos
// consistentes; el repo no tiene librería de íconos y no vale la pena sumarla.

const PATHS = {
  home:     'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z',
  content:  'M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Zm0 11 4.5-4.5 3.5 3.5 2.5-2.5L20 18',
  reports:  'M4 20V10m6 10V4m6 16v-7m4 7H2',
  folder:   'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  check:    'M5 12.5 10 17.5 19 7',
  checkCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-4-9.5 2.8 2.8L16 9',
  edit:     'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
  chat:     'M4 5h16v11H9l-5 4V5Z',
  calendar: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Zm0 3h16M8 3v4m8-4v4',
  list:     'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  chevronRight: 'm9 5 7 7-7 7',
  chevronLeft:  'm15 5-7 7 7 7',
  close:    'M6 6l12 12M18 6 6 18',
  download: 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14',
  logout:   'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10',
  users:    'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1m17 0v-1a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-7.87a4 4 0 0 1 0 7.75',
  spark:    'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  clock:    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2',
  mail:     'M4 6h16v12H4V6Zm0 0 8 7 8-7',
  lock:     'M6 11h12v9H6v-9Zm2 0V8a4 4 0 1 1 8 0v3',
  link:     'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  file:     'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5',
  pulse:    'M3 12h4l3-8 4 16 3-8h4',
  star:     'm12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z',
  play:     'M8 5v14l11-7L8 5Z',
  refresh:  'M20 11a8 8 0 1 0-2.34 5.66M20 5v6h-6',
}

export function Icon({ name, className = 'w-5 h-5', strokeWidth = 1.8 }) {
  const d = PATHS[name]
  if (!d) return null
  const filled = name === 'play'
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

// ─── Bloques de layout ───────────────────────────────────────────────────────

export function Card({ as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag className={`bg-white rounded-2xl border border-gray-200/80 shadow-[0_1px_2px_rgba(16,24,40,.04)] ${className}`} {...rest}>
      {children}
    </Tag>
  )
}

export function SectionTitle({ title, subtitle, action }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/**
 * Control segmentado (sub-vistas dentro de una sección). `options`:
 * [{ key, label, count? }]. Scrollea en horizontal en pantallas chicas.
 */
export function Segmented({ options, value, onChange, brandPrimary, className = '' }) {
  return (
    <div className={`inline-flex max-w-full overflow-x-auto rounded-xl bg-gray-100 p-1 gap-1 ${className}`} role="tablist">
      {options.map(o => {
        const active = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
          >
            {o.label}
            {o.count > 0 && (
              <span
                className="min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-semibold inline-flex items-center justify-center"
                style={{ backgroundColor: active ? brandPrimary : '#e5e7eb', color: active ? readableOn(brandPrimary) : '#4b5563' }}
              >
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function PrimaryButton({ brandPrimary, className = '', children, ...rest }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all hover:brightness-95 active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none ${className}`}
      style={{ backgroundColor: brandPrimary, color: readableOn(brandPrimary) }}
      {...rest}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ className = '', children, ...rest }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 transition-all active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

// ─── Estados ─────────────────────────────────────────────────────────────────

export function EmptyState({ icon = 'spark', title, children, action }) {
  return (
    <div className="text-center py-12 px-6">
      <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center">
        <Icon name={icon} className="w-6 h-6" />
      </div>
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      {children && <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="text-center py-10 px-6">
      <p className="text-sm font-semibold text-gray-800">Algo no salió bien</p>
      <p className="text-sm text-gray-500 mt-1">{message || 'No pudimos cargar esta sección.'}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900">
          <Icon name="refresh" className="w-4 h-4" /> Reintentar
        </button>
      )}
    </div>
  )
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-gray-200/70 ${className}`} />
}

export function SkeletonList({ rows = 3 }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="w-14 h-14 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Toasts ──────────────────────────────────────────────────────────────────
// Confirmación liviana de acciones (aprobar, pedir cambios, enviar mensaje)
// sin modales extra. Un solo provider por portal.

const ToastCtx = createContext(() => {})

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const push = useCallback((message, tone = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, message, tone }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3600)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed z-[70] left-1/2 -translate-x-1/2 top-4 sm:top-6 flex flex-col items-center gap-2 pointer-events-none px-4 w-full max-w-md" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto flex items-center gap-2 rounded-xl bg-gray-900 text-white text-sm font-medium px-4 py-3 shadow-lg animate-[portalToastIn_.2s_ease-out]">
            <span className={t.tone === 'success' ? 'text-emerald-400' : 'text-amber-300'}>
              <Icon name={t.tone === 'success' ? 'checkCircle' : 'chat'} className="w-5 h-5" />
            </span>
            {t.message}
          </div>
        ))}
      </div>
      <style>{'@keyframes portalToastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}'}</style>
    </ToastCtx.Provider>
  )
}

export function useToast() { return useContext(ToastCtx) }

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** Cierra con Escape y bloquea el scroll del fondo mientras `active`. */
export function useModalBehavior(active, onClose) {
  useEffect(() => {
    if (!active) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [active, onClose])
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** "YYYY-MM-DD" → "jue 2 oct" (sin aritmética de zona horaria: el string ya viene en la TZ del proyecto). */
export function friendlyDate(ymd, { weekday = true } = {}) {
  if (!ymd) return null
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const base = `${d} ${MONTHS_SHORT[m - 1]}`
  const withYear = y !== new Date().getFullYear() ? `${base} ${y}` : base
  return weekday ? `${WEEKDAYS[date.getDay()]} ${withYear}` : withYear
}
