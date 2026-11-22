const prisma = require('./prisma')

// Admin/owner del workspace actual (según el rol real de su membership).
function isAdmin(req) {
  const m = req.workspaceMember
  return m?.role === 'admin' || m?.role === 'owner'
}

async function isProjectMember(projectId, userId) {
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  })
  return !!member
}

// Escritura sobre un proyecto: admin/owner del workspace, o miembro del equipo
// del proyecto (ProjectMember). Mismo criterio en saveInfo/saveLinks,
// briefs, meetings y el portal de cliente. La Situación (saveSituation) es la
// excepción: la puede editar cualquier miembro del workspace.
//
// Es también el criterio de ACCESO a un proyecto privado (ver concepto
// "Proyectos privados"): admin/owner o equipo ven la ficha completa, el resto
// del workspace no — por eso lo reusan tanto las escrituras de siempre como el
// guard de lectura `requireProjectAccess` en projects.routes.js.
async function canWrite(req, projectId) {
  if (isAdmin(req)) return true
  return isProjectMember(projectId, req.user.userId)
}

// Filtra tareas de proyectos privados que QUIEN MIRA no puede ver — ver concepto
// "Proyectos privados". Nació en users.controller.js para el perfil de una persona y se
// movió acá cuando la ficha del agente pasó a necesitar la misma defensa: una ficha que
// lista tareas es un atajo para leer lo que Actividad ya enmascara, y tener dos copias
// de este filtro es tener una que algún día se olvida de actualizar.
//
// `taskLists` es un array de listas (se filtran todas con una sola consulta de
// membresías) y devuelve las mismas listas filtradas, en el mismo orden. Las tareas
// necesitan traer `project: { isPrivate }` y `projectId` en el select.
async function filterVisibleTasks(req, taskLists) {
  if (isAdmin(req)) return taskLists
  const all = taskLists.flat()
  const privateIds = [...new Set(all.filter(t => t.project?.isPrivate).map(t => t.projectId))]
  if (privateIds.length === 0) return taskLists
  const memberships = await prisma.projectMember.findMany({
    where: { projectId: { in: privateIds }, userId: req.user.userId },
    select: { projectId: true },
  })
  const accessibleIds = new Set(memberships.map(m => m.projectId))
  const canSee = t => !t.project?.isPrivate || accessibleIds.has(t.projectId)
  return taskLists.map(list => list.filter(canSee))
}

module.exports = { isAdmin, canWrite, isProjectMember, filterVisibleTasks }
