import { useState } from 'react'
import api from '../../api/client'
import { Avatar } from '../project-detail/ui'
import { LEAVE_TYPE_LABELS, BENEFIT_BANKS, leaveRangeLabel, leaveDayCount, todayStr } from './shared'

// ─── Cola unificada "Para resolver" ───────────────────────────────────────────
// Junta las solicitudes pendientes de licencias (VacationRequest) y de beneficios
// (BenefitBankRequest) en una sola lista, ordenada por urgencia (lo que empieza
// antes, primero). Aprobar es un click; rechazar pide una nota en el lugar.

// Días hábiles (lun-vie) de un rango — mismo cálculo que countBusinessDays del
// backend, que es lo que se descuenta del saldo al aprobar unas vacaciones.
export function businessDays(start, end) {
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const to = new Date(ey, em - 1, ed)
  let n = 0
  for (const d = new Date(sy, sm - 1, sd); d <= to; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) n++
  }
  return n
}

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000)
}

const fmtNum = n => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))

// Normaliza ambos tipos de solicitud a un mismo shape para la cola.
export function buildApprovalItems({ leaves = [], benefits = [], approvedLeaves = [], usersById = {} }) {
  const items = []
  for (const r of leaves) {
    const u = usersById[r.user?.id] ?? {}
    const isVacation = r.type === 'vacaciones'
    const days = isVacation ? businessDays(r.startDate, r.endDate) : leaveDayCount(r.startDate, r.endDate)
    // Otras personas con licencia aprobada que se superpone con este pedido.
    const overlaps = approvedLeaves
      .filter(o => o.user?.id !== r.user?.id && o.startDate <= r.endDate && o.endDate >= r.startDate)
      .map(o => o.user?.name)
      .filter(Boolean)
    items.push({
      key: `leave-${r.id}`, kind: 'leave', id: r.id, user: r.user,
      title: LEAVE_TYPE_LABELS[r.type] ?? r.type,
      when: leaveRangeLabel(r.startDate, r.endDate),
      startDate: r.startDate,
      amount: isVacation ? `${days} ${days === 1 ? 'día hábil' : 'días hábiles'}` : `${days} ${days === 1 ? 'día' : 'días'}`,
      balance: isVacation && u.vacationDays != null
        ? { from: u.vacationDays, to: u.vacationDays - days, unit: 'días de vacaciones' }
        : null,
      note: r.observation || null,
      overlaps: [...new Set(overlaps)],
      createdAt: r.createdAt,
    })
  }
  for (const r of benefits) {
    const meta = BENEFIT_BANKS[r.bank] ?? { label: r.bank, unit: '', balanceField: null }
    const u = usersById[r.user?.id] ?? {}
    const current = meta.balanceField ? u[meta.balanceField] : null
    items.push({
      key: `benefit-${r.id}`, kind: 'benefit', id: r.id, user: r.user,
      title: meta.label,
      when: r.date ? leaveRangeLabel(r.date, r.date) : 'Sin fecha',
      startDate: r.date || null,
      amount: `${fmtNum(r.amount)} ${meta.unit}`,
      balance: current != null ? { from: current, to: current - r.amount, unit: meta.unit } : null,
      note: r.reason || null,
      overlaps: [],
      createdAt: r.createdAt,
    })
  }
  // Lo que arranca antes primero; sin fecha, al final por antigüedad del pedido.
  return items.sort((a, b) => {
    if (a.startDate && b.startDate) return a.startDate.localeCompare(b.startDate)
    if (a.startDate) return -1
    if (b.startDate) return 1
    return new Date(a.createdAt) - new Date(b.createdAt)
  })
}

// Etiqueta de urgencia según cuándo empieza: ya empezó / hoy / mañana / en N días.
export function urgencyFor(startDate, today = todayStr()) {
  if (!startDate) return null
  const d = daysBetween(today, startDate)
  if (d < 0) return { label: 'Ya empezó', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
  if (d === 0) return { label: 'Empieza hoy', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
  if (d === 1) return { label: 'Mañana', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' }
  if (d <= 7) return { label: `En ${d} días`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' }
  return { label: `En ${d} días`, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' }
}

const ENDPOINT = { leave: id => `/vacation/admin/requests/${id}`, benefit: id => `/benefits/admin/requests/${id}` }

export function ApprovalRow({ item, onDecided }) {
  const [mode, setMode]     = useState('idle')   // idle | rejecting
  const [note, setNote]     = useState('')
  const [saving, setSaving] = useState(null)     // null | 'approved' | 'rejected'
  const [error, setError]   = useState('')
  const urgency = urgencyFor(item.startDate)

  async function decide(status) {
    if (status === 'rejected' && !note.trim()) { setError('Contale el motivo: le llega en la notificación.'); return }
    setSaving(status); setError('')
    try {
      await api.patch(ENDPOINT[item.kind](item.id), { status, reviewNote: status === 'rejected' ? note.trim() : '' })
      onDecided(item, status)
    } catch (e) {
      // 409 = otra persona ya la resolvió: se saca de la cola igual.
      if (e.response?.status === 409) { onDecided(item, null); return }
      setError(e.response?.data?.error || 'No se pudo guardar. Probá de nuevo.')
      setSaving(null)
    }
  }

  const negative = item.balance && item.balance.to < 0
  return (
    <li className="px-4 py-3.5">
      <div className="flex items-start gap-3">
        <Avatar user={item.user} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.user?.name}</p>
            {urgency && <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${urgency.cls}`}>{urgency.label}</span>}
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">
            {item.title} · {item.when} · <span className="font-medium">{item.amount}</span>
          </p>
          {item.balance && (
            <p className={`text-xs mt-0.5 ${negative ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
              Saldo: {fmtNum(item.balance.from)} → {fmtNum(item.balance.to)} {item.balance.unit}{negative ? ' (queda negativo)' : ''}
            </p>
          )}
          {item.overlaps.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              Coincide con la licencia de {item.overlaps.join(', ')}
            </p>
          )}
          {item.note && <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-1">“{item.note}”</p>}
        </div>

        {mode === 'idle' && (
          <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
            <RowActions saving={saving} onApprove={() => decide('approved')} onReject={() => { setMode('rejecting'); setError('') }} />
          </div>
        )}
      </div>

      {mode === 'idle' && (
        <div className="sm:hidden flex items-center gap-2 mt-3 pl-12">
          <RowActions saving={saving} onApprove={() => decide('approved')} onReject={() => { setMode('rejecting'); setError('') }} />
        </div>
      )}

      {mode === 'rejecting' && (
        <div className="mt-3 sm:pl-12 space-y-2">
          <textarea autoFocus rows={2} value={note} onChange={e => setNote(e.target.value)}
            placeholder="Motivo del rechazo (le llega a la persona)"
            aria-label="Motivo del rechazo"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => { setMode('idle'); setNote(''); setError('') }} disabled={!!saving}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Cancelar</button>
            <button type="button" onClick={() => decide('rejected')} disabled={!!saving}
              className="px-3.5 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50">
              {saving === 'rejected' ? 'Rechazando…' : 'Rechazar solicitud'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-2 sm:pl-12">{error}</p>}
    </li>
  )
}

function RowActions({ saving, onApprove, onReject }) {
  return (
    <>
      <button type="button" onClick={onReject} disabled={!!saving}
        className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
        Rechazar
      </button>
      <button type="button" onClick={onApprove} disabled={!!saving}
        className="px-3.5 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50">
        {saving === 'approved' ? 'Aprobando…' : 'Aprobar'}
      </button>
    </>
  )
}
