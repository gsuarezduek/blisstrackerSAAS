/**
 * Agregación de almacenamiento (bytes en R2/DB) por workspace y por proyecto.
 *
 * Complementa a `storageStats.service.js` (que es un panel de auditoría GLOBAL
 * de toda la plataforma — tamaño físico de Postgres + huérfanas de
 * SocialImage) con el desglose que faltaba: cuánto ocupa CADA workspace, y
 * dentro de un workspace, cuánto ocupa CADA proyecto.
 *
 * Categorías cubiertas (las que generan costo real de R2/DB y son las más
 * grandes en volumen): Archivos (ProjectFile), Contenido (ContentAsset),
 * Imágenes de RRSS (SocialImage) y WhatsApp (WhatsappMedia + WhatsappBotDocument).
 *
 * Fuera de alcance a propósito (bajo volumen y/o atribución ambigua a un
 * workspace): Avatar (catálogo compartido + fotos propias, User↔Workspace es
 * muchos-a-muchos), Workspace.logoData/bannerData, MonthlyReport.bannerData,
 * ProjectClientPortal.bannerData (todos acotados a 5MB, sin objectKey/sizeBytes).
 *
 * Criterio de "usado" — debe coincidir EXACTO con las cuotas bloqueantes ya
 * existentes (`contentAssets.controller.js`/`projectFiles.controller.js`
 * `assertWithinQuota`), si no el % que ve un admin acá no coincide con lo que
 * realmente le bloquea subir archivos: status ready+pending, SIN filtrar
 * `deletedAt` (un archivo en la papelera sigue pesando en R2 hasta que el cron
 * de limpieza lo purga — ver `projectFileTrashRetentionDays`/`cleanup.service.js`).
 */
const prisma = require('../lib/prisma')

function emptyBreakdown() {
  return { archivos: 0, contenido: 0, imagenesSociales: 0, whatsapp: 0, total: 0 }
}

function withTotal(b) {
  b.total = b.archivos + b.contenido + b.imagenesSociales + b.whatsapp
  return b
}

/**
 * Agrega el storage usado por CADA workspace de la plataforma. Pensado para
 * SuperAdmin (ranking global) — un solo query por categoría, sin N+1.
 * @returns {Promise<Array<{ workspaceId: number, archivos: number, contenido: number, imagenesSociales: number, whatsapp: number, total: number }>>}
 */
async function computeAllWorkspacesStorageUsage() {
  const [archivos, contenido, imagenesSociales, whatsappMedia, whatsappDocs] = await Promise.all([
    prisma.projectFile.groupBy({
      by: ['workspaceId'],
      where: { type: 'file', status: { in: ['ready', 'pending'] } },
      _sum: { sizeBytes: true },
    }),
    prisma.contentAsset.groupBy({
      by: ['workspaceId'],
      where: { status: { in: ['ready', 'pending'] } },
      _sum: { sizeBytes: true },
    }),
    // COALESCE a octet_length(imageData): filas legacy (bytes en DB, de antes
    // del backfill a R2) pueden no tener sizeBytes seteado — mismo criterio
    // que storageStats.service.js `getSocialImageStats`.
    prisma.$queryRaw`
      SELECT "workspaceId",
             SUM(COALESCE("sizeBytes", octet_length("imageData"), 0))::bigint AS bytes
      FROM "SocialImage"
      GROUP BY "workspaceId"
    `,
    prisma.whatsappMedia.groupBy({
      by: ['workspaceId'],
      _sum: { sizeBytes: true },
    }),
    prisma.whatsappBotDocument.groupBy({
      by: ['workspaceId'],
      _sum: { sizeBytes: true },
    }),
  ])

  const byWorkspace = new Map()
  const get = id => {
    if (!byWorkspace.has(id)) byWorkspace.set(id, emptyBreakdown())
    return byWorkspace.get(id)
  }

  for (const row of archivos) get(row.workspaceId).archivos += row._sum.sizeBytes || 0
  for (const row of contenido) get(row.workspaceId).contenido += row._sum.sizeBytes || 0
  for (const row of imagenesSociales) get(row.workspaceId).imagenesSociales += Number(row.bytes || 0)
  for (const row of whatsappMedia) get(row.workspaceId).whatsapp += row._sum.sizeBytes || 0
  for (const row of whatsappDocs) get(row.workspaceId).whatsapp += row._sum.sizeBytes || 0

  return [...byWorkspace.entries()].map(([workspaceId, breakdown]) => ({
    workspaceId,
    ...withTotal(breakdown),
  }))
}

