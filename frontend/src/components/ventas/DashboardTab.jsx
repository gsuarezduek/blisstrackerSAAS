import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'
import StatusBadge, { fmtMoney } from './StatusBadge'
import LeadModal from './LeadModal'
import { LEAD_STATUSES, LEAD_ORIGINS, originLabel } from './salesCatalog'

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

export default function DashboardTab({ team, companies, onOpenLead, onDataChange }) {
  const [dash, setDash] = useState(null)
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  // Estructura de filtros extensible: agregar un objeto acá suma un control + su query param.
  const [filters, setFilters] = useState({ status: '', ownerId: '', origin: '', from: '', to: '', search: '' })

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

  function handleSaved() {
    setShowModal(false)
    loadAll()
    onDataChange?.()
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

      {/* Barra de filtros + acción */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
        <div className="flex flex-wrap items-end gap-3">
          <input className={`${input} flex-1 min-w-[160px]`} placeholder="Buscar por empresa o título…" value={filters.search} onChange={e => setFilter('search', e.target.value)} />
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
          <button onClick={() => setShowModal(true)} className="ml-auto bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl px-4 py-2 text-sm transition-colors">+ Nuevo lead</button>
        </div>
      </div>

      {/* Listado de leads */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
        {leads.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">No hay leads que coincidan con los filtros.</div>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {leads.map(l => (
                  <tr key={l.id} onClick={() => onOpenLead(l.id)} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{l.company?.name || '—'}</div>
                      {l.title && <div className="text-xs text-gray-500 dark:text-gray-400">{l.title}</div>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{l.owner?.name || <span className="text-gray-400">Sin asignar</span>}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{originLabel(l.origin)}</td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200">{fmtMoney(l.estimatedValue, l.currency)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{fmtDate(l.nextContactAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && <LeadModal companies={companies} team={team} onClose={() => setShowModal(false)} onSaved={handleSaved} />}
    </div>
  )
}
