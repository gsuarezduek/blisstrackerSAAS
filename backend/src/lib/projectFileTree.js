const prisma = require('./prisma')

/**
 * Busca una carpeta por (projectId, parentId, name) y la crea si no existe.
 * Extraído de contentFileMirror.service.js (que la usa para espejar assets de
 * Contenido a Archivos) para reutilizarla también desde otros módulos que
 * necesiten resolver/crear una ruta de carpetas dentro del repositorio de
 * Archivos del proyecto (ProjectFile) sin duplicar la lógica — ver
 * tasks/attachments.controller.js.
 */
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

module.exports = { findOrCreateFolder }