/**
 * Mismo cálculo que `computeAllWorkspacesStorageUsage()` acotado a UN
 * workspace — usado por `storageBudget.js` y el endpoint de Preferencias →
 * Global (`GET /projects/settings/storage-usage`).
 * @param {number} workspaceId
 */
async function computeWorkspaceStorageUsage(workspaceId) {
  const [archivos, contenido, imagenesSociales, whatsappMedia, whatsappDocs] = await Promise.all([
    prisma.projectFile.aggregate({
      where: { workspaceId, type: 'file', status: { in: ['ready', 'pending'] } },
      _sum: { sizeBytes: true },
    }),
    prisma.contentAsset.aggregate({
      where: { workspaceId, status: { in: ['ready', 'pending'] } },
      _sum: { sizeBytes: true },
    }),
    prisma.$queryRaw`
      SELECT COALESCE(SUM(COALESCE("sizeBytes", octet_length("imageData"), 0)), 0)::bigint AS bytes
      FROM "SocialImage"
      WHERE "workspaceId" = ${workspaceId}
    `,
    prisma.whatsappMedia.aggregate({
      where: { workspaceId },
      _sum: { sizeBytes: true },
    }),
    prisma.whatsappBotDocument.aggregate({
      where: { workspaceId },
      _sum: { sizeBytes: true },
    }),
  ])

  return withTotal({
    archivos: archivos._sum.sizeBytes || 0,
    contenido: contenido._sum.sizeBytes || 0,
    imagenesSociales: Number(imagenesSociales[0]?.bytes || 0),
    whatsapp: (whatsappMedia._sum.sizeBytes || 0) + (whatsappDocs._sum.sizeBytes || 0),
  })
}

/**
 * Ranking de proyectos DENTRO de un workspace por espacio usado. Solo cubre
 * ProjectFile (`projectId` directo) y ContentAsset (`projectId` indirecto vía
 * `ContentPiece`, requiere join) — SocialImage y WhatsApp NO son atribuibles a
 * un proyecto puntual y quedan fuera de este ranking a propósito (siguen
 * contando en el total del workspace de las dos funciones de arriba).
 * @param {number} workspaceId
 * @returns {Promise<Array<{ projectId: number, projectName: string, archivosBytes: number, contenidoBytes: number, totalBytes: number }>>}
 */
async function computeProjectStorageBreakdown(workspaceId) {
  const [archivosRows, contenidoRows, projects] = await Promise.all([
    prisma.projectFile.groupBy({
      by: ['projectId'],
      where: { workspaceId, type: 'file', status: { in: ['ready', 'pending'] } },
      _sum: { sizeBytes: true },
    }),
    prisma.$queryRaw`
      SELECT cp."projectId" AS "projectId", COALESCE(SUM(ca."sizeBytes"), 0)::bigint AS bytes
      FROM "ContentAsset" ca
      JOIN "ContentPiece" cp ON cp.id = ca."pieceId"
      WHERE ca."workspaceId" = ${workspaceId} AND ca.status IN ('ready', 'pending')
      GROUP BY cp."projectId"
    `,
    prisma.project.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
  ])

  const byProject = new Map()
  const get = id => {
    if (!byProject.has(id)) byProject.set(id, { archivosBytes: 0, contenidoBytes: 0 })
    return byProject.get(id)
  }
  for (const row of archivosRows) get(row.projectId).archivosBytes = row._sum.sizeBytes || 0
  for (const row of contenidoRows) get(row.projectId).contenidoBytes = Number(row.bytes || 0)

  const names = new Map(projects.map(p => [p.id, p.name]))

  return [...byProject.entries()]
    .map(([projectId, b]) => ({
      projectId,
      projectName: names.get(projectId) || `Proyecto #${projectId}`,
      archivosBytes: b.archivosBytes,
      contenidoBytes: b.contenidoBytes,
      totalBytes: b.archivosBytes + b.contenidoBytes,
    }))
    .sort((a, b) => b.totalBytes - a.totalBytes)
}

module.exports = {
  computeAllWorkspacesStorageUsage,
  computeWorkspaceStorageUsage,
  computeProjectStorageBreakdown,
}
