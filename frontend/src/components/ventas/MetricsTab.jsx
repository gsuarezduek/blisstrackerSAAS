import { useState, useEffect } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'
import { fmtMoney } from './StatusBadge'
import { statusMeta, STATUS_BADGE, originLabel } from './salesCatalog'

const card = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5'

export default function MetricsTab() {
  const [m, setM] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { api.get('/ventas/metrics').then(({ data }) => { setM(data); setLoading(false) }).catch(() => setLoading(false)) }, [])

  if (loading) return <LoadingSpinner />
  if (!m) return <div className={card}><p className="text-sm text-gray-400">No se pudieron cargar las métricas.</p></div>

  const cur = m.currency
  const maxStageValue = Math.max(1, ...m.byStage.map(s => s.value))

  const cards = [
    { label: 'Pipeline abierto', value: fmtMoney(m.pipelineValue, cur), sub: `${m.openCount} lead(s) activos` },
    { label: 'Forecast ponderado', value: fmtMoney(m.weightedForecast, cur), sub: 'por probabilidad de cierre', accent: 'text-primary-600 dark:text-primary-400' },
    { label: 'Win rate', value: m.winRate != null ? `${m.winRate}%` : '—', sub: 'ganados / cerrados' },
    { label: 'Ticket promedio', value: m.avgDealSize != null ? fmtMoney(m.avgDealSize, cur) : '—', sub: 'de ganados' },
    { label: 'Ciclo promedio', value: m.avgCycleDays != null ? `${m.avgCycleDays} d` : '—', sub: 'alta → ganado' },
    { label: 'Ganados este mes', value: `${m.wonThisMonth}`, sub: fmtMoney(m.wonValueThisMonth, cur), accent: 'text-green-600 dark:text-green-400' },
    { label: 'Perdidos este mes', value: `${m.lostThisMonth}`, sub: '', accent: 'text-red-600 dark:text-red-400' },
  ]

  return (
    <div className="space-y-6">
      {/* Tarjetas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {cards.map((c, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
            <div className={`text-xl font-bold ${c.accent || 'text-gray-900 dark:text-white'}`}>{c.value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-tight">{c.label}</div>
            {c.sub && <div className="text-[11px] text-gray-400 mt-0.5">{c.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Embudo por etapa */}
        <div className={card}>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4">Embudo por etapa</h3>
          <div className="space-y-2.5">
            {m.byStage.map(s => {
              const meta = statusMeta(s.key)
              return (
                <div key={s.key}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[meta.color]}`}>{s.label}</span>
                    <span className="text-gray-500 dark:text-gray-400">{s.count} · {fmtMoney(s.value, cur)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div className="h-full bg-primary-500 rounded-full" style={{ width: `${Math.round((s.value / maxStageValue) * 100)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Ranking por responsable */}
        <div className={card}>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4">Ranking por responsable</h3>
          {m.byOwner.length === 0 ? (
            <p className="text-sm text-gray-400">Sin leads asignados.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-400 uppercase tracking-wide">
                <tr><th className="pb-2 font-medium">Vendedor</th><th className="pb-2 font-medium text-right">Pipeline</th><th className="pb-2 font-medium text-right">Ganados</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {m.byOwner.map(o => (
                  <tr key={o.id}>
                    <td className="py-2 text-gray-800 dark:text-gray-200">{o.name}</td>
                    <td className="py-2 text-right text-gray-700 dark:text-gray-300">{fmtMoney(o.openValue, cur)} <span className="text-gray-400">({o.openCount})</span></td>
                    <td className="py-2 text-right text-green-600 dark:text-green-400">{o.wonCount} · {fmtMoney(o.wonValue, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Orígenes */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4">Leads por origen</h3>
        {m.byOrigin.length === 0 ? (
          <p className="text-sm text-gray-400">Sin datos.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {m.byOrigin.map(o => (
              <div key={o.origin} className="border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 min-w-[120px]">
                <div className="text-lg font-bold text-gray-900 dark:text-white">{o.count}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{originLabel(o.origin)}</div>
                <div className="text-[11px] text-green-600 dark:text-green-400 mt-0.5">{o.won} ganado(s)</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* WhatsApp (Fase 6 del plan) — solo si el workspace tiene el módulo habilitado */}
      {m.whatsapp && (
        <div className={card}>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4">💬 WhatsApp — este mes</h3>
          <div className="flex flex-wrap gap-3">
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 min-w-[120px]">
              <div className="text-lg font-bold text-gray-900 dark:text-white">{m.whatsapp.conversationsActive}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Conversaciones activas</div>
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 min-w-[120px]">
              <div className="text-lg font-bold text-gray-900 dark:text-white">{m.whatsapp.messagesIn}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Mensajes recibidos</div>
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 min-w-[120px]">
              <div className="text-lg font-bold text-gray-900 dark:text-white">{m.whatsapp.messagesOut}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Mensajes enviados</div>
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 min-w-[120px]">
              <div className="text-lg font-bold text-primary-600 dark:text-primary-400">{m.whatsapp.templatesSent}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Plantillas enviadas</div>
              <div className="text-[11px] text-gray-400 mt-0.5">manual + automáticas</div>
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 min-w-[120px]">
              <div className="text-lg font-bold text-gray-900 dark:text-white">{m.whatsapp.avgFirstResponseMins != null ? `${m.whatsapp.avgFirstResponseMins} min` : '—'}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Primera respuesta prom.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
