import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'
import { fmtMoney } from './StatusBadge'
import ReasonModal from './ReasonModal'
import { LEAD_STATUSES, LEAD_ORIGINS, originLabel, statusMeta, STATUS_BADGE } from './salesCatalog'
import { avatarUrl } from '../../utils/avatarUrl'

// Select de estado con look de badge — permite cambiar el estado de un lead
// directo desde la tabla, sin entrar a su ficha. Pasar a "Perdido" pide el
// motivo antes de aplicar (ver ReasonModal en el componente padre).
function StatusSelect({ status, saving, onChange, title }) {
  const meta = statusMeta(status)
  return (
    <select
      value={status}
      disabled={saving}
      onClick={e => e.stopPropagation()}
      onChange={e => onChange(e.target.value)}
      title={title}
      className={`text-xs font-semibold rounded-full pl-2.5 pr-1 py-0.5 border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-wait ${STATUS_BADGE[meta.color] || STATUS_BADGE.gray}`}
    >
      {LEAD_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
    </select>
  )
}

const STAT_CARDS = [
  { key: 'totalLeads',          label: 'Total de leads',        icon: '📇', accent: 'text-gray-900 dark:text-white' },
  { key: 'proposalsThisMonth',  label: 'Propuestas del mes',    icon: '📄', accent: 'text-gray-900 dark:text-white' },
  { key: 'inProposal',          label: 'Por cerrar (Propuesta)', icon: '⏳', accent: 'text-amber-600 dark:text-amber-400' },
  { key: 'wonThisMonth',        label: 'Ganados este mes',      icon: '🏆', accent: 'text-green-600 dark:text-green-400' },
  { key: 'lostThisMonth',       label: 'Perdidos este mes',     icon: '💔', accent: 'text-red-600 dark:text-red-400' },
  { key: 'actionsTodayCount',   label: 'Acciones para hoy',     icon: '📅', accent: 'text-blue-600 dark:text-blue-400' },
  { key: 'actionsOverdueCount', label: 'Acciones vencidas',     icon: '🔴', accent: 'text-red-600 dark:text-red-400' },
]

const input = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

// Fila de una acción pendiente (próxima acción de un lead) — muestra a quién le
// corresponde, no solo a quien está mirando el dashboard: el equipo entero ve
// todas las acciones de hoy/vencidas, no solo las propias.
function ActionRow({ a, onOpenLead, overdue }) {
  return (
    <button
      onClick={() => onOpenLead(a.id)}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.title}</p>
        {a.actionTitle && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{a.actionTitle}</p>}
      </div>
      {a.owner ? (
        <span className="flex items-center gap-1.5 flex-shrink-0">
          <img src={avatarUrl(a.owner.avatar)} alt="" className="w-5 h-5 rounded-full object-cover" />
          <span className="text-xs text-gray-500 dark:text-gray-400">{a.owner.name}</span>
        </span>
      ) : (
        <span className="text-xs text-gray-400 flex-shrink-0">Sin asignar</span>
      )}
      <span className={`text-xs flex-shrink-0 ${overdue ? 'text-red-500 dark:text-red-400 font-medium' : 'text-gray-400'}`}>{fmtDate(a.dueAt)}</span>
    </button>
  )
}

function ActionsPanel({ title, icon, items, onOpenLead, overdue }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {icon} {title} <span className="font-normal text-gray-400">({items.length})</span>
        </h3>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-gray-400">Nada por acá.</p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-72 overflow-y-auto">
          {items.map(a => <ActionRow key={a.id} a={a} onOpenLead={onOpenLead} overdue={overdue} />)}
        </div>
      )}
    </div>
  )
}

