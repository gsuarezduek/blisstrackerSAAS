import { useEffect, useState } from 'react'
import api from '../../api/client'
import { Avatar } from '../../pages/project-detail/ui.jsx'

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Historial genérico (sección 4.9 del spec): línea de tiempo con fecha, hora,
// usuario y qué cambió. El `summary` ya viene formateado desde el backend
// (lib/financeAudit.js) — acá solo se pinta.
export default function AuditTimeline({ entityType, entityId }) {
  const [logs, setLogs] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.get('/finanzas/audit', { params: { entityType, entityId } }).then(res => { if (!cancelled) setLogs(res.data) })
    return () => { cancelled = true }
  }, [entityType, entityId])

  if (logs === null) return <p className="text-xs text-gray-400">Cargando historial…</p>
  if (logs.length === 0) return <p className="text-xs text-gray-400">Sin historial todavía.</p>

  return (
    <ul className="space-y-3">
      {logs.map(l => (
        <li key={l.id} className="flex gap-2">
          <div className="pt-0.5">
            {l.user ? <Avatar user={l.user} size="xs" /> : <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700" />}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-400">{fmtDateTime(l.createdAt)} · {l.user?.name || 'Sistema'}</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{l.summary}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
