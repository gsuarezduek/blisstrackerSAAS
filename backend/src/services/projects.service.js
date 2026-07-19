const prisma = require('../lib/prisma')

/**
 * Crea un proyecto con sus servicios y miembros. Punto único de creación de
 * proyectos, reutilizado por el controller de proyectos y por la conversión de
 * un Lead ganado (módulo Ventas). El creador siempre queda como miembro.
 *
 * @param {object} p
 * @param {number}   p.workspaceId
 * @param {string}   p.name
 * @param {number}   p.creatorId          usuario que crea (siempre se agrega como miembro)
 * @param {number[]} [p.serviceIds=[]]
 * @param {number[]} [p.memberIds=[]]
 * @param {string}   [p.websiteUrl]       opcional (ej. sitio del cliente al convertir)
 * @param {object|string} [p.connections] opcional, JSON de redes
 * @param {object}   [p.include]          include de Prisma para el objeto devuelto
 * @returns el proyecto creado
 */
async function createProject({ workspaceId, name, creatorId, serviceIds = [], memberIds = [], websiteUrl, connections, include }) {
  const uniqueMemberIds = [...new Set([creatorId, ...memberIds.map(Number)].filter(Boolean))]

  const data = {
    workspaceId,
    name,
    services: { create: serviceIds.map(serviceId => ({ serviceId: Number(serviceId) })) },
    members:  { create: uniqueMemberIds.map(userId => ({ userId: Number(userId) })) },
  }
  if (websiteUrl) data.websiteUrl = websiteUrl
  if (connections != null) data.connections = typeof connections === 'string' ? connections : JSON.stringify(connections)

  return prisma.project.create({ data, ...(include ? { include } : {}) })
}

module.exports = { createProject }
