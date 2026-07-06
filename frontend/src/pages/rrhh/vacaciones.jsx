import { useState, useEffect } from 'react'
import api from '../../api/client'
import { avatarUrl } from '../../utils/avatarUrl'
import LoadingSpinner from '../../components/LoadingSpinner'
import RoleBadge from '../../components/RoleBadge'

export const LEAVE_TYPE_LABELS = {
  vacaciones: 'Vacaciones',
  estudio:    'Estudio / examen',
  maternidad: 'Maternidad',
  paternidad: 'Paternidad',
  enfermedad: 'Enfermedad / salud',
  duelo:      'Duelo familiar',
  mudanza:    'Mudanza',
  otro:       'Otro',
}

export const REQUEST_STATUS = {
  pending:  { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  approved: { label: 'Aprobada',  color: 'bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400'  },
  rejected: { label: 'Rechazada', color: 'bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-400'    },
}

export function ReviewModal({ request, onClose, onDone }) {
  const [status, setStatus]     = useState('approved')
  const [reviewNote, setNote]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const { data } = await api.patch(`/vacation/admin/requests/${request.id}`, { status, reviewNote })
      onDone(data)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar')
      setSaving(false)
    }
  }

  const typeLabel = LEAVE_TYPE_LABELS[request.type] ?? request.type
  const dateRange = request.startDate === request.endDate
    ? request.startDate
    : `${request.startDate} → ${request.endDate}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">Revisar solicitud</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{request.user.name} · {typeLabel} · {dateRange}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {request.observation && (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-400 mb-1">Observación del solicitante</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 italic">{request.observation}</p>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">Decisión</label>
            <div className="flex gap-3">
              <label className="flex-1 flex items-center gap-2 cursor-pointer border-2 rounded-xl px-4 py-3 transition-all
                  border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20
                  has-[:checked]:ring-2 has-[:checked]:ring-green-500">
                <input type="radio" name="status" value="approved" checked={status === 'approved'} onChange={() => setStatus('approved')} className="accent-green-600" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">✅ Aprobar</span>
              </label>
              <label className="flex-1 flex items-center gap-2 cursor-pointer border-2 rounded-xl px-4 py-3 transition-all
                  border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20
                  has-[:checked]:ring-2 has-[:checked]:ring-red-500">
                <input type="radio" name="status" value="rejected" checked={status === 'rejected'} onChange={() => setStatus('rejected')} className="accent-red-600" />
                <span className="text-sm font-medium text-red-700 dark:text-red-400">❌ Rechazar</span>
              </label>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
              Nota para el usuario {status === 'rejected' && <span className="text-red-500">*</span>}
            </label>
            <textarea rows={2} value={reviewNote} onChange={e => setNote(e.target.value)}
              placeholder={status === 'rejected' ? 'Explicá el motivo del rechazo…' : 'Opcional, ej: Confirmado, que lo disfrutes!'}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
            <button type="submit" disabled={saving}
              className={`px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${status === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
              {saving ? 'Guardando…' : (status === 'approved' ? 'Aprobar' : 'Rechazar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function EditModal({ request, onClose, onDone }) {
  const [startDate, setStart] = useState(request.startDate)
  const [endDate, setEnd]     = useState(request.endDate)
  const [type, setType]       = useState(request.type)
  const [status, setStatus]   = useState(request.status)
  const [reviewNote, setNote] = useState(request.reviewNote || '')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const { data } = await api.patch(`/vacation/admin/requests/${request.id}/edit`, {
        startDate, endDate, type, status, reviewNote,
      })
      onDone(data)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar')
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">Editar solicitud</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{request.user.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Desde</label>
              <input type="date" value={startDate} onChange={e => setStart(e.target.value)} className={inputCls} required />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Hasta</label>
              <input type="date" value={endDate} onChange={e => setEnd(e.target.value)} className={inputCls} required />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Tipo</label>
            <select value={type} onChange={e => setType(e.target.value)} className={inputCls}>
              {Object.entries(LEAVE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">Estado</label>
            <div className="flex gap-2">
              {[
                ['approved', '✅ Aprobada', 'green'],
                ['rejected', '❌ Rechazada', 'red'],
                ['pending',  '⏳ Pendiente', 'yellow'],
              ].map(([v, l]) => (
                <label key={v} className={`flex-1 flex items-center justify-center gap-1.5 cursor-pointer border-2 rounded-xl px-2 py-2 text-xs font-medium transition-all ${
                  status === v
                    ? v === 'approved' ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                    : v === 'rejected' ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                    : 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                    : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                }`}>
                  <input type="radio" name="edit-status" value={v} checked={status === v} onChange={() => setStatus(v)} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Nota para el usuario</label>
            <textarea rows={2} value={reviewNote} onChange={e => setNote(e.target.value)}
              placeholder="Opcional"
              className={inputCls + ' resize-none'} />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 text-sm font-medium text-white rounded-lg bg-primary-600 hover:bg-primary-700 transition-colors disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function TabVacaciones() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('pending')
  const [reviewing, setReviewing] = useState(null)
  const [editing, setEditing]   = useState(null)

  useEffect(() => {
    api.get('/vacation/admin/requests')
      .then(r => setRequests(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function handleDone(updated) {
    setRequests(prev => prev.map(r => r.id === updated.id ? updated : r))
    setReviewing(null)
    setEditing(null)
  }

  const filtered = requests.filter(r =>
    filter === 'all' ? true : r.status === filter
  )

  const pendingCount = requests.filter(r => r.status === 'pending').length

  function fmtDateRange(start, end) {
    const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
    return start === end ? fmt(start) : `${fmt(start)} → ${fmt(end)}`
  }

  return (
    <div>
      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {[
          ['pending',  `Pendientes${pendingCount > 0 ? ` (${pendingCount})` : ''}`],
          ['approved', 'Aprobadas'],
          ['rejected', 'Rechazadas'],
          ['all',      'Todas'],
        ].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === v
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >{l}</button>
        ))}
      </div>

      {loading
        ? <LoadingSpinner className="py-12" />
        : filtered.length === 0
          ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-3xl mb-3">🏖️</p>
                <p className="font-medium">
                  {filter === 'pending' ? 'No hay solicitudes pendientes.' : 'Sin solicitudes en este filtro.'}
                </p>
              </div>
            )
          : (
              <div className="space-y-3">
                {filtered.map(req => {
                  const st = REQUEST_STATUS[req.status] ?? REQUEST_STATUS.pending
                  const typeLabel = LEAVE_TYPE_LABELS[req.type] ?? req.type
                  return (
                    <div key={req.id}
                      className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-5 py-4 flex items-start gap-4">
                      <img src={avatarUrl(req.user.avatar)} alt={req.user.name}
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0 border-2 border-gray-100 dark:border-gray-600 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className="font-semibold text-sm text-gray-900 dark:text-white">{req.user.name}</p>
                          <RoleBadge userId={req.user.id} />
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{typeLabel}</span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{fmtDateRange(req.startDate, req.endDate)}</p>
                        {req.observation && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic">{req.observation}</p>}
                        {req.reviewedBy && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Revisado por {req.reviewedBy.name}
                            {req.reviewNote && ` · "${req.reviewNote}"`}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-2">
                        {req.status === 'pending' && (
                          <button onClick={() => setReviewing(req)}
                            className="text-xs font-medium px-3 py-1.5 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors">
                            Revisar
                          </button>
                        )}
                        <button onClick={() => setEditing(req)}
                          className="text-xs font-medium px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                          Editar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
      }

      {reviewing && (
        <ReviewModal
          request={reviewing}
          onClose={() => setReviewing(null)}
          onDone={handleDone}
        />
      )}

      {editing && (
        <EditModal
          request={editing}
          onClose={() => setEditing(null)}
          onDone={handleDone}
        />
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

