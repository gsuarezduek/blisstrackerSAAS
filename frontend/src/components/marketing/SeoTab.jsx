import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'

// ─── Formateadores ────────────────────────────────────────────────────────────
const fmtNum = n => (n ?? 0).toLocaleString('es-AR')
const fmtPct = n => `${((n ?? 0) * 100).toFixed(1)}%`
const fmtPos = n => (n ?? 0).toFixed(1)

// ─── Fechas — Search Console solo acepta YYYY-MM-DD ──────────────────────────
const PRESET_RANGES = [
  { value: 'thisMonth', label: 'Este mes' },
  { value: 'lastMonth', label: 'Mes anterior' },
  { value: '90daysAgo', label: 'Últimos 90 días' },
  { value: 'custom',    label: 'Personalizado' },
]

function todayStr() { return new Date().toISOString().slice(0, 10) }

function getDateParams(range, customStart, customEnd) {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth()
  const pad   = n => String(n).padStart(2, '0')

  if (range === 'thisMonth') {
    return { startDate: `${year}-${pad(month + 1)}-01`, endDate: todayStr() }
  }
  if (range === 'lastMonth') {
    const lm      = month === 0 ? 11 : month - 1
    const lmYear  = month === 0 ? year - 1 : year
    const lastDay = new Date(lmYear, lm + 1, 0).getDate()
    return { startDate: `${lmYear}-${pad(lm + 1)}-01`, endDate: `${lmYear}-${pad(lm + 1)}-${pad(lastDay)}` }
  }
  if (range === '90daysAgo') {
    const start = new Date(); start.setDate(start.getDate() - 90)
    return { startDate: start.toISOString().slice(0, 10), endDate: todayStr() }
  }
  return { startDate: customStart || todayStr(), endDate: customEnd || todayStr() }
}

