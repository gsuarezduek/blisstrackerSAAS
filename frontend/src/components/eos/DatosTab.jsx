import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import api from '../../api/client'
import {
  TODAY_WEEK, TODAY_MONTH, TODAY_WEEK_YEAR, TODAY_MONTH_YEAR,
  yearWeekPeriods, yearMonthPeriods,
  weekLabel, weekTooltip, weekRange, monthLabel, monthTooltip,
  shiftWeekPeriod, shiftMonthPeriod,
  WEEK_MONTHS, MONTH_LONG,
} from './datos/scorecardHelpers'
import { YearNav, SectionTabs } from './datos/ScorecardNav'
import { CurrentPeriodPanel, MonthNotesPanel } from './datos/CurrentPeriodPanel'
import ScorecardTable from './datos/ScorecardTable'
import { MetricModal, ConfirmModal, AutoMetricPicker } from './datos/MetricModals'
import { ChartColumn } from 'lucide-react'
import { Icon } from '../ui/Icon'

// ═══════════════════════════════════════════════════════════════════════════════
// DatosTab — componente principal
// ═══════════════════════════════════════════════════════════════════════════════

export default function DatosTab() {
  const [members,     setMembers]     = useState([])
  const [metrics,     setMetrics]     = useState([])
  const [entriesMap,  setEntriesMap]  = useState({})
  const [autoData,    setAutoData]    = useState({})   // { autoKey: { 'YYYY-Www': { value, top3 } } }
  const [currentStatus, setCurrentStatus] = useState({}) // { autoKey: 'collecting' | 'not_saving' } (mes en curso)
  const [autoCatalog, setAutoCatalog] = useState([])
  const [autoPicker,  setAutoPicker]  = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [modalMetric, setModalMetric] = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(null)
  const [weekYear,    setWeekYear]    = useState(TODAY_WEEK_YEAR)
  const [monthYear,   setMonthYear]   = useState(TODAY_MONTH_YEAR)
  // Por defecto el panel muestra el período ANTERIOR (semana/mes pasados): son los últimos
  // con datos completos, que normalmente se cargan a posteriori. "Hoy" vuelve al actual.
  const [panelWeek,   setPanelWeek]   = useState(() => shiftWeekPeriod(TODAY_WEEK, -1))
  const [panelMonth,  setPanelMonth]  = useState(() => shiftMonthPeriod(TODAY_MONTH, -1))

  // Sección semanal: Datos / Histórico (ver SectionTabs) — sin tab de notas,
  // a diferencia de la mensual.
  const [weeklyTab, setWeeklyTab] = useState('datos')

  // Sección mensual: Datos / Notas / Histórico (ver SectionTabs). Índice de
  // meses con nota ({ [period]: true }, para el puntito del tab/tabla) + cache
  // del HTML de cada nota ya pedida (fallbackContent del editor colaborativo).
  const [monthlyTab,      setMonthlyTab]      = useState('datos')
  const [notesIndex,      setNotesIndex]      = useState({})
  const [noteContentCache, setNoteContentCache] = useState({})

  // Años de los que ya cargamos los valores automáticos (para no re-pedir).
  const loadedAutoYears = useRef(new Set())
  // Años de los que ya cargamos el índice de notas, y períodos cuyo contenido
  // ya se pidió (para no re-pedir).
  const loadedNoteYears   = useRef(new Set())
  const loadedNotePeriods = useRef(new Set())

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

  // Trae los valores automáticos de un año (una sola vez por año).
  const fetchAutoYear = useCallback(async (year) => {
    if (loadedAutoYears.current.has(year)) return
    loadedAutoYears.current.add(year)
    try {
      const res = await api.get(`/eos/scorecard/auto?year=${year}`)
      const data = res.data?.data || {}
      setAutoData(prev => {
        const next = { ...prev }
        for (const k of Object.keys(data)) next[k] = { ...(next[k] || {}), ...data[k] }
        return next
      })
      // El estado del mes en curso solo viene en la respuesta del año actual.
      const status = res.data?.currentStatus
      if (status && Object.keys(status).length) setCurrentStatus(prev => ({ ...prev, ...status }))
    } catch {
      loadedAutoYears.current.delete(year)
    }
  }, [])

  // Índice de meses con nota de un año (`force` re-pide aunque ya se haya
  // cargado — se usa al abrir el tab Histórico, para reflejar notas recién
  // agregadas/vaciadas sin depender de un refresh de página).
  const fetchNotesYear = useCallback(async (year, force = false) => {
    if (!force && loadedNoteYears.current.has(year)) return
    loadedNoteYears.current.add(year)
    try {
      const res = await api.get(`/eos/scorecard/notes?year=${year}`)
      const periods = res.data?.periods || []
      setNotesIndex(prev => {
        const next = { ...prev }
        Object.keys(next).forEach(p => { if (p.startsWith(`${year}-`)) delete next[p] })
        periods.forEach(p => { next[p] = true })
        return next
      })
    } catch {
      loadedNoteYears.current.delete(year)
    }
  }, [])

  // Contenido de la nota de un período puntual (fallbackContent del editor
  // colaborativo mientras conecta — ver MonthNotesPanel).
  const fetchNoteContent = useCallback(async (period) => {
    if (loadedNotePeriods.current.has(period)) return
    loadedNotePeriods.current.add(period)
    try {
      const res = await api.get(`/eos/scorecard/notes/${period}`)
      setNoteContentCache(prev => ({ ...prev, [period]: res.data?.notes || '' }))
    } catch {
      loadedNotePeriods.current.delete(period)
    }
  }, [])

  // Reinicia y vuelve a traer los años visibles (tras agregar/quitar un dato automático).
  const reloadAuto = useCallback(() => {
    loadedAutoYears.current = new Set()
    setAutoData({})
    setCurrentStatus({})
    const years = new Set([weekYear, monthYear, parseInt(panelWeek.split('-W')[0]), parseInt(panelMonth.split('-')[0])])
    years.forEach(y => fetchAutoYear(y))
  }, [fetchAutoYear, weekYear, monthYear, panelWeek, panelMonth])

  useEffect(() => {
    api.get('/eos/scorecard')
      .then(res => {
        setMembers(res.data.members)
        setMetrics(res.data.metrics)
        setEntriesMap(res.data.entriesMap)
        setAutoCatalog(res.data.autoCatalog || [])
        if ((res.data.autoCatalog || []).some(c => c.added)) fetchAutoYear(TODAY_WEEK_YEAR)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [fetchAutoYear])

  // Cargar valores automáticos del año de las tablas y los paneles cuando cambian.
  const hasAuto = metrics.some(m => m.autoKey)
  useEffect(() => { if (hasAuto) fetchAutoYear(weekYear) }, [weekYear, hasAuto, fetchAutoYear])
  useEffect(() => { if (hasAuto) fetchAutoYear(monthYear) }, [monthYear, hasAuto, fetchAutoYear])
  useEffect(() => {
    if (hasAuto) fetchAutoYear(parseInt(panelWeek.split('-W')[0]))
  }, [panelWeek, hasAuto, fetchAutoYear])
  useEffect(() => {
    if (hasAuto) fetchAutoYear(parseInt(panelMonth.split('-')[0]))
  }, [panelMonth, hasAuto, fetchAutoYear])

  // Índice de notas del año mostrado en el histórico mensual (puntito en Tabs +
  // en los encabezados de mes de la tabla) + contenido de la nota del período
  // seleccionado, pedido recién al abrir el tab Notas.
  const hasMonthly = metrics.some(m => m.frequency === 'monthly')
  useEffect(() => { if (hasMonthly) fetchNotesYear(monthYear) }, [monthYear, hasMonthly, fetchNotesYear])
  useEffect(() => {
    if (monthlyTab === 'notas') fetchNoteContent(panelMonth)
  }, [monthlyTab, panelMonth, fetchNoteContent])

  // Auto-scroll semanal: centra la semana actual al cargar o cambiar de año,
  // o al abrir el tab Histórico (antes de eso la tabla no queda montada).
  useEffect(() => {
    if (loading || weeklyTab !== 'historico') return
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
        container.scrollLeft = 0
      }
    })
  }, [weekYear, loading, weeklyTab])

  // Auto-scroll mensual — también al abrir el tab Histórico (antes de eso,
  // `monthContainerRef` no existe todavía: la tabla ya no queda siempre montada).
  useEffect(() => {
    if (loading || monthlyTab !== 'historico') return
    const container = monthContainerRef.current
    if (!container) return

    requestAnimationFrame(() => {
      const curTh = monthCurrentThRef.current
      if (curTh) {
        const cRect  = container.getBoundingClientRect()
        const thRect = curTh.getBoundingClientRect()
        const target = container.scrollLeft + thRect.left - cRect.left - cRect.width / 2 + thRect.width / 2
        container.scrollLeft = Math.max(0, target)
      } else {
        container.scrollLeft = 0
      }
    })
  }, [monthYear, loading, monthlyTab])

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

  // ── Agregar un dato automático desde el catálogo
  async function handleAddAuto(autoKey, goal) {
    setSaving(true)
    try {
      const res = await api.post('/eos/scorecard', {
        autoKey,
        goal: goal !== '' && goal != null ? Number(goal) : null,
      })
      setMetrics(prev => [...prev, res.data])
      setAutoCatalog(prev => prev.map(c => c.key === autoKey ? { ...c, added: true } : c))
      reloadAuto()
    } finally { setSaving(false) }
  }

  // ── Eliminar métrica
  async function handleDeleteMetric(id) {
    const removed = metrics.find(m => m.id === id)
    await api.delete(`/eos/scorecard/${id}`)
    setMetrics(prev => prev.filter(m => m.id !== id))
    setEntriesMap(prev => { const next = { ...prev }; delete next[id]; return next })
    if (removed?.autoKey) {
      setAutoCatalog(prev => prev.map(c => c.key === removed.autoKey ? { ...c, added: false } : c))
      setAutoData(prev => { const next = { ...prev }; delete next[removed.autoKey]; return next })
    }
    setConfirmDel(null)
  }

  const weeklyMetrics  = metrics.filter(m => m.frequency === 'weekly')
  const monthlyMetrics = metrics.filter(m => m.frequency === 'monthly')

  // Título + subtítulo del panel semanal según el período seleccionado
  const weekPanelTitle = useMemo(() => {
    if (panelWeek === TODAY_WEEK) return `Datos de esta semana (${weekLabel(panelWeek)})`
    return `Datos de ${weekLabel(panelWeek)}`
  }, [panelWeek])

  const weekPanelSubtitle = useMemo(() => {
    const { mon, sun } = weekRange(panelWeek)
    const fmt = d => `${d.getUTCDate()} ${WEEK_MONTHS[d.getUTCMonth()]}`
    const [y] = panelWeek.split('-W')
    const yearLabel = parseInt(y) !== TODAY_WEEK_YEAR ? ` ${y}` : ''
    return `${fmt(mon)} – ${fmt(sun)}${yearLabel}`
  }, [panelWeek])

  const monthPanelTitle = useMemo(() => {
    if (panelMonth === TODAY_MONTH) return 'Datos de este mes'
    const [year, m] = panelMonth.split('-')
    return `Datos de ${MONTH_LONG[parseInt(m, 10) - 1]}${parseInt(year) !== TODAY_MONTH_YEAR ? ` ${year}` : ''}`
  }, [panelMonth])

  const monthPanelSubtitle = useMemo(() => {
    if (panelMonth === TODAY_MONTH) {
      const [year, m] = panelMonth.split('-')
      return `${MONTH_LONG[parseInt(m, 10) - 1]} ${year}`
    }
    return null
  }, [panelMonth])

  const canGoForwardWeek  = panelWeek  < TODAY_WEEK
  const canGoForwardMonth = panelMonth < TODAY_MONTH

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
              Verde = cumplió la meta · Rojo = no la cumplió.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {autoCatalog.length > 0 && (
              <button
                onClick={() => setAutoPicker(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-colors"
              >
                Dato automático
              </button>
            )}
            <button
              onClick={() => setModalMetric({ mode: 'add' })}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-colors"
            >
              + Nueva métrica
            </button>
          </div>
        </div>

        {/* Leyenda */}
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="w-8 h-5 rounded bg-green-100 dark:bg-green-900/40 border border-green-200 dark:border-green-800" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Cumplió la meta (≥ o ≤ según dirección)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-8 h-5 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" />
            <span className="text-xs text-gray-500 dark:text-gray-400">No cumplió la meta</span>
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
          <p className="mb-3"><Icon as={ChartColumn} size={28} className="inline-block text-gray-300 dark:text-gray-600" /></p>
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

      {/* ── Sección semanal: Datos / Histórico ── */}
      {weeklyMetrics.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">Semanales</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">· {weeklyPeriods.length} semanas</span>
            </div>
            {/* El año solo afecta al histórico — Datos navega por período propio */}
            {weeklyTab === 'historico' && (
              <YearNav
                year={weekYear}
                onPrev={() => setWeekYear(y => y - 1)}
                onNext={() => setWeekYear(y => y + 1)}
                isCurrentYear={weekYear === TODAY_WEEK_YEAR}
                onToday={() => setWeekYear(TODAY_WEEK_YEAR)}
              />
            )}
          </div>

          <SectionTabs
            active={weeklyTab}
            onChange={setWeeklyTab}
            tabs={[
              { key: 'datos',     label: 'Datos' },
              { key: 'historico', label: 'Histórico' },
            ]}
          />

          {weeklyTab === 'datos' && (
            <CurrentPeriodPanel
              metrics={weeklyMetrics}
              entriesMap={entriesMap}
              autoData={autoData}
              currentStatus={currentStatus}
              members={members}
              period={panelWeek}
              title={weekPanelTitle}
              subtitle={weekPanelSubtitle}
              onEntryChange={handleEntryChange}
              isCurrent={panelWeek === TODAY_WEEK}
              canGoForward={canGoForwardWeek}
              onPrev={() => setPanelWeek(p => shiftWeekPeriod(p, -1))}
              onNext={() => setPanelWeek(p => shiftWeekPeriod(p, +1))}
              onToday={() => setPanelWeek(TODAY_WEEK)}
            />
          )}

          {weeklyTab === 'historico' && (
            <ScorecardTable
              metrics={weeklyMetrics}
              entriesMap={entriesMap}
              autoData={autoData}
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
          )}
        </div>
      )}

      {/* ── Sección mensual: Datos / Notas / Histórico ── */}
      {monthlyMetrics.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">Mensuales</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">· Ene – Dic</span>
            </div>
            {/* El año solo afecta al histórico — Datos/Notas navegan por período propio */}
            {monthlyTab === 'historico' && (
              <YearNav
                year={monthYear}
                onPrev={() => setMonthYear(y => y - 1)}
                onNext={() => setMonthYear(y => y + 1)}
                isCurrentYear={monthYear === TODAY_MONTH_YEAR}
                onToday={() => setMonthYear(TODAY_MONTH_YEAR)}
              />
            )}
          </div>

          <SectionTabs
            active={monthlyTab}
            onChange={key => {
              setMonthlyTab(key)
              if (key === 'historico') fetchNotesYear(monthYear, true)
            }}
            tabs={[
              { key: 'datos',     label: 'Datos' },
              { key: 'notas',     label: 'Notas', dot: !!notesIndex[panelMonth] },
              { key: 'historico', label: 'Histórico' },
            ]}
          />

          {monthlyTab === 'datos' && (
            <CurrentPeriodPanel
              metrics={monthlyMetrics}
              entriesMap={entriesMap}
              autoData={autoData}
              currentStatus={currentStatus}
              members={members}
              period={panelMonth}
              title={monthPanelTitle}
              subtitle={monthPanelSubtitle}
              onEntryChange={handleEntryChange}
              isCurrent={panelMonth === TODAY_MONTH}
              canGoForward={canGoForwardMonth}
              onPrev={() => setPanelMonth(p => shiftMonthPeriod(p, -1))}
              onNext={() => setPanelMonth(p => shiftMonthPeriod(p, +1))}
              onToday={() => setPanelMonth(TODAY_MONTH)}
            />
          )}

          {monthlyTab === 'notas' && (
            <MonthNotesPanel
              period={panelMonth}
              title={monthPanelTitle}
              subtitle={monthPanelSubtitle}
              isCurrent={panelMonth === TODAY_MONTH}
              canGoForward={canGoForwardMonth}
              onPrev={() => setPanelMonth(p => shiftMonthPeriod(p, -1))}
              onNext={() => setPanelMonth(p => shiftMonthPeriod(p, +1))}
              onToday={() => setPanelMonth(TODAY_MONTH)}
              fallbackContent={noteContentCache[panelMonth]}
            />
          )}

          {monthlyTab === 'historico' && (
            <ScorecardTable
              metrics={monthlyMetrics}
              entriesMap={entriesMap}
              autoData={autoData}
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
              notesIndex={notesIndex}
              onNoteClick={period => { setPanelMonth(period); setMonthlyTab('notas') }}
            />
          )}
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

      {/* Modal agregar dato automático */}
      {autoPicker && (
        <AutoMetricPicker
          catalog={autoCatalog}
          onAdd={async (key, goal) => { await handleAddAuto(key, goal) }}
          onClose={() => setAutoPicker(false)}
          saving={saving}
        />
      )}

    </div>
  )
}
