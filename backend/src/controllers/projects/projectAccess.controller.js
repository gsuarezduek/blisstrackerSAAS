// ─── ACCESOS / CREDENCIALES ─────────────────────────────────────────────────
// Son credenciales sensibles, pero al igual que el resto de la ficha del
// proyecto (info, links) son visibles y gestionables por cualquier miembro
// del workspace, no solo el equipo del proyecto (ProjectMember) o admins/owners.
// La contraseña se cifra con AES-256-GCM y solo se descifra en el endpoint
// reveal, bajo demanda.
const prisma = require('../../lib/prisma')
const { encrypt, decrypt } = require('../../lib/encryption')
const { resolveProjectId } = require('./_shared')

// Resuelve el proyecto dentro del workspace actual.
// Devuelve { projectId } si OK, o { error, status } si no existe.
async function resolveAccessGuard(req) {
  const workspaceId = req.workspace.id
  const projectId = await resolveProjectId(req.params.id, workspaceId)
  if (!projectId) return { error: 'Proyecto no encontrado', status: 404 }
  return { projectId }
}

// Forma pública de un acceso: nunca expone la contraseña ni el 2FA, solo si los tiene.
const publicAccess = (a) => ({
  id: a.id,
  account: a.account,
  username: a.username,
  extra: a.extra,
  hasPassword: !!a.password,
  hasTwofa: !!a.twofa,
  createdAt: a.createdAt,
})

async function listAccesses(req, res, next) {
  try {
    const guard = await resolveAccessGuard(req)
    if (guard.error) return res.status(guard.status).json({ error: guard.error })
    const accesses = await prisma.projectAccess.findMany({
      where: { projectId: guard.projectId },
      orderBy: { createdAt: 'asc' },
    })
    res.json(accesses.map(publicAccess))
  } catch (err) { next(err) }
}

async function addAccess(req, res, next) {
  try {
    const guard = await resolveAccessGuard(req)
    if (guard.error) return res.status(guard.status).json({ error: guard.error })

    const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    const account  = clean(req.body.account)
    const username = clean(req.body.username)
    const password = clean(req.body.password)
    const twofa    = clean(req.body.twofa)
    const extra    = clean(req.body.extra)

    if (!account && !username && !password && !twofa && !extra) {
      return res.status(400).json({ error: 'Completá al menos un campo del acceso' })
    }

    const created = await prisma.projectAccess.create({
      data: {
        projectId:   guard.projectId,
        workspaceId: req.workspace.id,
        account,
        username,
        password: password ? encrypt(password) : null,
        twofa: twofa ? encrypt(twofa) : null,
        extra,
      },
    })
    res.status(201).json(publicAccess(created))
  } catch (err) { next(err) }
}

// Revela bajo demanda un dato sensible (password o 2FA) y registra la solicitud
// en el log de auditoría. ?field=password (default) | twofa.
async function revealAccess(req, res, next) {
  try {
    const guard = await resolveAccessGuard(req)
    if (guard.error) return res.status(guard.status).json({ error: guard.error })
    const field = req.query.field === 'twofa' ? 'twofa' : 'password'
    const access = await prisma.projectAccess.findFirst({
      where: { id: Number(req.params.accessId), projectId: guard.projectId },
    })
    if (!access) return res.status(404).json({ error: 'Acceso no encontrado' })

    // Log de quién solicitó ver el dato (la visualización del log se hará más adelante).
    await prisma.projectAccessLog.create({
      data: {
        workspaceId: req.workspace.id,
        projectId:   guard.projectId,
        accessId:    access.id,
        userId:      req.user.userId,
        field,
      },
    })

    res.json({ value: access[field] ? decrypt(access[field]) : null })
  } catch (err) { next(err) }
}

async function deleteAccess(req, res, next) {
  try {
    const guard = await resolveAccessGuard(req)
    if (guard.error) return res.status(guard.status).json({ error: guard.error })
    const result = await prisma.projectAccess.deleteMany({
      where: { id: Number(req.params.accessId), projectId: guard.projectId },
    })
    if (result.count === 0) return res.status(404).json({ error: 'Acceso no encontrado' })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listAccesses, addAccess, revealAccess, deleteAccess }
