// Primitivas visuales de Mailing (mismo lenguaje que el resto de Marketing).
import { X } from 'lucide-react'
import { Icon } from '../../ui/Icon'

export const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500'
export const btnPrimary = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-3.5 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
export const btnSecondary = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium px-3.5 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
export const btnGhost = 'inline-flex items-center gap-1 rounded-md text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50'

export function Card({ children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl ${className}`}>
      {children}
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-snug">{hint}</span>}
    </label>
  )
}

export function Modal({ title, onClose, children, footer, wide = false }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className={`bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" aria-label="Cerrar">
            <Icon as={X} size={18} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

export function ErrorNote({ children }) {
  if (!children) return null
  return <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{children}</p>
}

export function WarnNote({ children }) {
  if (!children) return null
  return <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 leading-snug">{children}</p>
}

export const CAMPAIGN_STATUS = {
  draft:     { label: 'Borrador',   cls: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' },
  scheduled: { label: 'Programada', cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
  sending:   { label: 'Enviando',   cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
  paused:    { label: 'Pausada',    cls: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' },
  sent:      { label: 'Enviada',    cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  cancelled: { label: 'Cancelada',  cls: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
}

export const CONTACT_STATUS = {
  subscribed:   { label: 'Suscripto',     cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  pending:      { label: 'Sin confirmar', cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
  unsubscribed: { label: 'Dado de baja',  cls: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' },
  bounced:      { label: 'Rebotó',        cls: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
  complained:   { label: 'Marcó spam',    cls: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
}

export function StatusPill({ map, status }) {
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${s.cls}`}>{s.label}</span>
}

export function pct(part, total) {
  if (!total) return '—'
  return `${((part / total) * 100).toFixed(1).replace('.0', '')}%`
}

export function fmtInt(n) {
  return (n ?? 0).toLocaleString('es-AR')
}

export function fmtDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function fmtDay(ymd) {
  if (!ymd) return ''
  const d = new Date(`${ymd}T12:00:00`)
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function apiError(err, fallback = 'Algo salió mal') {
  return err?.response?.data?.error || fallback
}
