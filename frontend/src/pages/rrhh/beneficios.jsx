import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import { avatarUrl } from '../../utils/avatarUrl'
import LoadingSpinner from '../../components/LoadingSpinner'
import RoleBadge from '../../components/RoleBadge'
import { BENEFIT_BANKS } from './shared'

// Aprobar/rechazar una solicitud de uso de horas libres / día home — mismo patrón
// que el ReviewModal de Licencias, genérico por banco.
function ReviewModal({ request, onClose, onDone }) {
  const meta = BENEFIT_BANKS[request.bank]
  const [status, setStatus]   = useState('approved')
  const [reviewNote, setNote] = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const { data } = await api.patch(`/benefits/admin/requests/${request.id}`, { status, reviewNote })
      onDone(data)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">Revisar solicitud</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {request.user.name} · {meta?.icon} {request.amount} {meta?.unit}{request.date ? ` · ${request.date}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {request.reason && (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-400 mb-1">Motivo</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 italic">{request.reason}</p>
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
              placeholder={status === 'rejected' ? 'Explicá el motivo del rechazo…' : 'Opcional'}
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

// Otorgar/ajustar el saldo de un banco para una persona — mismo patrón que
// VacationEditModal (RRHH → Vacaciones), genérico por `bank`.
function AdjustModal({ user, bank, onClose, onUpdated }) {
  const meta = BENEFIT_BANKS[bank]
  const [newBalance, setNewBalance] = useState(String(user.balance ?? 0))
  const [description, setDescription] = useState('')
  const [history, setHistory]       = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    api.get(`/benefits/admin/adjustments/${user.userId}`, { params: { bank } })
      .then(r => setHistory(r.data))
      .catch(() => setHistory([]))
  }, [user.userId, bank])

  async function handleSave() {
    const balance = Number(newBalance)
    if (!Number.isFinite(balance) || balance < 0) { setError(`Ingresá un número válido de ${meta.unit} (0 o más)`); return }
    if (!description.trim()) { setError('La descripción es requerida'); return }
    setSaving(true); setError('')
    try {
      const { data } = await api.patch(`/benefits/admin/balances/${user.userId}`, { bank, newBalance: balance, description })
      onUpdated(data)
      onClose()
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">{meta.icon} Otorgar / ajustar {meta.label.toLowerCase()}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user.user.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-0.5">Actual</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{user.balance ?? 0}</p>
              <p className="text-xs text-gray-400">{meta.unit}</p>
            </div>
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            <div className="flex-1">
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Nueva cantidad</label>
              <input
                type="number" min="0" step="0.5" value={newBalance}
                onChange={e => setNewBalance(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-lg font-bold text-center bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
              Motivo / descripción <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3} value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ej: Ganó el juego de octubre, cubrió el evento del cliente X…"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            onClick={() => setShowHistory(v => !v)}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium flex items-center gap-1"
          >
            {showHistory ? '▲' : '▼'} Ver historial de ajustes
            {history !== null && <span className="text-gray-400">({history.length})</span>}
          </button>

          {showHistory && (
            <div className="max-h-52 overflow-y-auto space-y-2 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              {!history
                ? <p className="text-xs text-gray-400 text-center py-2">Cargando…</p>
                : history.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-2">Sin historial de ajustes</p>
                  : history.map(adj => (
                      <div key={adj.id} className="flex items-start gap-3 text-xs">
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-700 dark:text-gray-200 font-medium truncate">{adj.description}</p>
                          <p className="text-gray-400 dark:text-gray-500">
                            {adj.admin ? `Por ${adj.admin.name} · ` : 'Automático · '}
                            {new Date(adj.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                        <span className={`flex-shrink-0 font-bold ${adj.newBalance >= adj.prevBalance ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                          {adj.prevBalance} → {adj.newBalance}
                        </span>
                      </div>
                    ))
              }
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
          <button
            onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BankSection({ bank, balances, onAdjust }) {
  const meta = BENEFIT_BANKS[bank]
  const sorted = [...balances].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0))
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">{meta.icon} {meta.label}</h3>
      <div className="space-y-2">
        {sorted.map(row => (
          <div key={row.userId} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
            <img src={avatarUrl(row.user.avatar)} alt={row.user.name}
              className="w-9 h-9 rounded-full object-cover flex-shrink-0 border-2 border-gray-100 dark:border-gray-600" />
            <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm text-gray-900 dark:text-white">{row.user.name}</p>
              <RoleBadge userId={row.userId} />
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xl font-bold text-gray-900 dark:text-white">{row.balance ?? 0}</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">{meta.unit}</p>
            </div>
            <button onClick={() => onAdjust(row)}
              className="flex-shrink-0 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors px-2">
              Otorgar
            </button>
          </div>
        ))}
        {sorted.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Sin personas activas.</p>}
      </div>
    </div>
  )
}

export function TabBeneficios() {
  const [pending, setPending]   = useState([])
  const [balances, setBalances] = useState({ horas_libres: [], dias_home: [] })
  const [loading, setLoading]   = useState(true)
  const [reviewing, setReviewing] = useState(null)
  const [adjusting, setAdjusting] = useState(null) // { bank, row }

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get('/benefits/admin/requests', { params: { status: 'pending' } }),
      api.get('/benefits/admin/balances', { params: { bank: 'horas_libres' } }),
      api.get('/benefits/admin/balances', { params: { bank: 'dias_home' } }),
    ])
      .then(([reqs, horas, dias]) => {
        setPending(reqs.data)
        setBalances({ horas_libres: horas.data, dias_home: dias.data })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function handleReviewed(updated) {
    setPending(prev => prev.filter(r => r.id !== updated.id))
    setReviewing(null)
    load() // el balance del banco correspondiente puede haber cambiado
  }

  function handleAdjusted(updated) {
    setBalances(prev => ({
      ...prev,
      [updated.bank]: prev[updated.bank].map(r => r.userId === updated.userId ? { ...r, balance: updated.balance } : r),
    }))
    setAdjusting(null)
  }

  if (loading) return <LoadingSpinner className="py-12" />

  return (
    <div>
      {/* Solicitudes pendientes (de ambos bancos) */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
          ⏳ Solicitudes pendientes <span className="text-gray-400 font-normal">({pending.length})</span>
        </h3>
        {pending.length === 0
          ? <p className="text-sm text-gray-400 py-2">No hay solicitudes pendientes.</p>
          : (
              <div className="space-y-2">
                {pending.map(req => {
                  const meta = BENEFIT_BANKS[req.bank]
                  return (
                    <div key={req.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
                      <img src={avatarUrl(req.user.avatar)} alt={req.user.name}
                        className="w-9 h-9 rounded-full object-cover flex-shrink-0 border-2 border-gray-100 dark:border-gray-600" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 dark:text-white">{req.user.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {meta?.icon} {req.amount} {meta?.unit}{req.date ? ` · ${req.date}` : ''}
                        </p>
                      </div>
                      <button onClick={() => setReviewing(req)}
                        className="flex-shrink-0 text-xs font-medium px-3 py-1.5 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors">
                        Revisar
                      </button>
                    </div>
                  )
                })}
              </div>
            )
        }
      </div>

      {/* Saldos por banco */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <BankSection bank="horas_libres" balances={balances.horas_libres} onAdjust={row => setAdjusting({ bank: 'horas_libres', row })} />
        <BankSection bank="dias_home"    balances={balances.dias_home}    onAdjust={row => setAdjusting({ bank: 'dias_home', row })} />
      </div>

      {reviewing && (
        <ReviewModal request={reviewing} onClose={() => setReviewing(null)} onDone={handleReviewed} />
      )}
      {adjusting && (
        <AdjustModal user={adjusting.row} bank={adjusting.bank} onClose={() => setAdjusting(null)} onUpdated={handleAdjusted} />
      )}
    </div>
  )
}
