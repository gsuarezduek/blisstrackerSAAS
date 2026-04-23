import { useState, useEffect } from 'react'
import api from '../../api/client'

const DATE_RANGES = [
  { value: '7daysAgo',  label: 'Últimos 7 días' },
  { value: '30daysAgo', label: 'Últimos 30 días' },
  { value: '90daysAgo', label: 'Últimos 90 días' },
]

const DEVICE_ICONS = { desktop: '🖥️', mobile: '📱', tablet: '📲' }
const CHANNEL_COLORS = [
  'bg-primary-500', 'bg-blue-500', 'bg-green-500',
  'bg-purple-500',  'bg-yellow-500', 'bg-pink-500',
  'bg-indigo-500',  'bg-teal-500',
]

function fmt(n, decimals = 0) {
  if (n == null || n === '' || isNaN(n)) return '—'
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: decimals })
}
function fmtDuration(seconds) {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${String(s).padStart(2, '0')}s`
}
function pct(value, total) {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

function MetricCard({ label, value, icon, sub, highlight }) {
  return (
    <div className={`rounded-xl p-4 ${highlight
      ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800'
      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'}`
    }>
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        {icon && <span className="text-base">{icon}</span>}
      </div>
      <p className={`text-2xl font-bold ${highlight
        ? 'text-primary-700 dark:text-primary-300'
        : 'text-gray-900 dark:text-white'}`}
      >
        {value ?? '—'}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }) {
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

function ConversionsBlock({ conversions, sessions }) {
  if (!conversions) return null

  if (conversions.hasConversions) {
    const topRate = conversions.events[0]?.conversionRate
    return (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <SectionTitle>Conversiones</SectionTitle>
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
          <span className="text-3xl">🎯</span>
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
        <SectionTitle>Conversiones</SectionTitle>
        <span className="text-2xl">🎯</span>
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

export default function WebTab() {
  const [projects,    setProjects]    = useState([])
  const [projectId,   setProjectId]   = useState('')
  const [dateRange,   setDateRange]   = useState('30daysAgo')
  const [analytics,   setAnalytics]   = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [errorStatus, setErrorStatus] = useState(null)
  const [error,       setError]       = useState('')

  useEffect(() => {
    api.get('/projects').then(r => {
      setProjects(r.data)
      if (r.data.length > 0) setProjectId(String(r.data[0].id))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    setError('')
    setErrorStatus(null)
    setAnalytics(null)

    api.get(`/marketing/projects/${projectId}/analytics?dateRange=${dateRange}`)
      .then(r => setAnalytics(r.data))
      .catch(e => {
        const status = e.response?.status
        const body   = e.response?.data
        if (status === 404)                        setErrorStatus('no_integration')
        else if (body?.status === 'no_property')   setErrorStatus('no_property')
        else if (body?.status === 'revoked' || body?.status === 'error') setErrorStatus('revoked')
        else setError(body?.error || 'Error al cargar datos')
      })
      .finally(() => setLoading(false))
  }, [projectId, dateRange])

  const ov           = analytics?.overview ?? {}
  const totalSessions = analytics?.channels?.reduce((s, c) => s + c.sessions, 0) || 0
  const dateLabel    = DATE_RANGES.find(d => d.value === dateRange)?.label

  return (
    <div className="space-y-5">

      {/* Controles */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
            Proyecto
          </label>
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {projects.map(p => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="w-[180px]">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
            Período
          </label>
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {DATE_RANGES.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
        {analytics?.websiteUrl && (
          <a
            href={analytics.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 hover:underline pb-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
            </svg>
            Ver sitio
          </a>
        )}
      </div>

      {/* Estados de error */}
      {errorStatus === 'no_integration' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-8 text-center">
          <div className="text-3xl mb-3">📊</div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
            Google Analytics no está conectado para este proyecto
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Conectalo desde <strong>Mis Proyectos → [Proyecto] → Info</strong>
          </p>
        </div>
      )}
      {errorStatus === 'no_property' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-8 text-center">
          <div className="text-3xl mb-3">🔢</div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
            Falta el GA4 Property ID
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Ingresalo en <strong>Mis Proyectos → [Proyecto] → Info → Integraciones Google</strong>
          </p>
        </div>
      )}
      {errorStatus === 'revoked' && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-2xl p-8 text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">
            La conexión con Google Analytics expiró
          </p>
          <p className="text-xs text-red-500 dark:text-red-400">
            Desconectá y volvé a conectar desde la tab Info del proyecto
          </p>
        </div>
      )}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-2xl p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="inline-block w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-gray-400">Cargando datos de Google Analytics…</p>
        </div>
      )}

      {/* Dashboard */}
      {analytics && !loading && (
        <>
          {/* Métricas principales */}
          <div>
            <SectionTitle>Resumen · {dateLabel}</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <MetricCard
                label="Sesiones"
                value={fmt(ov.sessions)}
                icon="📈"
                highlight
              />
              <MetricCard
                label="Usuarios activos"
                value={fmt(ov.activeUsers)}
                icon="👥"
              />
              <MetricCard
                label="Nuevos usuarios"
                value={fmt(ov.newUsers)}
                icon="✨"
                sub={ov.sessions ? `${pct(ov.newUsers, ov.sessions)}% del total` : undefined}
              />
              <MetricCard
                label="Páginas vistas"
                value={fmt(ov.screenPageViews)}
                icon="📄"
                sub={ov.sessions ? `${fmt(ov.screenPageViews / ov.sessions, 1)} por sesión` : undefined}
              />
              <MetricCard
                label="Tasa de rebote"
                value={ov.bounceRate != null ? `${fmt(ov.bounceRate * 100, 1)}%` : '—'}
                icon="↩️"
              />
              <MetricCard
                label="Duración media"
                value={fmtDuration(ov.averageSessionDuration)}
                icon="⏱️"
              />
            </div>
          </div>

          {/* Conversiones */}
          <ConversionsBlock conversions={analytics.conversions} sessions={ov.sessions} />

          {/* Canales + Dispositivos */}
          <div className="grid sm:grid-cols-5 gap-4">

            {/* Canales — 3/5 */}
            {analytics.channels?.length > 0 && (
              <div className="sm:col-span-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                <SectionTitle>Canales de tráfico</SectionTitle>
                <div className="space-y-3">
                  {analytics.channels.map((ch, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-medium">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${CHANNEL_COLORS[i % CHANNEL_COLORS.length]}`} />
                          {ch.channel || 'Directo'}
                        </span>
                        <span className="text-gray-500 tabular-nums">
                          {fmt(ch.sessions)} ses.
                          <span className="ml-1.5 text-gray-400">
                            ({pct(ch.sessions, totalSessions)}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${CHANNEL_COLORS[i % CHANNEL_COLORS.length]}`}
                          style={{ width: `${pct(ch.sessions, totalSessions)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dispositivos — 2/5 */}
            {analytics.devices?.length > 0 && (
              <div className="sm:col-span-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                <SectionTitle>Dispositivos</SectionTitle>
                <div className="space-y-4">
                  {analytics.devices.map((d, i) => {
                    const totalDev = analytics.devices.reduce((s, x) => s + x.sessions, 0)
                    const p = pct(d.sessions, totalDev)
                    const icon = DEVICE_ICONS[d.channel?.toLowerCase()] ?? '💻'
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-gray-700 dark:text-gray-300 capitalize flex items-center gap-1.5">
                            <span>{icon}</span>
                            {d.channel}
                          </span>
                          <span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums">
                            {p}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${p}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 text-right tabular-nums">
                          {fmt(d.sessions)} sesiones
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Top páginas */}
          {analytics.topPages?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <SectionTitle>Top páginas</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
                      <th className="pb-2 font-medium w-6">#</th>
                      <th className="pb-2 font-medium">Página</th>
                      <th className="pb-2 font-medium text-right w-20">Vistas</th>
                      <th className="pb-2 font-medium text-right w-20">Sesiones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {analytics.topPages.map((page, i) => (
                      <tr key={i} className="group">
                        <td className="py-2.5 text-gray-400">{i + 1}</td>
                        <td className="py-2.5 pr-4">
                          <p className="font-mono text-gray-700 dark:text-gray-300 truncate max-w-[280px]">
                            {page.path}
                          </p>
                          {page.title && page.title !== page.path && (
                            <p className="text-gray-400 truncate max-w-[280px]">{page.title}</p>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                          {fmt(page.pageviews)}
                        </td>
                        <td className="py-2.5 text-right text-gray-500 tabular-nums">
                          {fmt(page.sessions)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Footer */}
          <p className="text-xs text-gray-400 text-right">
            Datos de Google Analytics · Actualizado:{' '}
            {analytics.fetchedAt
              ? new Date(analytics.fetchedAt).toLocaleString('es-AR')
              : '—'}
          </p>
        </>
      )}
    </div>
  )
}
