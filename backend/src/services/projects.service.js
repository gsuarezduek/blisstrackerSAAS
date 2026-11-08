const prisma = require('../lib/prisma')
const { ensureProjectChannel } = require('../lib/chatChannels')
const { PROJECT_MODULE_FIELD, PROJECT_MODULE_OFF_BY_DEFAULT_ON_CREATE } = require('../lib/projectModules')

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
 * @param {object}   [p.settings]         lo que se elige al crear: secciones del proyecto
 *                                        (marketingEnabled/contenidoEnabled/briefsEnabled),
 *                                        isPrivate, hoursEnabled, monthlyHours
 * @param {object}   [p.include]          include de Prisma para el objeto devuelto
 * @returns el proyecto creado
 */
async function createProject({ workspaceId, name, creatorId, serviceIds = [], memberIds = [], websiteUrl, connections, settings = {}, include }) {
  const uniqueMemberIds = [...new Set([creatorId, ...memberIds.map(Number)].filter(Boolean))]

  const data = {
    workspaceId,
    name,
    services: { create: serviceIds.map(serviceId => ({ serviceId: Number(serviceId) })) },
    members:  { create: uniqueMemberIds.map(userId => ({ userId: Number(userId) })) },
  }
  if (websiteUrl) data.websiteUrl = websiteUrl
  if (connections != null) data.connections = typeof connections === 'string' ? connections : JSON.stringify(connections)

  // Secciones del proyecto (ver concepto "Secciones por proyecto (Marketing,
  // Contenido, Briefs)"). Lo que no viene en `settings` cae al default de alta:
  // Briefs apagado, el resto como el default del modelo. Ese default se aplica acá
  // y no en el schema porque el schema vale también para los proyectos que ya
  // existen, y a esos no hay que apagarles nada.
  for (const [key, field] of Object.entries(PROJECT_MODULE_FIELD)) {
    if (settings[field] !== undefined) data[field] = Boolean(settings[field])
    else if (PROJECT_MODULE_OFF_BY_DEFAULT_ON_CREATE.includes(key)) data[field] = false
  }
  // Privado desde el arranque: la validación de `setPrivacy` (nadie de afuera con
  // tareas abiertas) no hace falta acá porque el proyecto todavía no tiene ninguna.
  if (settings.isPrivate !== undefined) data.isPrivate = Boolean(settings.isPrivate)
  if (settings.hoursEnabled !== undefined) data.hoursEnabled = Boolean(settings.hoursEnabled)
  if (settings.monthlyHours !== undefined) {
    data.monthlyHours = settings.monthlyHours === null || settings.monthlyHours === ''
      ? null
      : Number(settings.monthlyHours)
  }

  const project = await prisma.project.create({ data, ...(include ? { include } : {}) })

  // Canal de chat del proyecto (#proyecto-<slug>) — best-effort: si falla, el proyecto
  // igual se crea; `materializeChannels` lo completa la próxima vez que alguien abra Chat.
  try {
    await ensureProjectChannel({ id: project.id, name: project.name, workspaceId })
  } catch (err) {
    console.error('[createProject] Error creando canal de chat del proyecto:', err.message)
  }

  return project
}

module.exports = { createProject }
