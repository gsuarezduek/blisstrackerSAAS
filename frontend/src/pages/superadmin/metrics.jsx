import { useState, useEffect } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../../components/LoadingSpinner'
import { StatCard, fmtTokens } from './shared'

export function MetricChart({ title, values, axis, color = '#F7931A', fmt = v => v.toLocaleString('es-AR'), height = 64 }) {
  const [hover, setHover] = useState(null)
  const n = values.length
  const max = Math.max(1, ...values)
  const last = values[n - 1] ?? 0

  const coords = values.map((v, i) => [
    n > 1 ? (i / (n - 1)) * 100 : 0,
    100 - (v / max) * 100,
  ])
  const line = coords.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ')
  const area = `${line} L 100 100 L 0 100 Z`

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    setHover(Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1)))))
  }

  const shown = hover != null ? values[hover] : last
  const hoverLeft = hover != null && n > 1 ? (hover / (n - 1)) * 100 : 0

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{title}</h3>
        <span className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{fmt(shown)}</span>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
        {hover != null ? axis[hover] : `último · pico ${fmt(max)}`}
      </p>
      <div className="relative mt-3" style={{ height }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
          <path d={area} fill={color} opacity="0.1" />
          <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        {hover != null && (
          <div className="absolute top-0 bottom-0 w-px bg-gray-300 dark:bg-gray-500 pointer-events-none" style={{ left: `${hoverLeft}%` }} />
        )}
      </div>
    </div>
  )
}

// Embudo de conversión reutilizando GET /superadmin/conversion-funnel.
export function FunnelView({ funnel, rates }) {
  if (!funnel) return null
  const stages = [
    { label: 'Clicks en CTA',       value: funnel.ctaClicks },
    { label: 'Vistas de pricing',   value: funnel.pricingViews },
    { label: 'Signups iniciados',   value: funnel.signupStarted },
    { label: 'Signups completados', value: funnel.signupCompleted },
    { label: 'Checkouts iniciados', value: funnel.checkoutStarted },
    { label: 'Suscripciones',       value: funnel.subscriptionActive },
  ]
  const top = Math.max(1, ...stages.map(s => s.value))
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-4">Embudo de conversión</h3>
      <div className="space-y-2">
        {stages.map(s => (
          <div key={s.label}>
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-0.5">
              <span>{s.label}</span>
              <span className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">{s.value.toLocaleString('es-AR')}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div className="h-full bg-primary-500 rounded-full" style={{ width: `${Math.max(2, (s.value / top) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      {rates && (
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-center">
          <div>
            <p className="text-base font-bold text-gray-900 dark:text-white">{rates.ctaToSignupStarted ?? '—'}{rates.ctaToSignupStarted != null && '%'}</p>
            <p className="text-[11px] text-gray-400">CTA → signup</p>
          </div>
          <div>
            <p className="text-base font-bold text-gray-900 dark:text-white">{rates.signupStartedToDone ?? '—'}{rates.signupStartedToDone != null && '%'}</p>
            <p className="text-[11px] text-gray-400">signup → alta</p>
          </div>
          <div>
            <p className="text-base font-bold text-gray-900 dark:text-white">{rates.trialingToActive ?? '—'}{rates.trialingToActive != null && '%'}</p>
            <p className="text-[11px] text-gray-400">trial → activo</p>
          </div>
        </div>
      )}
    </div>
  )
}

export function SectionMetrics() {
  const [days,    setDays]    = useState(30)
  const [data,    setData]    = useState(null)
  const [funnel,  setFunnel]  = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      api.get(`/superadmin/metrics?days=${days}`),
      api.get(`/superadmin/conversion-funnel?days=${days}`),
    ])
      .then(([m, f]) => { if (alive) { setData(m.data); setFunnel(f.data) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [days])

  const periodTabs = [
    { id: 7,  label: '7 días' },
    { id: 30, label: '30 días' },
    { id: 90, label: '90 días' },
  ]

  const s = data?.summary

  return (
    <div className="space-y-6">
      {/* Header + período */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Métricas</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Actividad, crecimiento y retención de la plataforma.
          </p>
        </div>
        <div className="flex gap-1.5 bg-gray-100 dark:bg-gray-700 p-1 rounded-xl">
          {periodTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setDays(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                days === t.id
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner size="sm" className="py-16" />
      ) : !data ? (
        <p className="text-sm text-red-500 text-center py-8">Error al cargar métricas.</p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="DAU promedio" value={s.dauAvg} sub={`hoy: ${s.dauToday}`} />
            <StatCard label="WAU" value={s.wau} sub="últimos 7 días" />
            <StatCard label="MAU" value={s.mau} sub="últimos 30 días" />
            <StatCard
              label="Stickiness"
              value={s.stickiness != null ? `${s.stickiness}%` : '—'}
              sub="DAU / MAU"
              valueColor={s.stickiness != null && s.stickiness >= 20 ? 'text-green-600 dark:text-green-400' : undefined}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Nuevos workspaces" value={s.newWorkspaces} sub={`${days} días`} />
            <StatCard label="Nuevos usuarios" value={s.newUsers} sub={`${days} días`} />
            <StatCard label="Tareas creadas" value={s.tasksCreated.toLocaleString('es-AR')} sub={`${days} días`} />
            <StatCard label="Tareas completadas" value={s.tasksCompleted.toLocaleString('es-AR')} sub={`${days} días`} />
          </div>

          {/* Gráficos de tendencia */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MetricChart title="Usuarios activos (DAU)"  values={data.series.activeUsers}      axis={data.axis} color="#F7931A" />
            <MetricChart title="Workspaces activos"       values={data.series.activeWorkspaces} axis={data.axis} color="#3B82F6" />
            <MetricChart title="Tareas creadas"           values={data.series.tasksCreated}     axis={data.axis} color="#8B5CF6" />
            <MetricChart title="Tareas completadas"       values={data.series.tasksCompleted}   axis={data.axis} color="#22C55E" />
            <MetricChart title="Nuevos workspaces"        values={data.series.newWorkspaces}    axis={data.axis} color="#EC4899" />
            <MetricChart title="Tokens de IA"             values={data.series.aiTokens}         axis={data.axis} color="#14B8A6" fmt={fmtTokens} />
          </div>

          {/* Embudo + Retención */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FunnelView funnel={funnel?.funnel} rates={funnel?.rates} />

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Retención por cohorte</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 mb-4">
                Workspaces por semana de alta que siguen activos (login en últimos 14 días).
              </p>
              {data.cohorts.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Sin altas en las últimas 8 semanas.</p>
              ) : (
                <div className="space-y-2">
                  {data.cohorts.map(c => (
                    <div key={c.week} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 dark:text-gray-400 w-20 flex-shrink-0 tabular-nums">{c.week}</span>
                      <div className="flex-1 h-5 rounded-md bg-gray-100 dark:bg-gray-700 overflow-hidden relative">
                        <div
                          className={`h-full rounded-md ${c.rate >= 50 ? 'bg-green-500' : c.rate >= 25 ? 'bg-amber-500' : 'bg-red-400'}`}
                          style={{ width: `${Math.max(3, c.rate)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 dark:text-gray-300 w-24 flex-shrink-0 text-right tabular-nums">
                        {c.active}/{c.size} · {c.rate}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

