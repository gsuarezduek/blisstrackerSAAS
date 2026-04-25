import { useState, useEffect } from 'react'
import api from '../../api/client'

function geoBandColor(band) {
  if (band === 'Excelente') return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
  if (band === 'Bueno')     return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
  if (band === 'Base')      return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
  return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
}

function DeltaChip({ delta }) {
  if (delta == null) return null
  const up    = delta > 0
  const color = up ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
  return (
    <span className={`text-sm font-medium ${color}`}>
      {up ? '↑' : '↓'} {Math.abs(delta)}%
    </span>
  )
}

function KpiCard({ icon, title, value, sub, badge, emptyMsg, linkLabel, onLink }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        {badge}
      </div>
      <div>
        {value != null
          ? <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          : <p className="text-sm text-gray-400 dark:text-gray-500 italic">{emptyMsg}</p>
        }
        {sub && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</p>
      {linkLabel && onLink && (
        <button
          onClick={onLink}
          className="text-xs text-primary-600 dark:text-primary-400 hover:underline text-left mt-auto"
        >
          {linkLabel} →
        </button>
      )}
    </div>
  )
}

export default function SaludTab({ projectId, onNavigate }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!projectId) { setData(null); return }
    setLoading(true)
    setError(null)
    api.get(`/marketing/projects/${projectId}/health-score`)
      .then(r => setData(r.data))
      .catch(err => setError(err.response?.data?.error || 'Error al cargar el score de salud'))
      .finally(() => setLoading(false))
  }, [projectId])

  if (!projectId) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center">
        <div className="text-4xl mb-3">❤️</div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Seleccioná un proyecto para ver el score de salud.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-5 text-center">
        <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  if (!data) return null

  const { geo, keywords, traffic, performance } = data

  // GEO
  const geoValue = geo ? `${geo.score}/100` : null
  const geoBadge = geo
    ? <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${geoBandColor(geo.band)}`}>{geo.band}</span>
    : null
  const geoSub = geo
    ? `Auditoría: ${new Date(geo.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : null

  // Keywords
  const kwValue = keywords ? `Pos. ${keywords.avgPosition}` : null
  const kwSub   = keywords ? `${keywords.count} keyword${keywords.count !== 1 ? 's' : ''} · ${keywords.month}` : null

  // Traffic
  const trafficValue = traffic ? traffic.sessions.toLocaleString('es-AR') : null
  const trafficSub   = traffic
    ? <span className="flex items-center gap-1.5">
        <span>{traffic.month}</span>
        <DeltaChip delta={traffic.delta} />
      </span>
    : null

  // Performance
  const perfValue = performance
    ? (performance.mobile != null && performance.desktop != null
      ? `${performance.mobile} · ${performance.desktop}`
      : performance.mobile ?? performance.desktop ?? null)
    : null
  const perfSub = performance ? 'Móvil · Desktop' : null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KpiCard
          icon="🌐"
          title="Salud GEO"
          value={geoValue}
          sub={geoSub}
          badge={geoBadge}
          emptyMsg="Sin auditoría GEO disponible"
          linkLabel="Ver detalle"
          onLink={() => onNavigate?.('geo-seo', 'geo')}
        />
        <KpiCard
          icon="🔑"
          title="Posicionamiento"
          value={kwValue}
          sub={kwSub}
          emptyMsg="Sin keywords trackeadas este mes"
          linkLabel="Ver keywords"
          onLink={() => onNavigate?.('geo-seo', 'keywords')}
        />
        <KpiCard
          icon="📈"
          title="Tráfico"
          value={trafficValue != null ? trafficValue.toLocaleString('es-AR') : null}
          sub={trafficSub}
          emptyMsg="Sin snapshot de analytics disponible"
          linkLabel="Ver analytics"
          onLink={() => onNavigate?.('web', 'analytics')}
        />
        <KpiCard
          icon="⚡"
          title="Performance"
          value={perfValue}
          sub={perfSub}
          emptyMsg="Sin resultados de PageSpeed disponibles"
          linkLabel="Ver performance"
          onLink={() => onNavigate?.('web', 'performance')}
        />
      </div>
    </div>
  )
}
