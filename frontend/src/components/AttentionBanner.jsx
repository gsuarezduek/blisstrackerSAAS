// Banner de "esto necesita tu atención" — se monta arriba de todo, antes de la
// grilla de métricas crudas, en paneles densos (RRHH, Productividad). Mismo
// espíritu que DailyInsightBlock (frontend/src/pages/DashboardParts.jsx) pero
// alimentado por datos ya calculados en el panel (no tiene fetch propio).
const SEVERITY_STYLES = {
  critical: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  warning:  'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
  info:     'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
}
const SEVERITY_TEXT = {
  critical: 'text-red-700 dark:text-red-400',
  warning:  'text-amber-700 dark:text-amber-400',
  info:     'text-gray-600 dark:text-gray-400',
}
const SEVERITY_ICON = { critical: '⚠️', warning: '🎯', info: '💡' }

export default function AttentionBanner({ items = [], emptyLabel = '✅ Nadie necesita atención.' }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2.5 border rounded-xl px-4 py-3 mb-3 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
        <span className="text-sm font-medium text-green-700 dark:text-green-400">{emptyLabel}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 mb-3">
      {items.map(item => {
        const severity = item.severity || 'info'
        const Tag = item.onClick ? 'button' : 'div'
        return (
          <Tag
            key={item.id}
            onClick={item.onClick}
            className={`flex items-center gap-2.5 border rounded-xl px-4 py-3 text-left w-full ${SEVERITY_STYLES[severity]} ${
              item.onClick ? 'cursor-pointer hover:brightness-95 dark:hover:brightness-110 transition-all' : ''
            }`}
          >
            <span className="text-base flex-shrink-0">{SEVERITY_ICON[severity]}</span>
            <span className={`text-sm font-semibold leading-snug flex-1 min-w-0 ${SEVERITY_TEXT[severity]}`}>{item.label}</span>
            {item.detail && (
              <span className={`text-xs flex-shrink-0 ${SEVERITY_TEXT[severity]} opacity-75`}>{item.detail}</span>
            )}
            {item.onClick && (
              <span className={`flex-shrink-0 ${SEVERITY_TEXT[severity]} opacity-60`}>→</span>
            )}
          </Tag>
        )
      })}
    </div>
  )
}
