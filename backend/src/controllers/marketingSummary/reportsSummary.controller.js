/**
 * reportsSummary.controller.js
 * Vistas globales cross-proyecto de Informes mensuales y cumplimiento de objetivos.
 */

const prisma = require('../../lib/prisma')
const { computeObjectives } = require('../../services/marketingObjectives.service')
const { todayString, DEFAULT_TZ } = require('../../utils/dates')
const { tzOffsetStr } = require('../../lib/timeMetrics')
const { monthBounds, monthLabel, prevMonthStr, rangeLabel, monthsInRange } = require('../../lib/monthUtils')

// Rango de fechas real del período de datos del informe (espejo de monthlyReport.controller).
function reportPeriodDates(report) {
  if (report.periodStart && report.periodEnd) {
    return {
      start: new Date(report.periodStart).toISOString().slice(0, 10),
      end:   new Date(report.periodEnd).toISOString().slice(0, 10),
    }
  }
  const { startDate, endDate } = monthBounds(prevMonthStr(report.month))
  return { start: startDate, end: endDate }
}

/** Etiqueta del informe por su período de datos. */
function reportLabel(report) {
  const { start, end } = reportPeriodDates(report)
  return rangeLabel(start, end)
}

// Mes ancla del informe (el más reciente cubierto por el período) — mismo criterio
// que usa aggregateReportData para computar objetivos.
function reportDataMonth(report) {
  const { start, end } = reportPeriodDates(report)
  const months = monthsInRange(start, end)
  return months[months.length - 1]
}

// Filtro Prisma para informes "generados" (no placeholders vacíos), espejo del
// de monthlyReport.controller.js.
const GENERATED_REPORT_WHERE = {
  OR: [
    { enabledSections: { not: null } },
    { dataCache:       { not: null } },
    { analysis:        { not: null } },
  ],
}

/**
 * GET /api/marketing/summary/reports
 * TODOS los informes del workspace de un mes puntual (por defecto, el mes en curso —
 * el slot que se ve al navegar mes a mes en la vista de un proyecto), sin paginar.
 * Cada informe incluye su % de cumplimiento de objetivos (promedio del avance de
 * cada objetivo evaluable, no ratio de "cumplidos" — mismo criterio que la vista
 * "En vivo", ver getLiveObjectivesSummary; distinto del auto-metric "objetivos_cumplidos"
 * del Scorecard EOS, que sí es un ratio) y el detalle de sus objetivos, para el
 * desplegable de la lista. `generators` = quiénes generaron
 * algún informe de ese mes (para el filtro por persona) — siempre sobre el mes
 * completo, sin importar los filtros de búsqueda/persona aplicados a `reports`.
 * Query: ?month=YYYY-MM&search=texto&generatedById=N&sort=date_desc|pct_desc|pct_asc
 */
