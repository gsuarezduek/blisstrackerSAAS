import { Zap } from 'lucide-react'
import { Icon } from '../../ui/Icon'
// Piezas de navegación/UI reutilizadas por todo el Scorecard EOS: badge
// "Automático", navegación de año, encabezado de período (‹ Hoy ›) y las
// pestañas Datos/Notas/Histórico.

// Badge "Automático" reutilizable — solo el rayo (el icono ya comunica que es automático).
export function AutoBadge({ className = '' }) {
  return (
    <span title="Dato automático"
      className={`inline-flex items-center justify-center w-4 h-4 rounded text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 ${className}`}>
      <Icon as={Zap} size={10} />
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// YearNav — navegación de año con botón "Hoy"
// ═══════════════════════════════════════════════════════════════════════════════

export function YearNav({ year, onPrev, onNext, isCurrentYear, onToday }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onPrev}
        title="Año anterior"
        className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-semibold"
      >‹</button>
      <span className="text-sm font-bold text-gray-800 dark:text-gray-100 w-12 text-center tabular-nums select-none">
        {year}
      </span>
      <button
        onClick={onNext}
        title="Año siguiente"
        className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-semibold"
      >›</button>
      {!isCurrentYear && (
        <button
          onClick={onToday}
          className="ml-1 px-2.5 py-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 border border-primary-200 dark:border-primary-700 rounded-lg transition-colors"
        >
          Hoy
        </button>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PeriodNavHeader — badge "Ahora"/"Cargar atrasado" + título + navegación
// ‹ Hoy › de un período puntual. Compartido por CurrentPeriodPanel (tab Datos)
// y MonthNotesPanel (tab Notas): ambos operan sobre el mismo período, con el
// mismo control de navegación.
// ═══════════════════════════════════════════════════════════════════════════════

export function PeriodNavHeader({ title, subtitle, isCurrent, canGoForward, onPrev, onNext, onToday, extra }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <span className={`px-2 py-0.5 text-white text-[10px] font-bold uppercase tracking-wider rounded ${
          isCurrent ? 'bg-primary-600' : 'bg-gray-500 dark:bg-gray-600'
        }`}>
          {isCurrent ? 'Ahora' : 'Cargar atrasado'}
        </span>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        {subtitle && <span className="text-xs text-gray-500 dark:text-gray-400">· {subtitle}</span>}
        {extra}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onPrev}
          title="Período anterior"
          className="w-7 h-7 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-colors text-sm font-semibold"
        >‹</button>
        {!isCurrent && (
          <button
            onClick={onToday}
            className="px-2.5 py-1 text-xs font-medium text-primary-700 dark:text-primary-300 bg-white dark:bg-gray-800 hover:bg-primary-50 dark:hover:bg-primary-900/30 border border-primary-300 dark:border-primary-700 rounded-lg transition-colors"
          >
            Hoy
          </button>
        )}
        <button
          onClick={onNext}
          disabled={!canGoForward}
          title={canGoForward ? 'Período siguiente' : 'No se puede avanzar al futuro'}
          className="w-7 h-7 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-white dark:hover:bg-gray-700 transition-colors text-sm font-semibold disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
        >›</button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SectionTabs — Datos / Notas / Histórico
// ═══════════════════════════════════════════════════════════════════════════════

export function SectionTabs({ tabs, active, onChange }) {
  return (
    <div className="flex items-center gap-1 mb-4 border-b border-gray-100 dark:border-gray-700">
      {tabs.map(t => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`relative px-3.5 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
            active === t.key
              ? 'text-primary-700 dark:text-primary-300'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {t.label}
          {t.dot && <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />}
          {active === t.key && (
            <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary-600 rounded-full" />
          )}
        </button>
      ))}
    </div>
  )
}
