// Autorización por documento colaborativo, invocada desde el hook `onAuthenticate`
// de Hocuspocus (ver hocuspocusServer.js). Reutiliza — sin reimplementar — las
// mismas funciones de permiso que ya usa cada endpoint HTTP equivalente, para que
// una regla que cambie ahí se propague acá solo.
const prisma = require('../prisma')
const { verifyToken } = require('../jwt')
const { canWrite } = require('../projectAccess')
const { hasModuleAccess } = require('../moduleAccess')
const { isFlagEnabledForWorkspace } = require('../featureFlags')
const { parseDocKey } = require('./docPersistence')

// Mismo chequeo que hace `requireFeatureFlag(key)` en featureFlags.js (super
// admins siempre pasan el flag, todos los demás necesitan el grant de SuperAdmin
// sin opt-out del workspace) — reimplementado acá porque ese helper es un
// middleware Express (req/res/next), no una función que este hook pueda llamar.
async function assertFeatureFlag(key, workspace, isSuperAdmin) {
  if (isSuperAdmin) return
  const flag = await prisma.featureFlag.findUnique({ where: { key } })
  const disabledKeys = JSON.parse(workspace.disabledFeatureKeys ?? '[]')
  if (!isFlagEnabledForWorkspace(flag, workspace.id, disabledKeys)) {
    throw new Error(`Módulo '${key}' no habilitado para este workspace`)
  }
}

// Lanza si el token es inválido o el usuario no tiene permiso sobre `docKey`.
// Devuelve el contexto que Hocuspocus guarda para el resto de los hooks de esta
// conexión (onLoadDocument/onStoreDocument no vuelven a resolver permisos).
async function resolveDocAccess(docKey, token) {
  const decoded = verifyToken(token) // lanza si el JWT es inválido/expirado
  const parsed = parseDocKey(docKey)
  if (!parsed) throw new Error('Documento desconocido')

  const { userId, workspaceId, role, teamRole, isSuperAdmin, name } = decoded
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) throw new Error('Workspace no encontrado')

  // `req` mínimo para reusar canWrite/hasModuleAccess tal cual los usan los
  // controllers HTTP — el JWT ya trae el role/teamRole vigentes de este
  // workspace (se reemite al cambiar de workspace), no hace falta re-consultar
  // WorkspaceMember.
  const req = {
    workspace,
    workspaceMember: { role, teamRole, userId },
    user: { userId, isSuperAdmin },
  }

  if (parsed.kind === 'meeting') {
    const id = Number(parsed.rawId)
    const meeting = id && await prisma.projectMeeting.findFirst({
      where: { id, workspaceId },
      select: { projectId: true },
    })
    if (!meeting) throw new Error('Reunión no encontrada')
    if (!(await canWrite(req, meeting.projectId))) throw new Error('Sin acceso a esta reunión')
    return { userId, workspaceId, name }
  }

  if (parsed.kind === 'lead') {
    const id = Number(parsed.rawId)
    const lead = id && await prisma.lead.findFirst({ where: { id, workspaceId }, select: { id: true } })
    if (!lead) throw new Error('Lead no encontrado')
    // El JWT no lleva los roles adicionales: se leen de la DB solo cuando hace falta.
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { extraTeamRoles: true },
    })
    req.workspaceMember.extraTeamRoles = member?.extraTeamRoles ?? []
    if (!hasModuleAccess(req, 'ventas')) throw new Error('Sin acceso al módulo de Ventas')
    await assertFeatureFlag('ventas', workspace, isSuperAdmin)
    return { userId, workspaceId, name }
  }

  if (parsed.kind === 'eosMeeting') {
    await assertFeatureFlag('eos', workspace, isSuperAdmin)
    if (role !== 'admin' && role !== 'owner') throw new Error('Se requieren permisos de administrador')
    return { userId, workspaceId, name }
  }

  throw new Error('Tipo de documento desconocido')
}

module.exports = { resolveDocAccess }
