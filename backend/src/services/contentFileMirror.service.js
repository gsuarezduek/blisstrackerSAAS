// Espeja los assets (imagen/video) que se suben a una pieza de Contenido hacia
// el repositorio de Archivos del proyecto, organizados en
// "<Mes> / <Título de la pieza> / <archivo>" — así el equipo tiene todo el
// material de una pieza también disponible en Archivos, sin tener que ir a
// buscarlo pieza por pieza dentro de Contenido.
//
// Copia el objeto en R2 a una key NUEVA (objectStorage.copyObject) en vez de
// compartir la key del ContentAsset: cada lado (ContentAsset y ProjectFile)
// termina siendo dueño de su propio objeto e independiente en su ciclo de
// vida — borrar el asset de la pieza no rompe la copia en Archivos, y
// viceversa. Es "queden también", no un espejo sincronizado: si la pieza se
// renombra después, la carpeta ya creada no se renombra sola.
//
// Best-effort total: nunca lanza. Si algo falla acá, el asset de la pieza ya
// se confirmó bien y esa respuesta no debe romperse por esto.
const prisma = require('../lib/prisma')
const objectStorage = require('./objectStorage.service')
const { sanitizeName } = require('../controllers/projects/projectFiles.controller')
const { monthLabel } = require('../lib/monthUtils')
const { todayString } = require('../utils/dates')

const DEFAULT_NAME_BY_MIME = {
  'image/png': 'imagen.png', 'image/jpeg': 'imagen.jpg', 'image/webp': 'imagen.webp', 'image/gif': 'imagen.gif',
  'video/mp4': 'video.mp4', 'video/quicktime': 'video.mov', 'video/webm': 'video.webm',
}

async function findOrCreateFolder(projectId, workspaceId, parentId, name, uploaderId) {
  const existing = await prisma.projectFile.findFirst({
    where: { projectId, parentId, type: 'folder', name, deletedAt: null },
    select: { id: true },
  })
  if (existing) return existing.id
  const created = await prisma.projectFile.create({
    data: { projectId, workspaceId, parentId, type: 'folder', name, uploadedById: uploaderId },
    select: { id: true },
  })
  return created.id
}

/**
 * @param {object} params
 * @param {number} params.workspaceId
 * @param {number} params.projectId
 * @param {string} params.timezone — del proyecto, para nombrar la carpeta del mes
 * @param {string} params.pieceTitle
 * @param {object} params.asset — ContentAsset ya confirmado ('ready'), kind image|video
 * @param {number} params.uploaderId
 */
async function mirrorAssetToArchivos({ workspaceId, projectId, timezone, pieceTitle, asset, uploaderId }) {
  try {
    if (!objectStorage.isConfigured()) return // Archivos no tiene fallback sin R2 — ver ProjectFile
    // El thumbnail de video que genera el propio uploader (ContentAssetUploader.jsx,
    // siempre 'poster.jpg') es un detalle de implementación, no algo que el usuario
    // subió a propósito — no tiene sentido que aparezca como archivo suelto en Archivos.
    if (asset.fileName === 'poster.jpg') return
    if (!asset.objectKey) return

    const month = todayString(timezone).slice(0, 7)
    const monthName = sanitizeName(monthLabel(month)) || month
    const pieceName = sanitizeName(pieceTitle) || 'Sin título'

    const monthFolderId = await findOrCreateFolder(projectId, workspaceId, null, monthName, uploaderId)
    const pieceFolderId = await findOrCreateFolder(projectId, workspaceId, monthFolderId, pieceName, uploaderId)

    const destKey = objectStorage.buildKey(`files/${workspaceId}`, asset.mimeType)
    await objectStorage.copyObject(asset.objectKey, destKey)

    let destPosterKey = null
    if (asset.posterKey) {
      destPosterKey = objectStorage.buildKey(`files/${workspaceId}`, 'image/jpeg')
      await objectStorage.copyObject(asset.posterKey, destPosterKey)
    }

    await prisma.projectFile.create({
      data: {
        projectId, workspaceId, parentId: pieceFolderId, type: 'file',
        name: asset.fileName || DEFAULT_NAME_BY_MIME[asset.mimeType] || 'archivo',
        status: 'ready',
        mimeType: asset.mimeType,
        objectKey: destKey,
        posterKey: destPosterKey,
        sizeBytes: asset.sizeBytes,
        width: asset.width,
        height: asset.height,
        uploadedById: uploaderId,
        confirmedAt: new Date(),
      },
    })
  } catch (err) {
    console.warn('[contentFileMirror] No se pudo espejar el asset a Archivos:', err.message)
  }
}

module.exports = { mirrorAssetToArchivos }