// ─── Componentes de UI ────────────────────────────────────────────────────────
function MetricCard({ label, value, sub }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function DeviceBar({ devices }) {
  if (!devices?.length) return null
  const total  = devices.reduce((s, d) => s + d.clicks, 0) || 1
  const COLORS = { DESKTOP: 'bg-primary-500', MOBILE: 'bg-blue-500', TABLET: 'bg-purple-400' }
  const LABELS = { DESKTOP: 'Desktop', MOBILE: 'Mobile', TABLET: 'Tablet' }
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Dispositivos</h3>
      <div className="flex rounded-full overflow-hidden h-3 mb-3">
        {devices.map(d => (
          <div key={d.device} className={`${COLORS[d.device] ?? 'bg-gray-300'} transition-all`}
            style={{ width: `${(d.clicks / total) * 100}%` }}
            title={`${LABELS[d.device] ?? d.device}: ${fmtNum(d.clicks)} clicks`} />
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

// Fila expandible de query con páginas rankeando
function QueryRow({ row, comparison, startDate, endDate, projectId }) {
  const [expanded, setExpanded] = useState(false)
  const [pages,    setPages]    = useState(null)
  const [loading,  setLoading]  = useState(false)

  async function toggle() {
    if (!expanded && pages === null) {
      setLoading(true)
      try {
        const { data } = await api.get(
          `/marketing/projects/${projectId}/search-console/query-pages`,
          { params: { query: row.query, startDate, endDate } }
        )
        setPages(data.pages)
      } catch { setPages([]) }
      finally { setLoading(false) }
    }
    setExpanded(e => !e)
  }

  const comp = comparison?.find(c => c.query === row.query)
  const hasDrop  = comp?.positionDelta != null && comp.positionDelta > 3
  const hasGain  = comp?.positionDelta != null && comp.positionDelta < -3

  return (
    <>
      <tr
        onClick={toggle}
        className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
      >
        <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">
          <span className="flex items-center gap-1.5">
            <span className="text-gray-400 text-[10px]">{expanded ? '▼' : '▶'}</span>
            {row.query}
          </span>
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(row.clicks)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(row.impressions)}</td>
        <td className="px-4 py-2.5 text-right tabular-nums">{fmtPos(row.position)}
          {hasDrop && (
            <span className="ml-1.5 text-[10px] font-semibold text-red-500 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full">
              ↓ {comp.positionDelta.toFixed(1)}
            </span>
          )}
          {hasGain && (
            <span className="ml-1.5 text-[10px] font-semibold text-green-600 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">
              ↑ {Math.abs(comp.positionDelta).toFixed(1)}
            </span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-700/20">
          <td colSpan={4} className="px-6 py-3">
            {loading
              ? <div className="flex items-center gap-2 text-xs text-gray-400"><div className="w-3 h-3 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />Cargando páginas…</div>
              : pages?.length > 0
              ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="text-left pb-1 font-medium">Página</th>
                      <th className="text-right pb-1 font-medium w-16">Clicks</th>
                      <th className="text-right pb-1 font-medium w-16">Pos.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pages.map((p, i) => (
                      <tr key={i}>
                        <td className="pr-4 py-1 text-primary-600 dark:text-primary-400 font-mono truncate max-w-[280px]">{p.page}</td>
                        <td className="py-1 text-right tabular-nums text-gray-600 dark:text-gray-400">{fmtNum(p.clicks)}</td>
                        <td className="py-1 text-right tabular-nums text-gray-600 dark:text-gray-400">{fmtPos(p.position)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
              : <p className="text-xs text-gray-400">Sin datos de páginas para esta query.</p>
            }
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function SeoTab({ projectId, projects }) {
  const [rangePreset,  setRangePreset]  = useState('thisMonth')
  const [customStart,  setCustomStart]  = useState(todayStr())
  const [customEnd,    setCustomEnd]    = useState(todayStr())
  const [appliedRange, setAppliedRange] = useState({ preset: 'thisMonth', start: '', end: '' })
  const [device,       setDevice]       = useState(null) // null = todos, 'MOBILE', 'DESKTOP'
  const [data,         setData]         = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')

  const isMonthlyPreset = appliedRange.preset === 'thisMonth' || appliedRange.preset === 'lastMonth'

  useEffect(() => {
    if (!projectId) return
    const { startDate, endDate } = getDateParams(appliedRange.preset, appliedRange.start, appliedRange.end)
    setLoading(true)
    setError('')
    setData(null)
    const params = { startDate, endDate }
    if (device)          params.device  = device
    if (isMonthlyPreset) params.compare = 'true'

    api.get(`/marketing/projects/${projectId}/search-console`, { params })
      .then(r => setData(r.data))
      .catch(err => {
        const msg    = err.response?.data?.error ?? 'Error al cargar datos'
        const status = err.response?.data?.status
        if (status === 'no_site_url') {
          setError('Este proyecto no tiene URL de sitio configurada. Agregala en la tab Info del proyecto.')
        } else {
          setError(msg)
        }
      })
      .finally(() => setLoading(false))
  }, [projectId, appliedRange, device])

  function handleRangeChange(val) {
    setRangePreset(val)
    if (val !== 'custom') setAppliedRange({ preset: val, start: '', end: '' })
  }

  function handleApplyCustom() {
    if (!customStart || !customEnd || customStart > customEnd) return
    setAppliedRange({ preset: 'custom', start: customStart, end: customEnd })
  }

  const overview   = data?.overview
  const { startDate, endDate } = getDateParams(appliedRange.preset, appliedRange.start, appliedRange.end)
  const comparison = data?.topQueriesComparison

  return (
    <div className="space-y-5">

      {/* Controles */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Período</label>
          <select
            value={rangePreset}
            onChange={e => handleRangeChange(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {PRESET_RANGES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        {rangePreset === 'custom' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Desde</label>
              <input type="date" value={customStart} max={customEnd || todayStr()}
                onChange={e => setCustomStart(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Hasta</label>
              <input type="date" value={customEnd} min={customStart} max={todayStr()}
                onChange={e => setCustomEnd(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <button onClick={handleApplyCustom} disabled={!customStart || !customEnd || customStart > customEnd}
              className="px-4 py-2.5 text-sm bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors self-end">
              Aplicar
            </button>
          </>
        )}

        {/* Filtro dispositivo */}
        <div className="flex rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden text-xs self-end">
          {[
            { val: null,      label: 'Todos' },
            { val: 'MOBILE',  label: '📱 Mobile' },
            { val: 'DESKTOP', label: '🖥️ Desktop' },
          ].map(d => (
            <button key={String(d.val)} onClick={() => setDevice(d.val)}
              className={`px-3 py-2 transition-colors ${
                device === d.val
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Estado vacío */}
      {!projectId && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Seleccioná un proyecto arriba para ver los datos de Search Console</p>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Clicks"         value={fmtNum(overview.clicks)}      />
            <MetricCard label="Impresiones"    value={fmtNum(overview.impressions)} />
            <MetricCard label="CTR promedio"   value={fmtPct(overview.ctr)}         />
            <MetricCard label="Posición media" value={fmtPos(overview.position)} sub="más bajo = mejor" />
          </div>

          {data.devices?.length > 0 && <DeviceBar devices={data.devices} />}

          {/* Top consultas — expandible */}
          {data.topQueries?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top consultas</h3>
                {comparison && (
                  <span className="text-[10px] text-gray-400">Click en una fila para ver páginas</span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-left">Consulta</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Clicks</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Impres.</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Posición</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topQueries.map((row, i) => (
                      <QueryRow
                        key={i}
                        row={row}
                        comparison={comparison}
                        startDate={startDate}
                        endDate={endDate}
                        projectId={projectId}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top páginas */}
          {data.topPages?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top páginas</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      {[
                        { key: 'page',        label: 'Página' },
                        { key: 'clicks',      label: 'Clicks',   right: true },
                        { key: 'impressions', label: 'Impres.',  right: true },
                        { key: 'position',    label: 'Posición', right: true },
                      ].map(c => (
                        <th key={c.key} className={`px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 ${c.right ? 'text-right' : 'text-left'}`}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.topPages.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-700 dark:text-gray-300 max-w-[220px] truncate">{row.page}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtNum(row.clicks)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtNum(row.impressions)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtPos(row.position)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Oportunidades de CTR */}
          {data.opportunityPages?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Oportunidades de CTR</h3>
                <p className="text-xs text-gray-400 mt-0.5">Páginas con muchas impresiones pero CTR bajo (&lt;5%)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-left">Página</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Impresiones</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">CTR actual</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Posición</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.opportunityPages.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-700 dark:text-gray-300 max-w-[220px] truncate">{row.page}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtNum(row.impressions)}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${row.ctr < 0.03 ? 'text-red-500' : 'text-orange-500'}`}>
                          {fmtPct(row.ctr)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{fmtPos(row.position)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="text-[10px] font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                            Mejorar meta
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.countries?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top países</h3>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {data.countries.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                      <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 uppercase text-xs font-medium">{row.country}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-400">{fmtNum(row.clicks)} clicks</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{fmtNum(row.impressions)} impres.</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
