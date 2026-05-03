import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../api/client'
import { avatarUrl } from '../../utils/avatarUrl'

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers de períodos (ISO week + meses)
// ═══════════════════════════════════════════════════════════════════════════════

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return [d.getUTCFullYear(), week]
}

function weekPeriod(date) {
  const [year, week] = getISOWeek(date)
  return `${year}-W${String(week).padStart(2, '0')}`
}

function lastNWeekPeriods(n) {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (n - 1 - i) * 7)
    return weekPeriod(d)
  })
}

function lastNMonthPeriods(n) {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function weekLabel(period) {
  // "2026-W18" → "S18"
  return 'S' + parseInt(period.split('-W')[1], 10)
}

function monthLabel(period) {
  // "2026-05" → "May"
  return MONTH_NAMES[parseInt(period.split('-')[1], 10) - 1]
}

function currentWeekPeriod() { return weekPeriod(new Date()) }
function currentMonthPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatVal(v) {
  if (v === null || v === undefined) return ''
  const n = Number(v)
  if (Number.isInteger(n)) return String(n)
  return String(parseFloat(n.toFixed(2)))
}

// ═══════════════════════════════════════════════════════════════════════════════
// Celda editable de scorecard
// ═══════════════════════════════════════════════════════════════════════════════

function ScoreCell({ metricId, period, initialValue, goal, isCurrent, onSave }) {
  const [val, setVal]     = useState(initialValue != null ? formatVal(initialValue) : '')
  const lastSaved         = useRef(initialValue ?? null)
  const [saving, setSaving] = useState(false)

  // Sincronizar si cambia el valor externo (ej: reload de datos)
  useEffect(() => {
    setVal(initialValue != null ? formatVal(initialValue) : '')
    lastSaved.current = initialValue ?? null
  }, [initialValue])

  const numVal  = val === '' ? null : parseFloat(val)
  const hasGoal = goal != null
  const onTrack = hasGoal && numVal != null && numVal >= goal
  const offTrack = hasGoal && numVal != null && numVal < goal

  async function save() {
    const newVal = val === '' ? null : parseFloat(val)
    if (isNaN(newVal) && val !== '') { setVal(formatVal(lastSaved.current)); return }
    if (newVal === lastSaved.current) return
    setSaving(true)
    await onSave(metricId, period, newVal)
    lastSaved.current = newVal
    setSaving(false)
  }

  const bg = onTrack  ? 'bg-green-50 dark:bg-green-900/25'
           : offTrack ? 'bg-red-50 dark:bg-red-900/20'
           : ''

  const textColor = onTrack  ? 'text-green-800 dark:text-green-300'
                  : offTrack ? 'text-red-700 dark:text-red-400'
                  : 'text-gray-700 dark:text-gray-300'

  return (
    <td className={`p-0 ${isCurrent ? 'border-l-2 border-primary-300 dark:border-primary-700' : ''}`}>
      <div className={`relative ${bg} transition-colors`}>
        <input
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
          placeholder="—"
          className={`w-full text-right text-xs px-2 py-2 bg-transparent focus:outline-none focus:bg-primary-50 dark:focus:bg-primary-900/20 transition-colors ${textColor} ${saving ? 'opacity-40' : ''}`}
          style={{ minWidth: 52 }}
        />
      </div>
    </td>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Modal para crear / editar una métrica
// ═══════════════════════════════════════════════════════════════════════════════

const UNITS = ['', '#', '$', '%', 'hs', 'días', 'km', 'kg', 'leads', 'clientes', 'ventas', 'tickets']

function MetricModal({ metric, members, onSave, onClose, saving }) {
  const [name,      setName]      = useState(metric?.name      ?? '')
  const [ownerId,   setOwnerId]   = useState(metric?.ownerId   != null ? String(metric.ownerId) : '')
  const [goal,      setGoal]      = useState(metric?.goal      != null ? String(metric.goal)    : '')
  const [unit,      setUnit]      = useState(metric?.unit      ?? '')
  const [frequency, setFrequency] = useState(metric?.frequency ?? 'weekly')

  function handleSave() {
    if (!name.trim()) return
    onSave({
      name:      name.trim(),
      ownerId:   ownerId   ? Number(ownerId)  : null,
      goal:      goal !== '' ? Number(goal)   : null,
      unit:      unit.trim() || null,
      frequency,
    })
  }

  const isNew = !metric?.id

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {isNew ? 'Nueva métrica' : 'Editar métrica'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre de la métrica</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={200}
              placeholder="Ej: Nuevos leads, Facturación mensual, Propuestas enviadas…"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Frecuencia */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Frecuencia</label>
            <div className="flex gap-2">
              {[{ v: 'weekly', label: 'Semanal', desc: '13 semanas' }, { v: 'monthly', label: 'Mensual', desc: '12 meses' }].map(opt => (
                <button key={opt.v} type="button" onClick={() => setFrequency(opt.v)}
                  className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    frequency === opt.v
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                  }`}>
                  <div>{opt.label}</div>
                  <div className="text-xs opacity-60 font-normal mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Meta + Unidad */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meta</label>
              <input type="number" value={goal} onChange={e => setGoal(e.target.value)}
                placeholder="Ej: 10"
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="w-28">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unidad</label>
              <input type="text" value={unit} onChange={e => setUnit(e.target.value)} maxLength={20}
                list="unit-suggestions" placeholder="Ej: leads"
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <datalist id="unit-suggestions">
                {UNITS.filter(Boolean).map(u => <option key={u} value={u} />)}
              </datalist>
            </div>
          </div>

          {/* Responsable */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Responsable</label>
            <select value={ownerId} onChange={e => setOwnerId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Sin asignar</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={!name.trim() || saving}
            className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tabla de scorecard (semanal o mensual)
// ═══════════════════════════════════════════════════════════════════════════════

function ScorecardTable({ metrics, entriesMap, members, periods, currentPeriod, labelFn, onEntryChange, onEdit, onDelete }) {
  function avg(metricId) {
    const vals = periods.map(p => entriesMap[metricId]?.[p]).filter(v => v != null)
    if (!vals.length) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900/60">
            {/* Columna métrica — sticky */}
            <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-900 text-left px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 min-w-[180px]">
              Métrica
            </th>
            <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 text-center min-w-[90px]">
              Responsable
            </th>
            <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 text-right min-w-[70px]">
              Meta
            </th>
            {periods.map(p => (
              <th key={p} className={`px-1 py-2.5 text-xs font-medium border-b border-gray-200 dark:border-gray-700 text-right min-w-[52px] ${
                p === currentPeriod
                  ? 'text-primary-600 dark:text-primary-400 font-semibold border-l-2 border-primary-300 dark:border-primary-700'
                  : 'text-gray-400 dark:text-gray-500'
              }`}>
                {labelFn(p)}
              </th>
            ))}
            <th className="px-3 py-2.5 text-xs font-medium text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700 text-right min-w-[60px]">
              Prom.
            </th>
            <th className="px-2 py-2.5 border-b border-gray-200 dark:border-gray-700 w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {metrics.map(metric => {
            const owner  = metric.ownerId ? members.find(m => m.id === metric.ownerId) : null
            const avgVal = avg(metric.id)
            const hasGoal = metric.goal != null
            const avgOnTrack  = hasGoal && avgVal != null && avgVal >= metric.goal
            const avgOffTrack = hasGoal && avgVal != null && avgVal < metric.goal

            return (
              <tr key={metric.id} className="group hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                {/* Nombre */}
                <td className="sticky left-0 z-10 bg-white dark:bg-gray-800 group-hover:bg-gray-50/50 dark:group-hover:bg-gray-700/20 px-4 py-2 transition-colors">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{metric.name}</span>
                </td>

                {/* Responsable */}
                <td className="px-3 py-2 text-center">
                  {owner ? (
                    <div className="flex items-center justify-center gap-1.5">
                      <img src={avatarUrl(owner.avatar)} alt={owner.name}
                        className="w-5 h-5 rounded-full object-cover border border-gray-200 dark:border-gray-600" />
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[60px]">{owner.name}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-300 dark:text-gray-600 italic">—</span>
                  )}
                </td>

                {/* Meta */}
                <td className="px-3 py-2 text-right">
                  {metric.goal != null ? (
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      {formatVal(metric.goal)}{metric.unit ? <span className="font-normal text-gray-400 dark:text-gray-500 ml-0.5">{metric.unit}</span> : null}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                  )}
                </td>

                {/* Celdas de período */}
                {periods.map(period => (
                  <ScoreCell
                    key={period}
                    metricId={metric.id}
                    period={period}
                    initialValue={entriesMap[metric.id]?.[period] ?? null}
                    goal={metric.goal}
                    isCurrent={period === currentPeriod}
                    onSave={onEntryChange}
                  />
                ))}

                {/* Promedio */}
                <td className="px-3 py-2 text-right">
                  {avgVal != null ? (
                    <span className={`text-xs font-medium ${
                      avgOnTrack  ? 'text-green-600 dark:text-green-400'
                    : avgOffTrack ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {formatVal(avgVal)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                  )}
                </td>

                {/* Acciones */}
                <td className="px-2 py-2 text-center">
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-center">
                    <button onClick={() => onEdit(metric)} title="Editar"
                      className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs transition-colors">✎</button>
                    <button onClick={() => onDelete(metric.id)} title="Eliminar"
                      className="p-1 text-gray-400 hover:text-red-500 text-xs transition-colors">✕</button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// DatosTab — componente principal
// ═══════════════════════════════════════════════════════════════════════════════

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-5">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel}  className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors">Eliminar</button>
        </div>
      </div>
    </div>
  )
}

export default function DatosTab() {
  const [members,    setMembers]    = useState([])
  const [metrics,    setMetrics]    = useState([])
  const [entriesMap, setEntriesMap] = useState({})  // { [metricId]: { [period]: value } }
  const [loading,    setLoading]    = useState(true)
  const [modalMetric, setModalMetric] = useState(null)   // { mode: 'add'|'edit', metric? }
  const [saving,      setSaving]      = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(null)

  const weeklyPeriods  = lastNWeekPeriods(13)
  const monthlyPeriods = lastNMonthPeriods(12)
  const curWeek  = currentWeekPeriod()
  const curMonth = currentMonthPeriod()

  useEffect(() => {
    api.get('/eos/scorecard')
      .then(res => {
        setMembers(res.data.members)
        setMetrics(res.data.metrics)
        setEntriesMap(res.data.entriesMap)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // ── Guardar valor de celda
  const handleEntryChange = useCallback(async (metricId, period, value) => {
    await api.put(`/eos/scorecard/${metricId}/entries/${period}`, { value })
    setEntriesMap(prev => {
      const map = { ...prev, [metricId]: { ...prev[metricId] } }
      if (value == null) {
        delete map[metricId][period]
      } else {
        map[metricId][period] = value
      }
      return map
    })
  }, [])

  // ── Crear / editar métrica
  async function handleSaveMetric(data) {
    setSaving(true)
    try {
      if (modalMetric.mode === 'add') {
        const res = await api.post('/eos/scorecard', data)
        setMetrics(prev => [...prev, res.data])
      } else {
        const res = await api.patch(`/eos/scorecard/${modalMetric.metric.id}`, data)
        setMetrics(prev => prev.map(m => m.id === modalMetric.metric.id ? res.data : m))
      }
      setModalMetric(null)
    } finally { setSaving(false) }
  }

  // ── Eliminar métrica
  async function handleDeleteMetric(id) {
    await api.delete(`/eos/scorecard/${id}`)
    setMetrics(prev => prev.filter(m => m.id !== id))
    setEntriesMap(prev => { const next = { ...prev }; delete next[id]; return next })
    setConfirmDel(null)
  }

  const weeklyMetrics  = metrics.filter(m => m.frequency === 'weekly')
  const monthlyMetrics = metrics.filter(m => m.frequency === 'monthly')

  if (loading) {
    return <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Scorecard</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Métricas clave del negocio con seguimiento por período.
              Verde = alcanzó la meta · Rojo = por debajo.
            </p>
          </div>
          <button onClick={() => setModalMetric({ mode: 'add' })}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-colors shrink-0">
            + Nueva métrica
          </button>
        </div>

        {/* Leyenda de colores */}
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="w-8 h-5 rounded bg-green-100 dark:bg-green-900/40 border border-green-200 dark:border-green-800" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Alcanzó la meta</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-8 h-5 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Por debajo de la meta</span>
          </div>
          <div className="flex items-center gap-2 ml-2 pl-4 border-l border-gray-200 dark:border-gray-700">
            <span className="w-0.5 h-5 bg-primary-400 dark:bg-primary-600 rounded" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Período actual</span>
          </div>
        </div>
      </div>

      {/* Estado vacío */}
      {metrics.length === 0 && (
        <div className="bg-white dark:bg-gray-800 border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
          <p className="text-3xl mb-3">📊</p>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sin métricas todavía</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
            Agregá los números que importan: leads, facturación, propuestas enviadas, clientes atendidos… lo que tu equipo debe mirar cada semana o mes.
          </p>
          <button onClick={() => setModalMetric({ mode: 'add' })}
            className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors">
            + Agregar primera métrica
          </button>
        </div>
      )}

      {/* Tabla semanal */}
      {weeklyMetrics.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">Semanales</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">· últimas 13 semanas</span>
          </div>
          <ScorecardTable
            metrics={weeklyMetrics}
            entriesMap={entriesMap}
            members={members}
            periods={weeklyPeriods}
            currentPeriod={curWeek}
            labelFn={weekLabel}
            onEntryChange={handleEntryChange}
            onEdit={metric => setModalMetric({ mode: 'edit', metric })}
            onDelete={id => setConfirmDel({ id })}
          />
        </div>
      )}

      {/* Tabla mensual */}
      {monthlyMetrics.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">Mensuales</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">· últimos 12 meses</span>
          </div>
          <ScorecardTable
            metrics={monthlyMetrics}
            entriesMap={entriesMap}
            members={members}
            periods={monthlyPeriods}
            currentPeriod={curMonth}
            labelFn={monthLabel}
            onEntryChange={handleEntryChange}
            onEdit={metric => setModalMetric({ mode: 'edit', metric })}
            onDelete={id => setConfirmDel({ id })}
          />
        </div>
      )}

      {/* Modal crear/editar */}
      {modalMetric && (
        <MetricModal
          metric={modalMetric.mode === 'edit' ? modalMetric.metric : null}
          members={members}
          onSave={handleSaveMetric}
          onClose={() => setModalMetric(null)}
          saving={saving}
        />
      )}

      {/* Modal confirmar borrado */}
      {confirmDel && (
        <ConfirmModal
          message="¿Eliminás esta métrica? Se borrarán también todos sus datos históricos."
          onConfirm={() => handleDeleteMetric(confirmDel.id)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  )
}
