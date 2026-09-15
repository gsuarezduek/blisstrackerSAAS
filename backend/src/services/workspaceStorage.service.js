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
 * Imágenes de RRSS (SocialImage), WhatsApp (WhatsappMedia + WhatsappBotDocument)
 * y Chat (ChatAttachment — se auto-acota solo por su retención de 30 días,
 * ver chatAttachmentRetentionDays/cleanup.service.js).
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
  return { archivos: 0, contenido: 0, imagenesSociales: 0, whatsapp: 0, chat: 0, total: 0 }
}

function withTotal(b) {
  b.total = b.archivos + b.contenido + b.imagenesSociales + b.whatsapp + b.chat
  return b
}

/**
 * Agrega el storage usado por CADA workspace de la plataforma. Pensado para
 * SuperAdmin (ranking global) — un solo query por categoría, sin N+1.
 * @returns {Promise<Array<{ workspaceId: number, archivos: number, contenido: number, imagenesSociales: number, whatsapp: number, total: number }>>}
 */
async function computeAllWorkspacesStorageUsage() {
  const [archivos, contenido, imagenesSociales, whatsappMedia, whatsappDocs, chatAttachments] = await Promise.all([
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
    prisma.chatAttachment.groupBy({
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
  for (const row of chatAttachments) get(row.workspaceId).chat += row._sum.sizeBytes || 0

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
  const [archivos, contenido, imagenesSociales, whatsappMedia, whatsappDocs, chatAttachments] = await Promise.all([
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
    prisma.chatAttachment.aggregate({
      where: { workspaceId },
      _sum: { sizeBytes: true },
    }),
  ])

  return withTotal({
    archivos: archivos._sum.sizeBytes || 0,
    contenido: contenido._sum.sizeBytes || 0,
    imagenesSociales: Number(imagenesSociales[0]?.bytes || 0),
    whatsapp: (whatsappMedia._sum.sizeBytes || 0) + (whatsappDocs._sum.sizeBytes || 0),
    chat: chatAttachments._sum.sizeBytes || 0,
  })
}

/**
 * Ranking de proyectos DENTRO de un workspace por espacio usado. Solo cubre
 * ProjectFile (`projectId` directo) y ContentAsset (`projectId` indirecto vía
 * `ContentPiece`, requiere join) — SocialImage y WhatsApp NO son atribuibles a
 * un proyecto puntual y quedan fuera de este ranking a propósito (siguen
 * contando en el total del workspace de las dos funciones de arriba).
 *
 * Separa `activeBytes` (deletedAt: null) de `trashBytes` (en la Papelera,
 * deletedAt seteado) — un archivo/pieza borrado sigue pesando en R2 hasta la
 * limpieza automática (30 días por default), pero es "basura recuperable" que
 * el admin puede purgar ya mismo desde la Papelera del proyecto, a diferencia
 * de lo activo. `totalBytes` = activeBytes + trashBytes (coincide con el
 * criterio de "usado" del resto del archivo, que no filtra deletedAt).
 * @param {number} workspaceId
 * @returns {Promise<Array<{ projectId: number, projectName: string, activeBytes: number, trashBytes: number, totalBytes: number }>>}
 */
async function computeProjectStorageBreakdown(workspaceId) {
  const [archivosActiveRows, archivosTrashRows, contenidoRows, projects] = await Promise.all([
    prisma.projectFile.groupBy({
      by: ['projectId'],
      where: { workspaceId, type: 'file', status: { in: ['ready', 'pending'] }, deletedAt: null },
      _sum: { sizeBytes: true },
    }),
    prisma.projectFile.groupBy({
      by: ['projectId'],
      where: { workspaceId, type: 'file', status: { in: ['ready', 'pending'] }, deletedAt: { not: null } },
      _sum: { sizeBytes: true },
    }),
    prisma.$queryRaw`
      SELECT cp."projectId" AS "projectId",
             COALESCE(SUM(CASE WHEN cp."deletedAt" IS NULL     THEN ca."sizeBytes" ELSE 0 END), 0)::bigint AS active_bytes,
             COALESCE(SUM(CASE WHEN cp."deletedAt" IS NOT NULL THEN ca."sizeBytes" ELSE 0 END), 0)::bigint AS trash_bytes
      FROM "ContentAsset" ca
      JOIN "ContentPiece" cp ON cp.id = ca."pieceId"
      WHERE ca."workspaceId" = ${workspaceId} AND ca.status IN ('ready', 'pending')
      GROUP BY cp."projectId"
    `,
    prisma.project.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
  ])

  const byProject = new Map()
  const get = id => {
    if (!byProject.has(id)) byProject.set(id, { activeBytes: 0, trashBytes: 0 })
    return byProject.get(id)
  }
  for (const row of archivosActiveRows) get(row.projectId).activeBytes += row._sum.sizeBytes || 0
  for (const row of archivosTrashRows) get(row.projectId).trashBytes += row._sum.sizeBytes || 0
  for (const row of contenidoRows) {
    const b = get(row.projectId)
    b.activeBytes += Number(row.active_bytes || 0)
    b.trashBytes += Number(row.trash_bytes || 0)
  }

  const names = new Map(projects.map(p => [p.id, p.name]))

  return [...byProject.entries()]
    .map(([projectId, b]) => ({
      projectId,
      projectName: names.get(projectId) || `Proyecto #${projectId}`,
      activeBytes: b.activeBytes,
      trashBytes: b.trashBytes,
      totalBytes: b.activeBytes + b.trashBytes,
    }))
    .sort((a, b) => b.totalBytes - a.totalBytes)
}

/**
 * Total de la plataforma en object storage (R2) HOY, con desglose por
 * categoría — usado por SuperAdmin (headline "Total en R2"), el snapshot
 * mensual de tendencia (`platformStorageSnapshot.service.js`) y el aviso de
 * umbral. A diferencia de `computeAllWorkspacesStorageUsage()` (que para
 * Imágenes de RRSS suma R2 + legacy en DB, porque ahí lo que importa es "usado
 * total" comparable a la cuota), acá la categoría `imagenesSociales` usa SOLO
 * la porción que efectivamente vive en R2 (`storageStats.service.js`
 * `getSocialImageStats().location.r2`) — el resto de las categorías
 * (Archivos/Contenido/WhatsApp/Chat) son 100% R2 en cualquier deploy con las
 * envs R2_* configuradas (ProjectFile ni siquiera tiene fallback a DB), así
 * que sus totales ya calculados sirven tal cual.
 * @returns {Promise<{ totalBytes: number, breakdown: { archivos: number, contenido: number, imagenesSociales: number, whatsapp: number, chat: number } }>}
 */
async function computeGlobalR2Totals() {
  const { getSocialImageStats } = require('./storageStats.service')
  const [byWorkspace, socialImageStats] = await Promise.all([
    computeAllWorkspacesStorageUsage(),
    getSocialImageStats(),
  ])
  const sumCategory = key => byWorkspace.reduce((s, w) => s + (w[key] || 0), 0)
  const breakdown = {
    archivos:         sumCategory('archivos'),
    contenido:        sumCategory('contenido'),
    imagenesSociales: socialImageStats.location.r2.bytes,
    whatsapp:         sumCategory('whatsapp'),
    chat:             sumCategory('chat'),
  }
  const totalBytes = Object.values(breakdown).reduce((s, v) => s + v, 0)
  return { totalBytes, breakdown }
}

module.exports = {
  computeAllWorkspacesStorageUsage,
  computeWorkspaceStorageUsage,
  computeProjectStorageBreakdown,
  computeGlobalR2Totals,
}
