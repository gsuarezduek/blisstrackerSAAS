import { useState, useEffect } from 'react'
import api from '../../api/client'
import { fmtTokens, fmtCost } from './shared'
import { TokenBar } from './aiTokens'

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7)
}

// Uso de WhatsApp por workspace/mes (Fase 6 del plan de WhatsApp) — mirror de
// SectionAiTokens, pero con un selector de mes en vez de período relativo
// (el uso de WhatsApp se factura por mes calendario, no tiene sentido "últimos 7 días").
export function SectionWhatsappUsage() {
  const [month, setMonth] = useState(currentMonthStr())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load(m) {
    setLoading(true)
    try {
      const { data: res } = await api.get(`/superadmin/whatsapp-usage?month=${m}`)
      setData(res)
    } finally { setLoading(false) }
  }

  useEffect(() => { load(month) }, [month])

  const maxTemplates = data?.byWorkspace?.[0]?.templatesSent || 1

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">WhatsApp</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Volumen y costo estimado del módulo de WhatsApp por workspace, por mes calendario.
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data ? (
        <p className="text-sm text-red-500 text-center py-8">Error al cargar el uso de WhatsApp.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Conversaciones activas</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmtTokens(data.totals.conversationsActive)}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Mensajes (in / out)</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmtTokens(data.totals.messagesIn)} / {fmtTokens(data.totals.messagesOut)}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Plantillas enviadas</p>
              <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">{fmtTokens(data.totals.templatesSent)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">manual + automáticas</p>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Costo estimado</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {data.costPerTemplate > 0 ? fmtCost(data.totals.estimatedCostUsd) : '—'}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {data.costPerTemplate > 0
                  ? `${fmtCost(data.costPerTemplate)} / plantilla`
                  : 'Sin configurar — Configuración → Comercial'}
              </p>
            </div>
          </div>

          {data.byWorkspace.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-12 text-center">
              <p className="text-3xl mb-2">💬</p>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Sin actividad de WhatsApp este mes.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Ranking por workspace
                  <span className="ml-2 text-xs font-normal text-gray-400">({data.byWorkspace.length} con actividad)</span>
                </h3>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {data.byWorkspace.map((ws, idx) => (
                  <div key={ws.workspaceId} className="px-5 py-3 flex items-center gap-4">
                    <span className="w-5 flex-shrink-0 text-xs font-bold text-gray-300 dark:text-gray-600 tabular-nums">{idx + 1}</span>
                    <div className="w-36 flex-shrink-0 min-w-0">
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{ws.name}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">{ws.slug}</p>
                    </div>
                    <TokenBar value={ws.templatesSent} max={maxTemplates} />
                    <div className="text-right flex-shrink-0 w-24">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{fmtTokens(ws.templatesSent)}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">plantillas</p>
                    </div>
                    <div className="text-right flex-shrink-0 w-24">
                      <p className="text-xs text-gray-600 dark:text-gray-300">{fmtTokens(ws.messagesIn)}/{fmtTokens(ws.messagesOut)}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">in/out</p>
                    </div>
                    <div className="text-right flex-shrink-0 w-20">
                      <p className="text-xs text-gray-600 dark:text-gray-300">{ws.avgFirstResponseMins != null ? `${ws.avgFirstResponseMins}m` : '—'}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">1ra resp.</p>
                    </div>
                    <div className="text-right flex-shrink-0 w-20">
                      <p className="text-xs font-medium text-primary-600 dark:text-primary-400">
                        {data.costPerTemplate > 0 ? fmtCost(ws.estimatedCostUsd) : '—'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-2.5 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                  Meta cobra por conversación (no por mensaje) con precio variable por país/categoría — el costo de acá es una aproximación (costo fijo por plantilla × cantidad enviada), no un cálculo exacto de Meta.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
