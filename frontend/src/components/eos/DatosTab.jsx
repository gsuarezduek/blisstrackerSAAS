import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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

/** Todas las ISO weeks que pertenecen al año ISO dado (52 o 53 semanas) */
function yearWeekPeriods(year) {
  const periods = []
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dow4 = jan4.getUTCDay() || 7
  let d = new Date(Date.UTC(year, 0, 4 - dow4 + 1)) // Lunes de W01
  while (true) {
    const [isoYear, isoWeek] = getISOWeek(d)
    if (isoYear !== year) break
    periods.push(`${isoYear}-W${String(isoWeek).padStart(2, '0')}`)
    d.setUTCDate(d.getUTCDate() + 7)
  }
  return periods
}

/** Los 12 meses del año calendario dado */
function yearMonthPeriods(year) {
  return Array.from({ length: 12 }, (_, i) =>
    `${year}-${String(i + 1).padStart(2, '0')}`
  )
}

const MONTH_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const MONTH_LONG  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const WEEK_MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function weekLabel(period) {
  return 'S' + parseInt(period.split('-W')[1], 10)
}

function weekTooltip(period) {
  const [y, ws] = period.split('-W')
  const year = parseInt(y), week = parseInt(ws)
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dow4 = jan4.getUTCDay() || 7
  const mon  = new Date(Date.UTC(year, 0, 4 - dow4 + 1 + (week - 1) * 7))
  const sun  = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6)
  const fmt  = d => `${d.getUTCDate()} ${WEEK_MONTHS[d.getUTCMonth()]}`
  return `${fmt(mon)} – ${fmt(sun)}`
}

function monthLabel(period) {
  return MONTH_SHORT[parseInt(period.split('-')[1], 10) - 1]
}

function monthTooltip(period) {
  const [year, m] = period.split('-')
  return `${MONTH_LONG[parseInt(m, 10) - 1]} ${year}`
}

