import { useEffect, useState } from 'react'
import api from '../../../api/client'
import { Card, StatusPill, CAMPAIGN_STATUS, pct, fmtInt, fmtDateTime } from './ui'

export default function MailingSummary({ projects, onSelectProject }) {
  const [campaigns, setCampaigns] = useState(null)

  useEffect(() => {
    api.get('/marketing/summary/mailing')
      .then(r => setCampaigns(r.data.campaigns))
      .catch(() => setCampaigns([]))
  }, [])

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Elegí un proyecto para trabajar su mailing</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Cada cliente tiene su propio remitente, sus bases de contactos y sus campañas.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {projects.slice(0, 12).map(p => (
            <button key={p.id} onClick={() => onSelectProject(String(p.id))}
              className="text-xs px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-primary-400 hover:text-primary-700">
              {p.name}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Campañas recientes</p>
        </div>
        {campaigns === null ? (
          <p className="px-5 py-6 text-sm text-gray-400">Cargando…</p>
        ) : campaigns.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400">Todavía no hay campañas en ningún proyecto.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-5 py-2.5 font-medium">Campaña</th>
                  <th className="text-left px-3 py-2.5 font-medium">Proyecto</th>
                  <th className="text-right px-3 py-2.5 font-medium">Enviados</th>
                  <th className="text-right px-3 py-2.5 font-medium">Aperturas</th>
                  <th className="text-right px-5 py-2.5 font-medium">Clics</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                    onClick={() => onSelectProject(String(c.project.id))}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <StatusPill map={CAMPAIGN_STATUS} status={c.status} />
                        <span className="truncate text-gray-800 dark:text-gray-200">{c.name}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">{fmtDateTime(c.launchedAt || c.scheduledAt || c.updatedAt)}</p>
                    </td>
                    <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{c.project.name}</td>
                    <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-400">{fmtInt(c.sentCount)}/{fmtInt(c.recipients)}</td>
                    <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-400">{pct(c.openCount, c.sentCount)}</td>
                    <td className="px-5 py-3 text-right text-gray-600 dark:text-gray-400">{pct(c.clickCount, c.sentCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
