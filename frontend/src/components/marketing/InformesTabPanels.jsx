import { useState, useEffect, useMemo } from 'react'
import api from '../../api/client'
import { ObjectiveCard } from './ReportViewerParts'
import { SectionsConfigModal } from './InformesTabModals'
import {
  StarBadge, SearchInput, StatCard, StarRow, objPctBand,
  monthLabel, prevMonthStr,
} from './InformesTabParts'

function ReportsStatsCards({ stats }) {
  if (!stats) return null
  const { monthLabel: statsMonthLabel, reportsThisMonth, feedbackThisMonth, ratePct, ratedReports, avgRating, generators } = stats
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        icon="📊"
        label="Informes este mes"
        value={reportsThisMonth}
        sub={<span className="capitalize">{statsMonthLabel}</span>}
      />
      <StatCard
        icon="⭐"
        label="Calificaciones este mes"
        value={feedbackThisMonth}
        sub={avgRating != null ? `${avgRating} de promedio` : 'Sin calificaciones aún'}
      />
      <StatCard
        icon="📈"
        label="% con calificación"
        value={`${ratePct}%`}
        accent="text-primary-600 dark:text-primary-400"
        sub={`${ratedReports} de ${reportsThisMonth} calificados`}
      />
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
          <span>👤</span>
          <span>Generado por</span>
        </div>
        {generators.length === 0 ? (
          <p className="mt-1.5 text-sm text-gray-400">—</p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {generators.map(g => (
              <span
                key={g.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-200"
              >
                {g.name}
                <span className="font-semibold text-gray-500 dark:text-gray-400">{g.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Una fila de la lista de informes — nombre, fecha, % de cumplimiento de objetivos
// (número principal, desplegable con el detalle) y link al informe.
function ReportRow({ r, starred, onSelectProject }) {
  const [open, setOpen] = useState(false)
  const [y, m] = r.month.split('-').map(Number)
  const rowMonthLabel = r.periodLabel || new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  const publicUrl = `${window.location.origin}/report/${r.token}`
  const hasObjectives = r.objectives?.length > 0

  return (
    <div>
      <div className="flex items-center gap-4 px-5 py-3.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {starred && <StarBadge />}
            <button
              onClick={() => onSelectProject?.(String(r.project.id))}
              className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              {r.project.name}
            </button>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="text-sm text-gray-500 dark:text-gray-400 capitalize">{rowMonthLabel}</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Generado: {new Date(r.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
            {r.generatedBy?.name && <>, por <span className="text-gray-500 dark:text-gray-300">{r.generatedBy.name}</span></>}
          </p>
        </div>

        {r.objectivesPct != null ? (
          <button
            onClick={() => setOpen(o => !o)}
            title="Ver detalle de objetivos"
            className="flex-shrink-0 flex flex-col items-center px-2 hover:opacity-80 transition-opacity"
          >
            <span className={`text-xl font-bold tabular-nums ${objPctBand(r.objectivesPct)}`}>{r.objectivesPct}%</span>
            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">objetivos {open ? '▲' : '▼'}</span>
          </button>
        ) : hasObjectives ? (
          <span className="flex-shrink-0 text-[11px] text-gray-400 px-2 text-center">Sin datos<br />de objetivos</span>
        ) : (
          <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 whitespace-nowrap">
            SIN OBJETIVOS
          </span>
        )}

        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
        >
          Ver informe →
        </a>
      </div>

      {open && hasObjectives && (
        <div className="px-5 pb-4 grid sm:grid-cols-2 gap-3 bg-gray-50/60 dark:bg-gray-900/20">
          {r.objectives.map(o => <ObjectiveCard key={o.id} obj={o} />)}
        </div>
      )}
    </div>
  )
}

const SORT_OPTIONS = [
  { key: 'date_desc', label: 'Más reciente' },
  { key: 'pct_desc',  label: 'Mayor cumplimiento' },
  { key: 'pct_asc',   label: 'Menor cumplimiento' },
]

// ─── Vista "En vivo" (objetivos del mes, sin esperar al informe mensual) ──────

function LiveProjectRow({ p, starred, onSelectProject }) {
  const [open, setOpen] = useState(false)
  const hasObjectives = p.objectives?.length > 0

  return (
    <div>
      <div className="flex items-center gap-4 px-5 py-3.5">
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          {starred && <StarBadge />}
          <button
            onClick={() => onSelectProject?.(String(p.projectId))}
            className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            {p.projectName}
          </button>
        </div>

        {p.objectivesPct != null ? (
          <button
            onClick={() => setOpen(o => !o)}
            title="Ver detalle de objetivos"
            className="flex-shrink-0 flex flex-col items-center px-2 hover:opacity-80 transition-opacity"
          >
            <span className={`text-xl font-bold tabular-nums ${objPctBand(p.objectivesPct)}`}>{p.objectivesPct}%</span>
            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">objetivos {open ? '▲' : '▼'}</span>
          </button>
        ) : hasObjectives ? (
          <span className="flex-shrink-0 text-[11px] text-gray-400 px-2 text-center">Sin datos<br />de objetivos</span>
        ) : (
          <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 whitespace-nowrap">
            SIN OBJETIVOS
          </span>
        )}
      </div>

      {open && hasObjectives && (
        <div className="px-5 pb-4 grid sm:grid-cols-2 gap-3 bg-gray-50/60 dark:bg-gray-900/20">
          {p.objectives.map(o => <ObjectiveCard key={o.id} obj={o} />)}
        </div>
      )}
    </div>
  )
}

export function LiveObjectivesPanel({ onSelectProject, projects = [] }) {
  const [data,    setData]    = useState(null)
  const [month,   setMonth]   = useState(null) // null = todavía no elegido, usa el default del backend
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')

  useEffect(() => {
    setLoading(true)
    const params = month ? `?month=${month}` : ''
    api.get(`/marketing/summary/objectives-live${params}`)
      .then(r => { setData(r.data); setMonth(r.data.month) })
      .catch(() => setData({ month, monthLabel: '', isCurrent: true, availableMonths: [], projects: [] }))
      .finally(() => setLoading(false))
  }, [month])

  const availableMonths = data?.availableMonths || []
  const idx = availableMonths.findIndex(m => m.month === data?.month)
  // La lista viene ordenada desc (más reciente primero): "anterior" = índice + 1, "siguiente" = índice - 1
  const canGoOlder = idx >= 0 && idx < availableMonths.length - 1
  const canGoNewer = idx > 0

  // Destacados (favoritos del usuario, "Mis Proyectos") primero, después el resto
  // en el orden que ya trae el backend (% de cumplimiento desc). El buscador filtra
  // por nombre client-side, ya que la lista completa del mes ya está cargada.
  const starredIds = useMemo(() => new Set(projects.filter(p => p.starred).map(p => p.id)), [projects])
  const visibleProjects = useMemo(() => {
    const list = data?.projects ?? []
    const q = search.trim().toLowerCase()
    const filtered = q ? list.filter(p => p.projectName.toLowerCase().includes(q)) : list
    const starred = filtered.filter(p => starredIds.has(p.projectId))
    const rest    = filtered.filter(p => !starredIds.has(p.projectId))
    return [...starred, ...rest]
  }, [data, search, starredIds])

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => canGoOlder && setMonth(availableMonths[idx + 1].month)}
            disabled={!canGoOlder}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ◀
          </button>
          <div className="text-center min-w-[160px]">
            <p className="text-sm font-semibold text-gray-900 dark:text-white capitalize">{data?.monthLabel || '…'}</p>
            <span className={`inline-block mt-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${
              data?.isCurrent
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}>
              {data?.isCurrent ? '● En curso' : 'Cerrado'}
            </span>
          </div>
          <button
            onClick={() => canGoNewer && setMonth(availableMonths[idx - 1].month)}
            disabled={!canGoNewer}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ▶
          </button>
        </div>
        <p className="text-xs text-gray-400 max-w-xs text-right">
          {data?.isCurrent
            ? 'Cumplimiento de objetivos recalculado en vivo con los datos de hoy, antes de que salga el informe mensual.'
            : 'Recalculado en vivo con los datos actuales de la base (puede diferir levemente del informe ya generado).'}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data?.projects?.length ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center">
          <p className="text-4xl mb-3">🎯</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Ningún proyecto tiene objetivos configurados todavía. Entrá a un proyecto → pestaña Informes → 🎯 Objetivos para cargarlos.
          </p>
        </div>
      ) : (
        <>
          <div className="flex justify-end">
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar proyecto…" />
          </div>

          {visibleProjects.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400 text-sm">Sin resultados para "{search}".</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
              {visibleProjects.map(p => (
                <LiveProjectRow key={p.projectId} p={p} starred={starredIds.has(p.projectId)} onSelectProject={onSelectProject} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function ReportsHistoryPanel({ onSelectProject, projects }) {
  const [reports, setReports]     = useState([])
  const [total,   setTotal]       = useState(0)
  const [month,   setMonth]       = useState(null)
  const [generators, setGenerators] = useState([])
  const [stats,   setStats]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [showConfig, setShowConfig] = useState(false)
  const [search,   setSearch]   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [generatedById, setGeneratedById] = useState('')
  const [sort, setSort] = useState('date_desc')

  // Debounce del buscador (300ms) para no pegarle al backend en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Stats de "este mes" — independientes de los filtros, se cargan una sola vez.
  useEffect(() => {
    api.get('/marketing/summary/reports-stats').then(r => setStats(r.data)).catch(() => {})
  }, [])

  // Lista de informes — todos los del mes en curso (sin paginar). El buscador y el
  // filtro por persona acotan dentro de ese mismo mes (no buscan en el historial).
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ sort })
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (generatedById)   params.set('generatedById', generatedById)
    api.get(`/marketing/summary/reports?${params}`)
      .then(r => { setReports(r.data.reports); setTotal(r.data.total); setMonth(r.data.month); setGenerators(r.data.generators) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [debouncedSearch, generatedById, sort])

  const configBtn = (
    <button
      onClick={() => setShowConfig(true)}
      title="Configurar qué secciones de Marketing están disponibles por proyecto"
      className="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
    >
      ⚙️
    </button>
  )

  // Destacados (favoritos del usuario) primero, preservando el orden elegido
  // (fecha/% de cumplimiento) dentro de cada grupo.
  const starredIds = useMemo(() => new Set(projects.filter(p => p.starred).map(p => p.id)), [projects])
  const sortedReports = useMemo(() => {
    const starred = reports.filter(r => starredIds.has(r.project.id))
    const rest    = reports.filter(r => !starredIds.has(r.project.id))
    return [...starred, ...rest]
  }, [reports, starredIds])

  // El título muestra el período de DATOS de los informes (por defecto, el mes
  // calendario anterior al "slot" en el que se generaron), no el mes en el que
  // se generaron — así coincide con el período que ya muestra cada fila.
  const heading = month ? monthLabel(prevMonthStr(month)) : ''
  const selectCls = 'text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="space-y-4">
      <ReportsStatsCards stats={stats} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 capitalize">
          Informes de {heading} <span className="font-normal text-gray-400 lowercase">({total} en total)</span>
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar proyecto…" className="w-44" />
          {generators.length > 0 && (
            <select value={generatedById} onChange={e => setGeneratedById(e.target.value)} className={selectCls}>
              <option value="">Todas las personas</option>
              {generators.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <select value={sort} onChange={e => setSort(e.target.value)} className={selectCls}>
            {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          {configBtn}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !reports.length ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {debouncedSearch || generatedById
              ? <>No se encontraron informes de {heading} con esos filtros.</>
              : <>Todavía no hay informes generados este mes. Seleccioná un proyecto para crear el primero.</>}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
          {sortedReports.map(r => <ReportRow key={r.id} r={r} starred={starredIds.has(r.project.id)} onSelectProject={onSelectProject} />)}
        </div>
      )}

      {showConfig && (
        <SectionsConfigModal projects={projects} initialProjectId={null} onClose={() => setShowConfig(false)} />
      )}
    </div>
  )
}

// Hub de la vista global (sin proyecto seleccionado): "En vivo" (default, objetivos
// del mes recalculados al instante) vs "Informes" (historial ya generado).
export function AllReportsPanel({ onSelectProject, projects }) {
  const [view, setView] = useState('live')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-900 rounded-lg p-0.5 w-fit">
        {[
          { k: 'live',    label: '🔴 En vivo' },
          { k: 'history', label: '📄 Informes' },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setView(t.k)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === t.k
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === 'live'
        ? <LiveObjectivesPanel onSelectProject={onSelectProject} projects={projects} />
        : <ReportsHistoryPanel onSelectProject={onSelectProject} projects={projects} />}
    </div>
  )
}

// ─── Feedback del cliente (vista agencia) ─────────────────────────────────────

export function ClientFeedbackPanel({ feedback }) {
  const [open, setOpen] = useState(false)
  if (!feedback || !feedback.count) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">💬 Feedback del cliente</span>
          <StarRow value={feedback.avg} />
          <span className="text-sm font-bold text-gray-900 dark:text-white">{feedback.avg}</span>
          <span className="text-xs text-gray-400">({feedback.count} {feedback.count === 1 ? 'respuesta' : 'respuestas'})</span>
        </div>
        <span className="text-gray-400 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
          {feedback.items.map(it => (
            <div key={it.id} className="text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <StarRow value={it.rating} size={12} />
                <span className="font-medium text-gray-700 dark:text-gray-200">{it.name || 'Anónimo'}</span>
                <span className="text-xs text-gray-400">
                  {new Date(it.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              {it.comment && <p className="text-gray-600 dark:text-gray-400 mt-0.5 whitespace-pre-line">{it.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Historial de intentos de generación (para auditar qué venía saliendo mal) ─
// Cada "Generar"/"Regenerar" pisa analysis/dataCache del informe sin dejar rastro
// de los intentos previos — este panel lee el log liviano aparte (ReportGenerationLog)
// para poder comparar qué pasó en cada intento sin tener que adivinar.
export function GenerationLogPanel({ projectId, month }) {
  const [open,     setOpen]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [attempts, setAttempts] = useState(null)

  useEffect(() => { setAttempts(null); setOpen(false) }, [projectId, month])

  useEffect(() => {
    if (!open || attempts !== null) return
    setLoading(true)
    api.get(`/marketing/projects/${projectId}/reports/${month}/generation-log`)
      .then(res => setAttempts(res.data.attempts || []))
      .catch(() => setAttempts([]))
      .finally(() => setLoading(false))
  }, [open, projectId, month, attempts])

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">🕘 Intentos de generación anteriores</span>
        <span className="text-gray-400 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
          {loading && <p className="text-xs text-gray-400">Cargando…</p>}
          {!loading && attempts?.length === 0 && (
            <p className="text-xs text-gray-400">Sin intentos registrados todavía — el log arranca a partir de este cambio.</p>
          )}
          {!loading && attempts && attempts.length > 0 && (
            <ul className="space-y-2.5">
              {attempts.map(a => {
                const clean = !a.analysisError && a.warnings.length === 0
                return (
                  <li key={a.id} className={`text-xs border-l-2 pl-2.5 ${clean ? 'border-green-400' : 'border-amber-400'}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-700 dark:text-gray-200">{a.userName}</span>
                      <span className="text-gray-400">
                        {new Date(a.createdAt).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {clean
                        ? <span className="text-green-600 dark:text-green-400">✓ sin problemas</span>
                        : <span className="text-amber-600 dark:text-amber-400">⚠ con problemas</span>}
                    </div>
                    {a.analysisError && (
                      <p className="text-amber-700 dark:text-amber-400 mt-0.5">Análisis IA: {a.analysisError}</p>
                    )}
                    {a.warnings.map((w, i) => (
                      <p key={i} className="text-amber-700 dark:text-amber-400 mt-0.5">{w.label}: {w.message}</p>
                    ))}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
