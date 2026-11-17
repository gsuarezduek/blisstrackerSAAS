// El snapshot MENSUAL del perfil de enlaces: una fila por proyecto y por mes, que es
// lo que consume la sección "Autoridad y enlaces" del informe al cliente y el objetivo
// `referring_domains`.
//
// Por qué se congela en vez de recomputarse al abrir el informe: `newLinks`/`lostLinks`
// de un mes cerrado NO son recuperables. Si en marzo alguien corrige el `firstSeenAt`
// de 20 filas importadas, el "conseguimos 12 enlaces en enero" que ya se le mostró al
// cliente cambiaría retroactivamente. Los conteos de stock (activos, dominios) sí se
// podrían recomputar, pero viven en la misma fila para que el mes se explique solo.
//
// Corre dentro de MONTHLY_CHAIN, DESPUÉS del paso que verifica los enlaces: sin eso el
// cierre contaría como activo un enlace que se cayó hace una semana.
const prisma = require('../lib/prisma')
const { MARKETING_PROJECT_WHERE } = require('../lib/projectModules')
const { prevMonthStr } = require('../lib/monthUtils')
const { profileFromLinks, monthCounts } = require('../lib/backlinks')
const { DEFAULT_TZ } = require('../utils/dates')

// `monthUtils` no exporta `currentMonthStr` — cada servicio define el suyo contra la
// tz del negocio (mismo criterio que seoAlerts.service.js). Importa de verdad: el 1°
// a la 01:00 ART todavía es el último día del mes anterior en UTC.
function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * La ventana del mes para buscar la última lectura externa. En UTC a propósito: es el
 * mismo criterio con el que `monthCounts` decide si un `firstSeenAt` cae en el mes, y
 * mezclar husos haría que una lectura del 31 a las 22:00 ART cuente en un mes y un
 * enlace de la misma hora en el otro.
 */
function monthRangeUtc(month) {
  const [y, m] = String(month).split('-').map(Number)
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) }
}

/**
 * Guarda (upsert) el snapshot de un proyecto para un mes.
 *
 * Los conteos de STOCK (activos, dominios, follow, DR promedio) son el estado de HOY,
 * no una reconstrucción del 31 a las 23:59: no guardamos historial por enlace que
 * permita rearmar el pasado, y correr esto el 1° a la mañana hace que la diferencia
 * sea de horas. Es la misma aproximación que el resto de los snapshots del módulo.
 *
 * Los de FLUJO (nuevos, perdidos) sí son del mes: salen de `firstSeenAt`/`lostAt`.
 */
async function saveBacklinkSnapshot(projectId, workspaceId, month) {
  const [links, project, reading] = await Promise.all([
    prisma.backlink.findMany({
      where:  { projectId, workspaceId },
      select: { sourceDomain: true, status: true, linkType: true, domainRating: true, firstSeenAt: true, lostAt: true },
    }),
    prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { domainRating: true } }),
    // La última lectura externa DEL MES. `reportedDomains: { not: null }` porque una
    // lectura puede haber registrado solo enlaces, y en ese caso el dato del mes sigue
    // siendo el de la lectura anterior dentro del mismo mes.
    prisma.backlinkProfileReading.findFirst({
      where:   { projectId, workspaceId, capturedAt: monthRangeUtc(month), reportedDomains: { not: null } },
      orderBy: { capturedAt: 'desc' },
      select:  { reportedDomains: true },
    }),
  ])
  if (!project) return null

  const live = profileFromLinks(links)
  const flow = monthCounts(links, month)

  const payload = {
    referringDomains: live.referringDomains,
    activeLinks:      live.activeLinks,
    followLinks:      live.followLinks,
    // De `monthCounts` y NO de `profileFromLinks`: el `lostLinks` del perfil son todos
    // los que están perdidos hoy (histórico completo), y acá la pregunta es cuántos se
    // cayeron EN ESTE MES. Mezclarlos le mostraría al cliente la pérdida acumulada de
    // dos años como si fuera la del mes.
    newLinks:         flow.newLinks,
    lostLinks:        flow.lostLinks,
    avgDomainRating:  live.avgDomainRating,
    domainRating:     project.domainRating ?? null,
    reportedDomains:  reading?.reportedDomains ?? null,
  }

  return prisma.backlinkSnapshot.upsert({
    where:  { projectId_month: { projectId, month } },
    create: { projectId, workspaceId, month, ...payload },
    update: payload,
  })
}

/**
 * Paso de la cadena mensual: snapshot del mes recién cerrado para todos los proyectos
 * que tengan algo cargado.
 *
 * El filtro de "algo cargado" (un enlace o una lectura) existe para no sembrar filas en
 * cero: `availability.js` publica la sección `authority` cuando hay snapshot, y un
 * proyecto que nunca usó la feature pasaría a ofrecerle al cliente un informe que dice
 * "0 enlaces, 0 dominios" como si fuera un resultado medido.
 */
async function saveAllBacklinkSnapshots({ month } = {}) {
  const targetMonth = month || prevMonthStr(currentMonthStr())
  const projects = await prisma.project.findMany({
    where: {
      active: true,
      ...MARKETING_PROJECT_WHERE,
      OR: [{ backlinks: { some: {} } }, { backlinkProfileReadings: { some: {} } }],
    },
    select: { id: true, workspaceId: true, name: true },
  })

  let saved = 0, failed = 0
  for (const p of projects) {
    try {
      const res = await saveBacklinkSnapshot(p.id, p.workspaceId, targetMonth)
      if (res) saved++
    } catch (err) {
      console.error(`[backlinkSnapshot] proyecto ${p.name} falló:`, err.message)
      failed++
    }
  }
  console.log(`[backlinkSnapshot] ${saved} guardado(s), ${failed} error(es) de ${projects.length}. Mes: ${targetMonth}`)
  return { total: projects.length, saved, failed, month: targetMonth }
}

module.exports = { saveBacklinkSnapshot, saveAllBacklinkSnapshots, currentMonthStr, monthRangeUtc }
