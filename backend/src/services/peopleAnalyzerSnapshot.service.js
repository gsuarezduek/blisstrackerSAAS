// Snapshot mensual del Analizador de Personas de EOS (evolución histórica del People Score).
//
// Doble escritura, mismo patrón que RrhhMetricSnapshot con una diferencia clave: acá los
// ratings NO tienen fecha propia (son un estado mutable único por persona+valor), así que
// "el mes de agosto" solo puede reconstruirse si se capturó DURANTE agosto — el cron mensual
// del día 1 no puede recalcularlo después porque para entonces ya sería el estado de
// septiembre. Por eso:
//  · captureCurrentMonth: upsert perezoso del mes ACTUAL en cada visita al tab Personas
//    (construye el historial con el uso; se sigue actualizando mientras el mes corre).
//  · saveAllPreviousMonthSnapshots (cron, día 1): solo CREA el snapshot del mes recién
//    cerrado si no existe ya uno — nunca sobreescribe uno ya capturado perezosamente.
const prisma = require('../lib/prisma')
const { parseCoreValues, peopleColumnKeys, computePeopleScore } = require('../lib/peopleScore')
const { enabledWorkspaceIds } = require('../lib/featureFlags')
const { DEFAULT_TZ } = require('../utils/dates')

function currentMonth(tz) {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz }).slice(0, 7)
}

// Arma el snapshot de datos crudos (mismo shape que GET /eos/personas) + el score calculado.
async function buildSnapshot(workspaceId) {
  const [members, eosData, ratings] = await Promise.all([
    prisma.workspaceMember.findMany({
      where:   { workspaceId, active: true },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { user: { name: 'asc' } },
    }),
    prisma.eOSData.findUnique({ where: { workspaceId }, select: { coreValues: true } }),
    prisma.peopleAnalyzerRating.findMany({ where: { workspaceId } }),
  ])

  const coreValues = parseCoreValues(eosData?.coreValues)

  const ratingsMap = {}
  for (const r of ratings) {
    if (!ratingsMap[r.userId]) ratingsMap[r.userId] = {}
    ratingsMap[r.userId][r.valueKey] = r.rating
  }

  const formattedMembers = members.map(m => ({
    id:       m.user.id,
    name:     m.user.name,
    avatar:   m.user.avatar,
    teamRole: m.teamRole,
  }))

  const columnKeys = peopleColumnKeys(coreValues)
  const { score, rightPeople, total } = computePeopleScore(formattedMembers, columnKeys, ratingsMap)

  return {
    data: { members: formattedMembers, coreValues, ratingsMap },
    score, rightPeople, total,
  }
}

async function saveSnapshot(workspaceId, month) {
  const { data, score, rightPeople, total } = await buildSnapshot(workspaceId)
  return prisma.peopleAnalyzerSnapshot.upsert({
    where:  { workspaceId_month: { workspaceId, month } },
    update: { data, score, rightPeople, total },
    create: { workspaceId, month, data, score, rightPeople, total },
  })
}

// Upsert perezoso del mes actual (llamado en cada GET /eos/personas, fire-and-forget).
async function captureCurrentMonth(workspaceId, tz) {
  await saveSnapshot(workspaceId, currentMonth(tz))
}

// Cron: congela el mes anterior para los workspaces con EOS habilitado, solo si no fue
// capturado ya durante ese mes (evita pisar una captura real con el estado de hoy).
async function saveAllPreviousMonthSnapshots() {
  const enabledIds = await enabledWorkspaceIds('eos')
  if (enabledIds.size === 0) return 0

  const workspaces = await prisma.workspace.findMany({
    where:  { id: { in: [...enabledIds] } },
    select: { id: true, timezone: true },
  })

  let saved = 0
  for (const ws of workspaces) {
    try {
      const tz = ws.timezone || DEFAULT_TZ
      const now = new Date()
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const month = prev.toLocaleDateString('en-CA', { timeZone: tz }).slice(0, 7)

      const existing = await prisma.peopleAnalyzerSnapshot.findUnique({
        where: { workspaceId_month: { workspaceId: ws.id, month } },
      })
      if (existing) continue

      await saveSnapshot(ws.id, month)
      saved++
    } catch (err) {
      console.error(`[PeopleAnalyzerSnapshot] Error en workspace ${ws.id}:`, err.message)
    }
  }
  console.log(`[PeopleAnalyzerSnapshot] ${saved}/${workspaces.length} workspaces con snapshots nuevos.`)
  return saved
}

module.exports = { captureCurrentMonth, saveAllPreviousMonthSnapshots }