async function getReportsSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz     = req.workspace.timezone || DEFAULT_TZ
    const month  = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : todayString(tz).slice(0, 7)
    const search = (req.query.search || '').trim()
    const generatedById = /^\d+$/.test(req.query.generatedById || '') ? parseInt(req.query.generatedById) : null
    const sort   = ['pct_desc', 'pct_asc'].includes(req.query.sort) ? req.query.sort : 'date_desc'

    const baseWhere = { workspaceId, month, ...GENERATED_REPORT_WHERE, project: { active: true } }
    const where = {
      ...baseWhere,
      ...(search        ? { project: { active: true, name: { contains: search, mode: 'insensitive' } } } : {}),
      ...(generatedById  ? { generatedById } : {}),
    }

    const [reports, generatorRows] = await Promise.all([
      prisma.monthlyReport.findMany({
        where,
        orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
        take:    300, // límite de seguridad — no hay paginación, se listan todos los del mes
        select: {
          id:          true,
          month:       true,
          token:       true,
          createdAt:   true,
          updatedAt:   true,
          periodStart: true,
          periodEnd:   true,
          project:     { select: { id: true, name: true } },
          generatedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.monthlyReport.findMany({
        where:  baseWhere,
        select: { generatedBy: { select: { id: true, name: true } } },
      }),
    ])

    const genMap = new Map()
    for (const r of generatorRows) if (r.generatedBy) genMap.set(r.generatedBy.id, r.generatedBy.name)
    const generators = [...genMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))

    const withExtras = await Promise.all(reports.map(async (r) => {
      let objectives = []
      try {
        objectives = await computeObjectives({ projectId: r.project.id, workspaceId, dataMonth: reportDataMonth(r) })
      } catch (err) {
        console.error(`[ReportsSummary] objetivos informe ${r.id}:`, err.message)
      }
      // Promedio del % de avance de cada objetivo evaluable (no ratio de "cumplidos"),
      // mismo criterio que la vista "En vivo" — ver getLiveObjectivesSummary. Cada pct
      // se acota a [0,100] para que un objetivo sobre-cumplido no infle el promedio.
      const evaluable = objectives.filter(o => ['ok', 'partial', 'fail'].includes(o.status))
      const objectivesPct = evaluable.length
        ? Math.round(evaluable.reduce((s, o) => s + Math.min(100, Math.max(0, o.pct)), 0) / evaluable.length)
        : null
      return { ...r, periodLabel: reportLabel(r), objectivesPct, objectives }
    }))

    // Orden por % de cumplimiento: los sin objetivos/sin datos quedan siempre al
    // final (no hay un valor real que ordenar). "date_desc" conserva el orden de la DB.
    if (sort === 'pct_desc' || sort === 'pct_asc') {
      const withPct    = withExtras.filter(r => r.objectivesPct != null)
      const withoutPct = withExtras.filter(r => r.objectivesPct == null)
      withPct.sort((a, b) => sort === 'pct_desc' ? b.objectivesPct - a.objectivesPct : a.objectivesPct - b.objectivesPct)
      withExtras.length = 0
      withExtras.push(...withPct, ...withoutPct)
    }

    res.json({ reports: withExtras, total: withExtras.length, month, generators })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/marketing/summary/reports-stats
 * Tarjetas resumen de la vista global de Informes (mes calendario en curso,
 * en la timezone del workspace). "Generado" = createdAt del informe, consistente
 * con la etiqueta "Generado: {createdAt}" de la lista.
 *   - reportsThisMonth  : informes generados este mes
 *   - feedbackThisMonth : calificaciones (ReportFeedback) recibidas este mes
 *   - ratePct           : % de los informes de este mes que recibieron ≥1 calificación
 *   - generators        : quiénes generaron esos informes (con conteo)
 */
async function getReportsStats(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz     = req.workspace.timezone || DEFAULT_TZ
    const month  = todayString(tz).slice(0, 7)
    const { startDate, endDate } = monthBounds(month)
    const offset = tzOffsetStr(tz)

    // Rango [inicio de mes, fin de mes 23:59:59.999] en la TZ del workspace.
    const gte = new Date(`${startDate}T00:00:00.000${offset}`)
    const lte = new Date(`${endDate}T23:59:59.999${offset}`)

    const [reports, feedbackThisMonth, ratingAgg] = await Promise.all([
      prisma.monthlyReport.findMany({
        where:  { workspaceId, ...GENERATED_REPORT_WHERE, createdAt: { gte, lte }, project: { active: true } },
        select: { id: true, generatedBy: { select: { id: true, name: true } } },
      }),
      prisma.reportFeedback.count({ where: { workspaceId, createdAt: { gte, lte } } }),
      prisma.reportFeedback.aggregate({
        where: { workspaceId, createdAt: { gte, lte } },
        _avg:  { rating: true },
      }),
    ])

    const reportIds = reports.map(r => r.id)

    // Informes de este mes que recibieron al menos una calificación (en cualquier momento).
    const ratedGroups = reportIds.length
      ? await prisma.reportFeedback.groupBy({
          by:    ['reportId'],
          where: { workspaceId, reportId: { in: reportIds } },
        })
      : []
    const ratedReports = ratedGroups.length
    const ratePct = reports.length ? Math.round((ratedReports / reports.length) * 100) : 0

    // Quiénes generaron los informes de este mes (con conteo, desc).
    const byGen = new Map()
    for (const r of reports) {
      if (!r.generatedBy) continue
      const cur = byGen.get(r.generatedBy.id) || { id: r.generatedBy.id, name: r.generatedBy.name, count: 0 }
      cur.count++
      byGen.set(r.generatedBy.id, cur)
    }
    const generators = [...byGen.values()].sort((a, b) => b.count - a.count)

    res.json({
      month,
      monthLabel:        monthLabel(month),
      reportsThisMonth:  reports.length,
      feedbackThisMonth,
      ratedReports,
      ratePct,
      avgRating:         ratingAgg._avg.rating ? Number(ratingAgg._avg.rating.toFixed(1)) : null,
      generators,
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/marketing/summary/objectives-live
 * Vista "en vivo" de cumplimiento de objetivos, cross-proyecto. A diferencia
 * de /summary/reports (que lista informes YA generados), este endpoint no
 * depende de que exista un MonthlyReport: recalcula los objetivos en vivo
 * (computeObjectives) para el mes elegido, así se puede ver el avance del mes
 * en curso ANTES de que salga el informe mensual (que recién se genera al mes
 * siguiente, con datos cerrados).
 * Navegable a meses anteriores, pero solo a los que ya tienen al menos un
 * informe generado en el workspace (para no mostrar meses sin ningún dato).
 * Query: ?month=YYYY-MM (default: mes calendario en curso)
 */
async function getLiveObjectivesSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone || DEFAULT_TZ
    const currentMonth = todayString(tz).slice(0, 7)

    // Meses navegables: el mes en curso (siempre) + los meses de datos de
    // informes ya generados en el workspace (mismo criterio que reportDataMonth).
    const reportRows = await prisma.monthlyReport.findMany({
      where:  { workspaceId, ...GENERATED_REPORT_WHERE },
      select: { month: true, periodStart: true, periodEnd: true },
    })
    const monthsSet = new Set([currentMonth])
    for (const r of reportRows) monthsSet.add(reportDataMonth(r))

    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') && monthsSet.has(req.query.month)
      ? req.query.month
      : currentMonth

    const availableMonths = [...monthsSet]
      .sort((a, b) => b.localeCompare(a))
      .map(m => ({ month: m, label: monthLabel(m), isCurrent: m === currentMonth }))

    // Solo proyectos activos con al menos un objetivo configurado.
    const projects = await prisma.project.findMany({
      where:   { workspaceId, active: true, marketingObjectives: { some: {} } },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    })

    const results = await Promise.all(projects.map(async (p) => {
      let objectives = []
      try {
        objectives = await computeObjectives({ projectId: p.id, workspaceId, dataMonth: month })
      } catch (err) {
        console.error(`[LiveObjectives] proyecto ${p.id}:`, err.message)
      }
      // Promedio del % de avance de cada objetivo evaluable (no ratio de "cumplidos"):
      // 4 objetivos al 20/40/60/80% dan 50%, no 0% — mide qué tan cerca se está de
      // cumplir en conjunto, no cuántos ya llegaron al 100%. Cada pct se acota a
      // [0,100] para que un objetivo sobre-cumplido no infle el promedio por encima
      // de "completo".
      const evaluable = objectives.filter(o => ['ok', 'partial', 'fail'].includes(o.status))
      const objectivesPct = evaluable.length
        ? Math.round(evaluable.reduce((s, o) => s + Math.min(100, Math.max(0, o.pct)), 0) / evaluable.length)
        : null
      return { projectId: p.id, projectName: p.name, objectivesPct, objectives }
    }))

    // % desc; sin datos al final
    results.sort((a, b) => (b.objectivesPct ?? -1) - (a.objectivesPct ?? -1))

    res.json({
      month,
      monthLabel: monthLabel(month),
      isCurrent: month === currentMonth,
      availableMonths,
      projects: results,
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { getReportsSummary, getReportsStats, getLiveObjectivesSummary }