export default function DashboardTab({ team, onOpenLead, onDataChange }) {
  const [dash, setDash] = useState(null)
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  // Cambio de estado inline desde la tabla (sin entrar al lead).
  const [savingStatusId, setSavingStatusId] = useState(null)
  const [lostPending, setLostPending] = useState(null) // { id } — pide motivo antes de aplicar "Perdido"
  const [lostSaving, setLostSaving] = useState(false)

  // Estructura de filtros extensible: agregar un objeto acá suma un control + su query param.
  // `archived`: '' = solo activos (default), 'true' = solo archivados (vista excluyente, no aditiva).
  const [filters, setFilters] = useState({ status: '', ownerId: '', origin: '', from: '', to: '', search: '', archived: '' })

  // Orden de la tabla — client-side, sin refetch (mismo patrón que Reports.jsx).
  // 'whatsapp' (default): leads con conversación de WhatsApp primero, no
  // leídos antes que leídos, por último mensaje más reciente; el resto queda
  // en su orden normal (backend: updatedAt desc) al final, sin mezclarse.
  const [sortMode, setSortMode] = useState('whatsapp')

  const sortedLeads = useMemo(() => {
    if (sortMode !== 'whatsapp') return leads
    const withWa = leads.filter(l => l.whatsapp?.connected)
    const withoutWa = leads.filter(l => !l.whatsapp?.connected)
    withWa.sort((a, b) => {
      if (a.whatsapp.unread !== b.whatsapp.unread) return a.whatsapp.unread ? -1 : 1
      return new Date(b.whatsapp.lastMessageAt || 0) - new Date(a.whatsapp.lastMessageAt || 0)
    })
    return [...withWa, ...withoutWa]
  }, [leads, sortMode])

  const loadLeads = useCallback(async () => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
    const { data } = await api.get(`/ventas/leads?${params.toString()}`)
    setLeads(data)
  }, [filters])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: d }] = await Promise.all([api.get('/ventas/dashboard'), loadLeads()])
      setDash(d)
    } finally {
      setLoading(false)
    }
  }, [loadLeads])

  useEffect(() => { loadAll() }, []) // carga inicial
  useEffect(() => { loadLeads() }, [filters]) // eslint-disable-line react-hooks/exhaustive-deps

  function setFilter(k, v) { setFilters(f => ({ ...f, [k]: v })) }

  async function unarchive(id) {
    await api.patch(`/ventas/leads/${id}/archive`, { archived: false })
    await loadLeads()
    onDataChange?.()
  }

  async function applyStatusChange(id, status, lostReason) {
    setSavingStatusId(id)
    setLeads(ls => ls.map(l => (l.id === id ? { ...l, status, ...(lostReason !== undefined ? { lostReason } : {}) } : l)))
    try {
      await api.patch(`/ventas/leads/${id}/status`, { status, ...(lostReason ? { lostReason } : {}) })
      onDataChange?.() // refresca las tarjetas del dashboard (ganados/perdidos del mes, etc.)
    } catch {
      await loadLeads() // revertir ante error
    } finally {
      setSavingStatusId(null)
    }
  }

  function handleStatusChange(lead, status) {
    if (status === lead.status) return
    if (statusMeta(status)?.isLost) {
      setLostPending({ id: lead.id, status }) // pide el motivo antes de aplicar el cambio
      return
    }
    applyStatusChange(lead.id, status)
  }

  async function confirmLost(reason) {
    if (!lostPending) return
    setLostSaving(true)
    try {
      await applyStatusChange(lostPending.id, lostPending.status, reason)
      setLostPending(null)
    } finally {
      setLostSaving(false)
    }
  }

  if (loading && !dash) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      {/* Tarjetas de indicadores */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {STAT_CARDS.map(c => (
          <div key={c.key} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
            <div className="text-lg mb-1">{c.icon}</div>
            <div className={`text-2xl font-bold ${c.accent}`}>{dash?.cards?.[c.key] ?? 0}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Acciones del equipo — hoy y vencidas, de todos los responsables (no solo las propias) */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ActionsPanel title="Acciones de hoy" icon="📅" items={dash?.actionsToday || []} onOpenLead={onOpenLead} />
        <ActionsPanel title="Acciones vencidas" icon="🔴" items={dash?.actionsOverdue || []} onOpenLead={onOpenLead} overdue />
      </div>

      {/* Barra de filtros + acción */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <input className={`${input} flex-1`} placeholder="Buscar por empresa o título…" value={filters.search} onChange={e => setFilter('search', e.target.value)} />
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-500 dark:text-gray-400">Ordenar por</span>
            <select className={input} value={sortMode} onChange={e => setSortMode(e.target.value)}>
              <option value="whatsapp">WhatsApp sin leer primero</option>
              <option value="recent">Más recientes</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <select className={input} value={filters.status} onChange={e => setFilter('status', e.target.value)}>
            <option value="">Todos los estados</option>
            {LEAD_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select className={input} value={filters.ownerId} onChange={e => setFilter('ownerId', e.target.value)}>
            <option value="">Todos los responsables</option>
            <option value="none">Sin asignar</option>
            {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select className={input} value={filters.origin} onChange={e => setFilter('origin', e.target.value)}>
            <option value="">Todos los orígenes</option>
            {LEAD_ORIGINS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <input type="date" className={input} value={filters.from} onChange={e => setFilter('from', e.target.value)} title="Creados desde" />
          <input type="date" className={input} value={filters.to} onChange={e => setFilter('to', e.target.value)} title="Creados hasta" />
          <button
            onClick={() => setFilter('archived', filters.archived ? '' : 'true')}
            className={`rounded-xl px-3 py-2 text-sm font-medium border ${filters.archived ? 'bg-gray-700 text-white border-gray-700 dark:bg-gray-600 dark:border-gray-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            🗄 {filters.archived ? 'Viendo archivados' : 'Ver archivados'}
          </button>
        </div>
      </div>

      {/* Listado de leads */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
        {sortedLeads.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">{filters.archived ? 'No hay leads archivados.' : 'No hay leads que coincidan con los filtros.'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-medium">Empresa / Oportunidad</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Responsable</th>
                  <th className="px-4 py-3 font-medium">Origen</th>
                  <th className="px-4 py-3 font-medium text-right">Valor</th>
                  <th className="px-4 py-3 font-medium">Próx. contacto</th>
                  {filters.archived && <th className="px-4 py-3 font-medium"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {sortedLeads.map(l => (
                  <tr key={l.id} onClick={() => onOpenLead(l.id)} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
                        {l.company?.name || '—'}
                        {l.whatsapp?.connected && (
                          <span
                            className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${l.whatsapp.unread ? 'bg-primary-500 animate-pulse' : 'bg-green-500'}`}
                            title={l.whatsapp.unread ? 'WhatsApp: tiene mensajes sin leer' : 'WhatsApp conectado'}
                          />
                        )}
                      </div>
                      {l.title && <div className="text-xs text-gray-500 dark:text-gray-400">{l.title}</div>}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <StatusSelect
                        status={l.status}
                        saving={savingStatusId === l.id}
                        onChange={status => handleStatusChange(l, status)}
                        title={l.status === 'perdido' ? l.lostReason : undefined}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{l.owner?.name || <span className="text-gray-400">Sin asignar</span>}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{originLabel(l.origin)}</td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200">{fmtMoney(l.estimatedValue, l.currency)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{fmtDate(l.nextContactAt)}</td>
                    {filters.archived && (
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <button onClick={() => unarchive(l.id)} className="text-xs font-medium text-primary-600 hover:underline">↩️ Desarchivar</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReasonModal open={!!lostPending} loading={lostSaving} onConfirm={confirmLost} onCancel={() => setLostPending(null)} />
    </div>
  )
}
