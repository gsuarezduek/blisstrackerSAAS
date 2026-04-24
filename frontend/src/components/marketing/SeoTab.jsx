import { useState, useEffect } from 'react'
import api from '../../api/client'
import ProjectSearchSelect from './ProjectSearchSelect'

// Formateadores
const fmtNum  = n => (n ?? 0).toLocaleString('es-AR')
const fmtPct  = n => `${((n ?? 0) * 100).toFixed(1)}%`
const fmtPos  = n => (n ?? 0).toFixed(1)

const PERIODS = [
  { label: 'Últimos 7 días',  days: 7  },
  { label: 'Últimos 28 días', days: 28 },
  { label: 'Últimos 90 días', days: 90 },
]

function datesFromDays(days) {
  const end   = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)
  const fmt = d => d.toISOString().slice(0, 10)
  return { startDate: fmt(start), endDate: fmt(end) }
}

function MetricCard({ label, value, sub }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function DataTable({ title, rows, cols }) {
  if (!rows?.length) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700">
              {cols.map(c => (
                <th key={c.key} className={`px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 ${c.right ? 'text-right' : 'text-left'}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                {cols.map(c => (
                  <td key={c.key} className={`px-4 py-2.5 text-gray-700 dark:text-gray-300 ${c.right ? 'text-right tabular-nums' : ''} ${c.mono ? 'font-mono text-xs' : ''} ${c.truncate ? 'max-w-[220px] truncate' : ''}`}>
                    {c.fmt ? c.fmt(row[c.key]) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DeviceBar({ devices }) {
  if (!devices?.length) return null
  const total = devices.reduce((s, d) => s + d.clicks, 0) || 1
  const COLORS = { DESKTOP: 'bg-primary-500', MOBILE: 'bg-blue-500', TABLET: 'bg-purple-400' }
  const LABELS = { DESKTOP: 'Desktop', MOBILE: 'Mobile', TABLET: 'Tablet' }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Dispositivos</h3>
      <div className="flex rounded-full overflow-hidden h-3 mb-3">
        {devices.map(d => (
          <div
            key={d.device}
            className={`${COLORS[d.device] ?? 'bg-gray-300'} transition-all`}
            style={{ width: `${(d.clicks / total) * 100}%` }}
            title={`${LABELS[d.device] ?? d.device}: ${fmtNum(d.clicks)} clicks`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {devices.map(d => (
          <div key={d.device} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <span className={`w-2.5 h-2.5 rounded-full inline-block ${COLORS[d.device] ?? 'bg-gray-300'}`} />
            {LABELS[d.device] ?? d.device}
            <span className="font-medium text-gray-800 dark:text-gray-200">{fmtNum(d.clicks)}</span>
            <span className="text-gray-400">({((d.clicks / total) * 100).toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SeoTab() {
  const [projects,   setProjects]   = useState([])
  const [projectId,  setProjectId]  = useState('')
  const [periodIdx,  setPeriodIdx]  = useState(1) // 28 días por defecto
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  // Cargar lista de proyectos
  useEffect(() => {
    api.get('/projects').then(r => setProjects(r.data)).catch(() => {})
  }, [])

  // Cargar datos cuando cambia proyecto o período
  useEffect(() => {
    if (!projectId) return
    const { startDate, endDate } = datesFromDays(PERIODS[periodIdx].days)
    setLoading(true)
    setError('')
    setData(null)
    api.get(`/marketing/projects/${projectId}/search-console`, { params: { startDate, endDate } })
      .then(r => setData(r.data))
      .catch(err => {
        const msg = err.response?.data?.error ?? 'Error al cargar datos'
        const status = err.response?.data?.status
        if (status === 'no_site_url') {
          setError('Este proyecto no tiene URL de sitio configurada. Agregala en la tab Info del proyecto.')
        } else {
          setError(msg)
        }
      })
      .finally(() => setLoading(false))
  }, [projectId, periodIdx])

  const overview = data?.overview

  return (
    <div className="space-y-5">

      {/* Controles */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Proyecto</label>
          <ProjectSearchSelect
            projects={projects}
            value={projectId}
            onChange={setProjectId}
            placeholder="Buscar proyecto…"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Período</label>
          <select
            value={periodIdx}
            onChange={e => setPeriodIdx(Number(e.target.value))}
            className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {PERIODS.map((p, i) => (
              <option key={i} value={i}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Estado vacío */}
      {!projectId && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Seleccioná un proyecto para ver los datos de Search Console</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
          {error.includes('no conectado') && (
            <span className="ml-1">Conectalo en <strong>Proyectos → Info → Integraciones Google</strong>.</span>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Datos */}
      {data && !loading && (
        <>
          {/* Métricas overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Clicks"       value={fmtNum(overview.clicks)}      />
            <MetricCard label="Impresiones"  value={fmtNum(overview.impressions)} />
            <MetricCard label="CTR promedio" value={fmtPct(overview.ctr)}         />
            <MetricCard label="Posición media" value={fmtPos(overview.position)}  sub="más bajo = mejor" />
          </div>

          {/* Dispositivos */}
          {data.devices?.length > 0 && <DeviceBar devices={data.devices} />}

          {/* Top queries + top páginas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DataTable
              title="Top consultas"
              rows={data.topQueries}
              cols={[
                { key: 'query',       label: 'Consulta',    truncate: true },
                { key: 'clicks',      label: 'Clicks',      right: true, fmt: fmtNum },
                { key: 'impressions', label: 'Impres.',     right: true, fmt: fmtNum },
                { key: 'position',    label: 'Posición',    right: true, fmt: fmtPos },
              ]}
            />
            <DataTable
              title="Top páginas"
              rows={data.topPages}
              cols={[
                { key: 'page',        label: 'Página',      truncate: true, mono: true },
                { key: 'clicks',      label: 'Clicks',      right: true, fmt: fmtNum },
                { key: 'impressions', label: 'Impres.',     right: true, fmt: fmtNum },
                { key: 'position',    label: 'Posición',    right: true, fmt: fmtPos },
              ]}
            />
          </div>

          {/* Países */}
          {data.countries?.length > 0 && (
            <DataTable
              title="Top países"
              rows={data.countries}
              cols={[
                { key: 'country',     label: 'País',        fmt: c => c?.toUpperCase() },
                { key: 'clicks',      label: 'Clicks',      right: true, fmt: fmtNum },
                { key: 'impressions', label: 'Impresiones', right: true, fmt: fmtNum },
              ]}
            />
          )}

          <p className="text-xs text-gray-400 text-right">
            Sitio: <span className="font-mono">{data.siteUrl}</span>
            {' · '}{data.startDate} → {data.endDate}
          </p>
        </>
      )}
    </div>
  )
}
