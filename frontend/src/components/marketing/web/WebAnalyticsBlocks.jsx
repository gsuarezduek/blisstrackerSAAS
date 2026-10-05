import { useState } from 'react'
import { Target, Zap } from 'lucide-react'
import { Icon } from '../../ui/Icon'
import { fmt, deltaColor, deltaIcon } from './webTabHelpers'

export function MetricCard({ label, value, sub, highlight, delta, deltaPositivo }) {
  const hasDelta = delta != null && delta !== 0
  return (
    <div className={`rounded-xl p-4 ${highlight
      ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800'
      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'}`
    }>
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${highlight
        ? 'text-primary-700 dark:text-primary-300'
        : 'text-gray-900 dark:text-white'}`}
      >
        {value ?? '—'}
      </p>
      <div className="flex items-center gap-2 mt-1">
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
        {hasDelta && (
          <span className={`text-xs font-medium ${deltaColor(delta, deltaPositivo)}`}>
            {deltaIcon(delta, deltaPositivo)} {Math.abs(delta)}%
          </span>
        )}
      </div>
    </div>
  )
}

export function SectionTitle({ children }) {
  return (
    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
      {children}
    </h3>
  )
}

const CONVERSION_RECOMMENDATIONS = [
  {
    event:    'generate_lead',
    label:    'Formulario de contacto',
    desc:     'Marcá el envío de formularios como conversión. Es el más valioso para negocios de servicios.',
    priority: 'alta',
  },
  {
    event:    'purchase',
    label:    'Compra / Transacción',
    desc:     'Si tenés e-commerce, activá el seguimiento de compras con el parámetro value.',
    priority: 'alta',
  },
  {
    event:    'click',
    label:    'Click en WhatsApp o teléfono',
    desc:     'Trackeá clicks en el botón de WhatsApp o en el número de teléfono.',
    priority: 'alta',
  },
  {
    event:    'file_download',
    label:    'Descarga de catálogo o PDF',
    desc:     'Si ofrecés material descargable, cada descarga es una señal de interés.',
    priority: 'media',
  },
  {
    event:    'scroll',
    label:    'Scroll al 90%',
    desc:     'Usuarios que leyeron casi toda la página. Activalo en GA4 desde Medición mejorada.',
    priority: 'media',
  },
  {
    event:    'view_item',
    label:    'Vista de producto o servicio clave',
    desc:     'Marcá como conversión cuando alguien llega a una página de servicio o producto específico.',
    priority: 'baja',
  },
]

const PRIORITY_STYLES = {
  alta:  'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  media: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  baja:  'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
}

export function AllEventsBlock({ allEvents }) {
  const [expanded, setExpanded] = useState(false)
  if (!allEvents || allEvents.total === 0) return null

  const maxCount = allEvents.events[0]?.eventCount || 1
  const visible  = expanded ? allEvents.events : allEvents.events.slice(0, 5)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <SectionTitle>Total de eventos</SectionTitle>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900 dark:text-white">
              {fmt(allEvents.total)}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              eventos en el período
            </span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Suma de todos los tipos de eventos registrados
          </p>
        </div>
        <span><Icon as={Zap} size={28} className="inline-block text-gray-300 dark:text-gray-600" /></span>
      </div>

      <div className="space-y-2">
        {visible.map((ev, i) => {
          const p = Math.round((ev.eventCount / maxCount) * 100)
          return (
            <div key={i}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-mono text-gray-700 dark:text-gray-300">{ev.eventName}</span>
                <span className="text-gray-500 tabular-nums">{fmt(ev.eventCount)}</span>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-400 dark:bg-blue-500 rounded-full transition-all"
                  style={{ width: `${p}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {allEvents.events.length > 5 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-3 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          {expanded ? '▲ Ver menos' : `▼ Ver todos (${allEvents.events.length})`}
        </button>
      )}
    </div>
  )
}

export function ConversionsBlock({ conversions, sessions }) {
  if (!conversions) return null

  if (conversions.hasConversions) {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <SectionTitle>Eventos clave (conversiones)</SectionTitle>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-green-700 dark:text-green-300">
                {fmt(conversions.total)}
              </span>
              <span className="text-sm text-green-600 dark:text-green-400">
                conversiones totales
              </span>
            </div>
            {sessions > 0 && (
              <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                Tasa global: {fmt((conversions.total / sessions) * 100, 2)}% de las sesiones
              </p>
            )}
          </div>
          <span><Icon as={Target} size={28} className="inline-block text-gray-300 dark:text-gray-600" /></span>
        </div>

        <div className="space-y-2">
          {conversions.events.map((ev, i) => {
            const maxConv = conversions.events[0]?.conversions || 1
            const p = Math.round((ev.conversions / maxConv) * 100)
            return (
              <div key={i}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-mono text-gray-700 dark:text-gray-300">{ev.eventName}</span>
                  <span className="text-gray-500 tabular-nums">
                    {fmt(ev.conversions)}
                  </span>
                </div>
                <div className="h-1.5 bg-green-100 dark:bg-green-900/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${p}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Sin conversiones → recomendaciones
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-start justify-between mb-1">
        <SectionTitle>Eventos clave (conversiones)</SectionTitle>
        <span><Icon as={Target} size={24} className="inline-block text-gray-300 dark:text-gray-600" /></span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        No hay conversiones configuradas en este período. Las conversiones te permiten medir acciones
        clave de tus visitantes. Estas son las más recomendadas:
      </p>
      <div className="space-y-3">
        {CONVERSION_RECOMMENDATIONS.map((rec, i) => (
          <div key={i} className="flex gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                  {rec.label}
                </span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${PRIORITY_STYLES[rec.priority]}`}>
                  {rec.priority}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{rec.desc}</p>
              <p className="text-[11px] font-mono text-gray-400 mt-1">{rec.event}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-4">
        Para configurarlas: Google Analytics → Administrar → Eventos → marcar como conversión.
      </p>
    </div>
  )
}
