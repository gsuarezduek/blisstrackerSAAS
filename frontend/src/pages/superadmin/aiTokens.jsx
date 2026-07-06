import { useState, useEffect } from 'react'
import api from '../../api/client'
import { fmtTokens, fmtCost } from './shared'

export const SERVICE_LABELS = {
  insight:         'Insight diario',
  weeklyReport:    'Resumen semanal',
  insightMemory:   'Memoria de insights',
  geoAudit:        'Auditoría GEO',
  analyticsInsight:'Análisis Analytics',
  pageSpeed:       'PageSpeed',
}

export function serviceLabel(key) {
  return SERVICE_LABELS[key] || key
}

export function TokenBar({ value, max, color = 'bg-primary-500' }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function SectionAiTokens() {
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [period,   setPeriod]   = useState('all')
  const [expanded, setExpanded] = useState(null)   // workspaceId expandido

  async function load(p) {
    setLoading(true)
    try {
      const { data: res } = await api.get(`/superadmin/ai-tokens?period=${p}`)
      setData(res)
    } finally { setLoading(false) }
  }

  useEffect(() => { load(period) }, [period])

  function toggleExpanded(wsId) {
    setExpanded(prev => prev === wsId ? null : wsId)
  }

  const maxWsTotal    = data?.byWorkspace?.[0]?.total ?? 1
  const maxSvcTotal   = data?.byService?.[0]?.total   ?? 1

  const periodTabs = [
    { id: 'all',  label: 'Todo el tiempo' },
    { id: '30d',  label: 'Últimos 30 días' },
    { id: '7d',   label: 'Últimos 7 días' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">IA & Tokens</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Consumo de tokens de Claude Haiku por workspace y servicio.
          </p>
        </div>

        {/* Filtro de período */}
        <div className="flex gap-1.5 bg-gray-100 dark:bg-gray-700 p-1 rounded-xl">
          {periodTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setPeriod(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                period === t.id
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
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data ? (
        <p className="text-sm text-red-500 text-center py-8">Error al cargar datos de IA.</p>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tokens totales</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmtTokens(data.totalTokens)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {fmtTokens(data.totalInputTokens)} in · {fmtTokens(data.totalOutputTokens)} out
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Costo estimado</p>
              <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">{fmtCost(data.estimatedCostUsd)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">USD · Claude Haiku</p>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Workspace top</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white mt-1 truncate">
                {data.byWorkspace?.[0]?.name ?? '—'}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {data.byWorkspace?.[0] ? fmtTokens(data.byWorkspace[0].total) + ' tokens' : 'sin datos'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Servicio top</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white mt-1 truncate">
                {data.byService?.[0] ? serviceLabel(data.byService[0].service) : '—'}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {data.byService?.[0] ? fmtTokens(data.byService[0].total) + ' tokens' : 'sin datos'}
              </p>
            </div>
          </div>

          {data.totalTokens === 0 ? (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-12 text-center">
              <p className="text-3xl mb-2">🤖</p>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                No hay logs de tokens para este período.
              </p>
            </div>
          ) : (
            <>
              {/* Breakdown por servicio */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Uso por servicio</h3>
                </div>
                <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {data.byService.map(svc => (
                    <div key={svc.service} className="px-5 py-3 flex items-center gap-4">
                      <div className="w-36 flex-shrink-0">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{serviceLabel(svc.service)}</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono">{svc.service}</p>
                      </div>
                      <TokenBar value={svc.total} max={maxSvcTotal} />
                      <div className="text-right flex-shrink-0 w-32">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{fmtTokens(svc.total)}</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                          {fmtTokens(svc.inputTokens)} in · {fmtTokens(svc.outputTokens)} out
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 w-16">
                        <p className="text-xs font-medium text-primary-600 dark:text-primary-400">{fmtCost(svc.estimatedCost)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pie de pricing */}
                <div className="px-5 py-2.5 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">
                    Precios estimados: Claude Haiku — $0.80 / 1M tokens input · $4.00 / 1M tokens output
                  </p>
                </div>
              </div>

              {/* Ranking por workspace */}
              {data.byWorkspace.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      Ranking por workspace
                      <span className="ml-2 text-xs font-normal text-gray-400">({data.byWorkspace.length} con actividad)</span>
                    </h3>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {data.byWorkspace.map((ws, idx) => (
                      <div key={ws.workspaceId}>
                        {/* Fila principal del workspace */}
                        <button
                          className="w-full px-5 py-3 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors text-left"
                          onClick={() => toggleExpanded(ws.workspaceId)}
                        >
                          <span className="w-5 flex-shrink-0 text-xs font-bold text-gray-300 dark:text-gray-600 tabular-nums">
                            {idx + 1}
                          </span>
                          <div className="w-36 flex-shrink-0 min-w-0">
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{ws.name}</p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500">{ws.slug}</p>
                          </div>
                          <TokenBar value={ws.total} max={maxWsTotal} />
                          <div className="text-right flex-shrink-0 w-28">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{fmtTokens(ws.total)}</p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500">
                              {fmtCost(ws.estimatedCost)}
                            </p>
                          </div>
                          <span className={`flex-shrink-0 text-gray-400 text-xs transition-transform duration-200 ${expanded === ws.workspaceId ? 'rotate-180' : ''}`}>
                            ▾
                          </span>
                        </button>

                        {/* Desglose por servicio (expandible) */}
                        {expanded === ws.workspaceId && (
                          <div className="bg-gray-50 dark:bg-gray-700/30 border-t border-gray-100 dark:border-gray-700">
                            {ws.byService
                              .sort((a, b) => b.total - a.total)
                              .map(svc => (
                                <div key={svc.service} className="px-5 py-2 pl-12 flex items-center gap-4">
                                  <div className="w-36 flex-shrink-0">
                                    <p className="text-xs text-gray-600 dark:text-gray-400">{serviceLabel(svc.service)}</p>
                                  </div>
                                  <TokenBar
                                    value={svc.total}
                                    max={ws.total}
                                    color="bg-primary-300 dark:bg-primary-700"
                                  />
                                  <div className="text-right flex-shrink-0 w-28">
                                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{fmtTokens(svc.total)}</p>
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500">
                                      {fmtCost(svc.estimatedCost)}
                                    </p>
                                  </div>
                                  <span className="flex-shrink-0 w-3" />
                                </div>
                              ))
                            }
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ─── Sidebar nav items ────────────────────────────────────────────────────────

// ─── Section: Métricas (uso de la plataforma) ────────────────────────────────

// Gráfico de línea + área en SVG puro (sin dependencias). Se estira al ancho del
// contenedor; stroke crisp vía vector-effect. Hover muestra el valor del día.