function todayWeekPeriod() {
  const now = new Date()
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function todayMonthPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const TODAY_WEEK       = todayWeekPeriod()
const TODAY_MONTH      = todayMonthPeriod()
const TODAY_WEEK_YEAR  = parseInt(TODAY_WEEK.split('-W')[0])
const TODAY_MONTH_YEAR = parseInt(TODAY_MONTH.split('-')[0])

function formatVal(v) {
  if (v === null || v === undefined) return ''
  const n = Number(v)
  if (Number.isInteger(n)) return String(n)
  return String(parseFloat(n.toFixed(2)))
}

// ═══════════════════════════════════════════════════════════════════════════════
// YearNav — navegación de año con botón "Hoy"
// ═══════════════════════════════════════════════════════════════════════════════

function YearNav({ year, onPrev, onNext, isCurrentYear, onToday }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onPrev}
        title="Año anterior"
        className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-semibold"
      >‹</button>
      <span className="text-sm font-bold text-gray-800 dark:text-gray-100 w-12 text-center tabular-nums select-none">
        {year}
      </span>
      <button
        onClick={onNext}
        title="Año siguiente"
        className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-semibold"
      >›</button>
      {!isCurrentYear && (
        <button
          onClick={onToday}
          className="ml-1 px-2.5 py-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 border border-primary-200 dark:border-primary-700 rounded-lg transition-colors"
        >
          Hoy
        </button>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ScoreCell — celda editable de scorecard
// ═══════════════════════════════════════════════════════════════════════════════

function ScoreCell({ metricId, period, initialValue, goal, isCurrent, isWeekly, onSave }) {
  const [val, setVal]       = useState(initialValue != null ? formatVal(initialValue) : '')
  const lastSaved           = useRef(initialValue ?? null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setVal(initialValue != null ? formatVal(initialValue) : '')
    lastSaved.current = initialValue ?? null
  }, [initialValue])

  const numVal   = val === '' ? null : parseFloat(val)
  const hasGoal  = goal != null
  const onTrack  = hasGoal && numVal != null && numVal >= goal
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
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          placeholder="—"
          className={`w-full text-right text-xs bg-transparent focus:outline-none focus:bg-primary-50 dark:focus:bg-primary-900/20 transition-colors ${textColor} ${saving ? 'opacity-40' : ''} ${isWeekly ? 'px-1 py-2' : 'px-2 py-2'}`}
          style={{ minWidth: isWeekly ? 34 : 88 }}
        />
      </div>
    </td>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Modal crear / editar métrica
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
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre de la métrica</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={200}
              placeholder="Ej: Nuevos leads, Facturación mensual, Propuestas enviadas…"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Frecuencia</label>
            <div className="flex gap-2">
              {[
                { v: 'weekly',  label: 'Semanal',  desc: 'S1 – S52 por año' },
                { v: 'monthly', label: 'Mensual',  desc: 'Ene – Dic por año' },
              ].map(opt => (
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
// ScorecardTable — tabla con scroll horizontal y columna sticky
// ═══════════════════════════════════════════════════════════════════════════════

function ScorecardTable({
  metrics, entriesMap, members, periods, currentPeriod,
  labelFn, tooltipFn,
  onEntryChange, onEdit, onDelete,
  containerRef, currentPeriodRef,
  isWeekly,
}) {
  function avg(metricId) {
    const vals = periods.map(p => entriesMap[metricId]?.[p]).filter(v => v != null)
    if (!vals.length) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  const colW = isWeekly ? 'min-w-[38px]' : 'min-w-[96px]'

  return (
    <div ref={containerRef} className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900/60">
            {/* Columna métrica sticky */}
            <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-900 text-left px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 min-w-[180px]">
              Métrica
            </th>
            <th className="px-2 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 text-center min-w-[72px]">
              Resp.
            </th>
            <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 text-right min-w-[58px]">
              Meta
            </th>

            {/* Columnas de período */}
            {periods.map(p => (
              <th
                key={p}
                ref={p === currentPeriod ? currentPeriodRef : null}
                title={tooltipFn ? tooltipFn(p) : undefined}
                className={`px-1 py-2.5 text-xs font-medium border-b border-gray-200 dark:border-gray-700 text-right ${colW} ${
                  p === currentPeriod
                    ? 'text-primary-600 dark:text-primary-400 font-bold border-l-2 border-primary-300 dark:border-primary-700'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                {labelFn(p)}
              </th>
            ))}

            <th className={`px-3 py-2.5 text-xs font-medium text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700 text-right w-[64px] ${
              !isWeekly ? 'sticky right-10 z-10 bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700' : ''
            }`}>
              Prom.
            </th>
            <th className={`px-2 py-2.5 border-b border-gray-200 dark:border-gray-700 w-10 ${
              !isWeekly ? 'sticky right-0 z-10 bg-gray-50 dark:bg-gray-900' : ''
            }`} />
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {metrics.map(metric => {
            const owner   = metric.ownerId ? members.find(m => m.id === metric.ownerId) : null
            const avgVal  = avg(metric.id)
            const hasGoal = metric.goal != null
            const avgOK   = hasGoal && avgVal != null && avgVal >= metric.goal
            const avgBAD  = hasGoal && avgVal != null && avgVal < metric.goal

            return (
              <tr key={metric.id} className="group hover:bg-gray-50/50 dark:hover:bg-gray-700/20">
                {/* Nombre sticky */}
                <td className="sticky left-0 z-10 bg-white dark:bg-gray-800 group-hover:bg-gray-50/50 dark:group-hover:bg-gray-700/20 px-4 py-2 transition-colors">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{metric.name}</span>
                </td>

                {/* Responsable */}
                <td className="px-2 py-2 text-center">
                  {owner ? (
                    <div className="flex items-center justify-center gap-1">
                      <img src={avatarUrl(owner.avatar)} alt={owner.name}
                        className="w-5 h-5 rounded-full object-cover border border-gray-200 dark:border-gray-600 shrink-0" />
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[44px] hidden md:inline">{owner.name.split(' ')[0]}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                  )}
                </td>

                {/* Meta */}
                <td className="px-3 py-2 text-right">
                  {metric.goal != null ? (
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      {formatVal(metric.goal)}
                      {metric.unit ? <span className="font-normal text-gray-400 dark:text-gray-500 ml-0.5">{metric.unit}</span> : null}
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
                    isWeekly={isWeekly}
                    onSave={onEntryChange}
                  />
                ))}

                {/* Promedio */}
                <td className={`px-3 py-2 text-right w-[64px] ${
                  !isWeekly ? 'sticky right-10 z-10 bg-white dark:bg-gray-800 group-hover:bg-gray-50/50 dark:group-hover:bg-gray-700/20 border-l border-gray-100 dark:border-gray-700' : ''
                }`}>
                  {avgVal != null ? (
                    <span className={`text-xs font-medium ${
                      avgOK  ? 'text-green-600 dark:text-green-400'
                    : avgBAD ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {formatVal(avgVal)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                  )}
                </td>

                {/* Acciones */}
                <td className={`px-2 py-2 text-center w-10 ${
                  !isWeekly ? 'sticky right-0 z-10 bg-white dark:bg-gray-800 group-hover:bg-gray-50/50 dark:group-hover:bg-gray-700/20' : ''
                }`}>
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
// ConfirmModal
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

// ═══════════════════════════════════════════════════════════════════════════════
// DatosTab — componente principal
// ═══════════════════════════════════════════════════════════════════════════════

export default function DatosTab() {
  const [members,     setMembers]     = useState([])
  const [metrics,     setMetrics]     = useState([])
  const [entriesMap,  setEntriesMap]  = useState({})
  const [loading,     setLoading]     = useState(true)
  const [modalMetric, setModalMetric] = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(null)
  const [weekYear,    setWeekYear]    = useState(TODAY_WEEK_YEAR)
  const [monthYear,   setMonthYear]   = useState(TODAY_MONTH_YEAR)

  // Refs para auto-scroll de tablas
  const weekContainerRef  = useRef(null)
  const weekCurrentThRef  = useRef(null)
  const monthContainerRef = useRef(null)
  const monthCurrentThRef = useRef(null)

  const weeklyPeriods  = useMemo(() => yearWeekPeriods(weekYear),   [weekYear])
  const monthlyPeriods = useMemo(() => yearMonthPeriods(monthYear), [monthYear])

  // El período actual solo se resalta cuando estamos en el año actual
  const curWeek  = weekYear  === TODAY_WEEK_YEAR  ? TODAY_WEEK  : null
  const curMonth = monthYear === TODAY_MONTH_YEAR ? TODAY_MONTH : null

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

  // Auto-scroll semanal: centra la semana actual al cargar o cambiar de año
  useEffect(() => {
    if (loading) return
    const container = weekContainerRef.current
    if (!container) return

    requestAnimationFrame(() => {
      const curTh = weekCurrentThRef.current
      if (curTh) {
        const cRect  = container.getBoundingClientRect()
        const thRect = curTh.getBoundingClientRect()
        const target = container.scrollLeft + thRect.left - cRect.left - cRect.width / 2 + thRect.width / 2
        container.scrollLeft = Math.max(0, target)
      } else {
        // Para años que no son el actual: ir al inicio (S1)
        container.scrollLeft = 0
      }
    })
  }, [weekYear, loading])

  // Auto-scroll mensual: posiciona el mes actual con 3 anteriores visibles a la izquierda
  useEffect(() => {
    if (loading) return
    const container = monthContainerRef.current
    if (!container) return

    requestAnimationFrame(() => {
      const curTh = monthCurrentThRef.current
      if (curTh) {
        const cRect  = container.getBoundingClientRect()
        const thRect = curTh.getBoundingClientRect()
        // Centrar el mes actual en el viewport
        const target = container.scrollLeft + thRect.left - cRect.left - cRect.width / 2 + thRect.width / 2
        container.scrollLeft = Math.max(0, target)
      } else {
        container.scrollLeft = 0
      }
    })
  }, [monthYear, loading])

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
    return (
      <div className="flex justify-center py-16">
        <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
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
          <button
            onClick={() => setModalMetric({ mode: 'add' })}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-colors shrink-0"
          >
            + Nueva métrica
          </button>
        </div>

        {/* Leyenda */}
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
          <div className="flex items-center gap-1.5 ml-2 pl-4 border-l border-gray-200 dark:border-gray-700">
            <span className="text-xs text-gray-400 dark:text-gray-500 italic">Hover en encabezados semanales para ver fecha exacta</span>
          </div>
        </div>
      </div>

      {/* Estado vacío */}
      {metrics.length === 0 && (
        <div className="bg-white dark:bg-gray-800 border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
          <p className="text-3xl mb-3">📊</p>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sin métricas todavía</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
            Agregá los números que importan: leads, facturación, propuestas enviadas, clientes atendidos…
          </p>
          <button
            onClick={() => setModalMetric({ mode: 'add' })}
            className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors"
          >
            + Agregar primera métrica
          </button>
        </div>
      )}

      {/* ── Tabla semanal ── */}
      {weeklyMetrics.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">Semanales</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">· {weeklyPeriods.length} semanas · scroll horizontal</span>
            </div>
            <YearNav
              year={weekYear}
              onPrev={() => setWeekYear(y => y - 1)}
              onNext={() => setWeekYear(y => y + 1)}
              isCurrentYear={weekYear === TODAY_WEEK_YEAR}
              onToday={() => setWeekYear(TODAY_WEEK_YEAR)}
            />
          </div>
          <ScorecardTable
            metrics={weeklyMetrics}
            entriesMap={entriesMap}
            members={members}
            periods={weeklyPeriods}
            currentPeriod={curWeek}
            labelFn={weekLabel}
            tooltipFn={weekTooltip}
            onEntryChange={handleEntryChange}
            onEdit={metric => setModalMetric({ mode: 'edit', metric })}
            onDelete={id => setConfirmDel({ id })}
            containerRef={weekContainerRef}
            currentPeriodRef={weekCurrentThRef}
            isWeekly={true}
          />
        </div>
      )}

      {/* ── Tabla mensual ── */}
      {monthlyMetrics.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">Mensuales</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">· Ene – Dic</span>
            </div>
            <YearNav
              year={monthYear}
              onPrev={() => setMonthYear(y => y - 1)}
              onNext={() => setMonthYear(y => y + 1)}
              isCurrentYear={monthYear === TODAY_MONTH_YEAR}
              onToday={() => setMonthYear(TODAY_MONTH_YEAR)}
            />
          </div>
          <ScorecardTable
            metrics={monthlyMetrics}
            entriesMap={entriesMap}
            members={members}
            periods={monthlyPeriods}
            currentPeriod={curMonth}
            labelFn={monthLabel}
            tooltipFn={monthTooltip}
            onEntryChange={handleEntryChange}
            onEdit={metric => setModalMetric({ mode: 'edit', metric })}
            onDelete={id => setConfirmDel({ id })}
            containerRef={monthContainerRef}
            currentPeriodRef={monthCurrentThRef}
            isWeekly={false}
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
