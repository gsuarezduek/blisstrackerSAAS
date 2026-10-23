import { useEffect, useState, useCallback } from 'react'
import api from '../../api/client'
import { Card, CardHeader } from '../../pages/project-detail/ui.jsx'
import { Avatar } from '../../pages/project-detail/ui.jsx'
import { auditEntityTypeLabel, auditActionMeta, STATUS_BADGE } from './financeCatalog'

const input = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm'

const ENTITY_TYPES = ['account', 'issuer', 'tax', 'category', 'item', 'movement', 'transfer', 'check', 'fundValuation', 'invoice', 'extra', 'nextAction', 'task', 'adjustment']
const ACTIONS = ['create', 'update', 'delete', 'restore']

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// "Historial" global (admin/owner-only, ver audit.controller.js): referencia
// de todo lo creado/editado/eliminado en Finanzas — pensado para auditar
// borrados masivos o cambios de montos, no para el uso diario. Reusa
// FinanceAuditLog, la misma tabla que ya alimenta el historial por entidad
// (AuditTimeline, dentro de cada modal de edición) — acá se lista sin
// filtrar por entityId, con filtros de tipo/acción/fecha.
export default function FinanceAuditLogPanel() {
  const [entityType, setEntityType] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [logs, setLogs] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const params = {}
    if (entityType) params.entityType = entityType
    if (action) params.action = action
    if (from) params.from = from
    if (to) params.to = to
    try {
      const res = await api.get('/finanzas/audit', { params })
      setLogs(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar el historial')
    }
  }, [entityType, action, from, to])

  useEffect(() => { load() }, [load])

  return (
    <Card>
      <CardHeader title="Historial" />
      <p className="px-4 text-xs text-gray-400 -mt-1 mb-2">Todo lo creado, editado o eliminado en Finanzas — últimos 300 registros</p>
      <div className="px-4 flex flex-wrap items-center gap-2 mb-3">
        <select className={input} value={entityType} onChange={e => setEntityType(e.target.value)}>
          <option value="">Todos los tipos</option>
          {ENTITY_TYPES.map(t => <option key={t} value={t}>{auditEntityTypeLabel(t)}</option>)}
        </select>
        <select className={input} value={action} onChange={e => setAction(e.target.value)}>
          <option value="">Todas las acciones</option>
          {ACTIONS.map(a => <option key={a} value={a}>{auditActionMeta(a).label}</option>)}
        </select>
        <input type="date" className={input} value={from} onChange={e => setFrom(e.target.value)} />
        <span className="text-gray-400 text-sm">a</span>
        <input type="date" className={input} value={to} onChange={e => setTo(e.target.value)} />
      </div>

      {error && <p className="px-4 text-xs text-red-500 mb-2">{error}</p>}

      <div className="px-4 pb-4 max-h-96 overflow-y-auto">
        {logs === null ? (
          <p className="text-xs text-gray-400 py-4 text-center">Cargando…</p>
        ) : logs.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">Sin registros para este filtro.</p>
        ) : (
          <ul className="space-y-2.5">
            {logs.map(l => {
              const meta = auditActionMeta(l.action)
              return (
                <li key={l.id} className="flex gap-2">
                  <div className="pt-0.5">
                    {l.user ? <Avatar user={l.user} size="xs" /> : <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-400">
                      {fmtDateTime(l.createdAt)} · {l.user?.name || 'Sistema'} ·{' '}
                      <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${STATUS_BADGE[meta.color]}`}>{meta.label}</span>{' '}
                      <span className="text-gray-400">{auditEntityTypeLabel(l.entityType)}</span>
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{l.summary}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Card>
  )
}
