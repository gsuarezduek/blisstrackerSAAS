// ─── ACCESOS / CREDENCIALES ─────────────────────────────────────────────────
// Son credenciales sensibles, pero al igual que el resto de la ficha del
// proyecto (info, links) son visibles y gestionables por cualquier miembro
// del workspace, no solo el equipo del proyecto (ProjectMember) o admins/owners.
// La contraseña se cifra con AES-256-GCM y solo se descifra en el endpoint
// reveal, bajo demanda.
//
// Todo lo que pasa con un acceso queda en ProjectAccessLog: quién vio un dato
// sensible y quién lo cambió. Ese log es el "Historial" de la pestaña y NUNCA
// guarda valores — de una contraseña registra QUE cambió, no a qué.
const prisma = require('../../lib/prisma')
const { encrypt, decrypt } = require('../../lib/encryption')
const { resolveProjectId } = require('./_shared')

// Campos de un acceso, en el orden en que se muestran.
const FIELDS = ['account', 'username', 'password', 'twofa', 'extra']
// Los que viven cifrados: hay que descifrarlos para compararlos con lo que llega.
const SECRET_FIELDS = new Set(['password', 'twofa'])

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
  updatedAt: a.updatedAt,
})

// Registra un evento en el historial del acceso. `label` congela el nombre de la
// cuenta porque al borrar el acceso el FK va a NULL (SetNull, para no perder el
// historial) y la fila quedaría sin forma de decir de qué acceso hablaba.
function logEvent({ req, projectId, access, action, field = null, fields = null }) {
  return prisma.projectAccessLog.create({
    data: {
      workspaceId: req.workspace.id,
      projectId,
      accessId: access.id,
      userId:   req.user.userId,
      action,
      field,
      fields,
      label: access.account || null,
    },
  })
}

// Lee los campos que llegan en el body. Clave ausente = no se toca; '' = se
// borra; valor = se guarda. Que "ausente" signifique "sin cambios" es lo que
// permite editar el usuario de un acceso sin tener que revelar antes su
// contraseña para reenviarla.
function readFields(body) {
  const out = {}
  for (const f of FIELDS) {
    if (!(f in body)) continue
    const raw = body[f]
    if (raw === null) { out[f] = null; continue }
    if (typeof raw !== 'string') return { error: `${f} debe ser texto` }
    out[f] = raw.trim() || null
  }
  return { values: out }
}

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

    const { values, error } = readFields(req.body)
    if (error) return res.status(400).json({ error })
    const filled = FIELDS.filter(f => values[f])
    if (filled.length === 0) {
      return res.status(400).json({ error: 'Completá al menos un campo del acceso' })
    }

    const created = await prisma.projectAccess.create({
      data: {
        projectId:   guard.projectId,
        workspaceId: req.workspace.id,
        account:  values.account  ?? null,
        username: values.username ?? null,
        password: values.password ? encrypt(values.password) : null,
        twofa:    values.twofa    ? encrypt(values.twofa)    : null,
        extra:    values.extra    ?? null,
      },
    })
    await logEvent({ req, projectId: guard.projectId, access: created, action: 'create', fields: filled })
    res.status(201).json(publicAccess(created))
  } catch (err) { next(err) }
}

// Edita un acceso (el caso típico: cambió la contraseña de la cuenta del cliente).
// Solo se tocan los campos que llegan en el body — ver readFields().
async function updateAccess(req, res, next) {
  try {
    const guard = await resolveAccessGuard(req)
    if (guard.error) return res.status(guard.status).json({ error: guard.error })

    const access = await prisma.projectAccess.findFirst({
      where: { id: Number(req.params.accessId), projectId: guard.projectId },
    })
    if (!access) return res.status(404).json({ error: 'Acceso no encontrado' })

    const { values, error } = readFields(req.body)
    if (error) return res.status(400).json({ error })

    // Se compara en claro (descifrando lo guardado) para que reescribir la misma
    // contraseña no quede en el historial como un cambio que nunca pasó.
    const data = {}
    const changed = []
    for (const f of FIELDS) {
      if (!(f in values)) continue
      const next = values[f]
      const current = SECRET_FIELDS.has(f) ? currentSecret(access, f) : access[f]
      if (next === current) continue
      data[f] = next && SECRET_FIELDS.has(f) ? encrypt(next) : next
      changed.push(f)
    }

    const after = { ...access, ...data }
    if (!FIELDS.some(f => after[f])) {
      return res.status(400).json({ error: 'Completá al menos un campo del acceso' })
    }
    if (changed.length === 0) return res.json(publicAccess(access))

    const updated = await prisma.projectAccess.update({ where: { id: access.id }, data })
    await logEvent({ req, projectId: guard.projectId, access: updated, action: 'update', fields: changed })
    res.json(publicAccess(updated))
  } catch (err) { next(err) }
}

// Valor en claro de un campo cifrado. Si el ciphertext no se puede descifrar
// (clave rotada, fila corrupta) se devuelve un sentinel que nunca va a coincidir
// con lo que llega: el campo se sobreescribe y queda registrado como cambio, que
// es exactamente lo que se quiere en ese caso.
function currentSecret(access, field) {
  if (!access[field]) return null
  try { return decrypt(access[field]) } catch { return undefined }
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

    // Log de quién solicitó ver el dato.
    await logEvent({ req, projectId: guard.projectId, access, action: 'reveal', field })

    res.json({ value: access[field] ? decrypt(access[field]) : null })
  } catch (err) { next(err) }
}

async function deleteAccess(req, res, next) {
  try {
    const guard = await resolveAccessGuard(req)
    if (guard.error) return res.status(guard.status).json({ error: guard.error })
    const access = await prisma.projectAccess.findFirst({
      where: { id: Number(req.params.accessId), projectId: guard.projectId },
    })
    if (!access) return res.status(404).json({ error: 'Acceso no encontrado' })

    // El log va primero: el borrado deja `accessId` en NULL (SetNull), así que la
    // fila se escribe mientras el acceso todavía existe y después queda huérfana
    // pero con su `label`.
    await logEvent({ req, projectId: guard.projectId, access, action: 'delete' })
    await prisma.projectAccess.delete({ where: { id: access.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// Historial del proyecto: qué pasó con sus accesos y quién lo hizo.
// ?type=changes (alta/edición/baja) | reveals (quién vio una contraseña) | all.
// Mismo criterio de acceso que el resto: quien puede ver las credenciales puede
// ver quién las tocó.
const LOG_TYPES = {
  changes: ['create', 'update', 'delete'],
  reveals: ['reveal'],
}

async function listLogs(req, res, next) {
  try {
    const guard = await resolveAccessGuard(req)
    if (guard.error) return res.status(guard.status).json({ error: guard.error })

    const where = { projectId: guard.projectId }
    // hasOwn y no un acceso directo: `type` viene del cliente y una clave del
    // prototipo ('constructor') devolvería algo que Prisma no sabe filtrar.
    if (Object.hasOwn(LOG_TYPES, req.query.type)) where.action = { in: LOG_TYPES[req.query.type] }
    const accessId = Number(req.query.accessId)
    if (Number.isInteger(accessId) && accessId > 0) where.accessId = accessId

    const take = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100)
    const logs = await prisma.projectAccessLog.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user:   { select: { id: true, name: true, avatar: true } },
        access: { select: { account: true } },
      },
    })

    res.json(logs.map(l => ({
      id:        l.id,
      action:    l.action,
      field:     l.field,
      fields:    Array.isArray(l.fields) ? l.fields : [],
      // El nombre vigente del acceso manda; si se borró, el que quedó congelado.
      account:   l.access?.account ?? l.label ?? null,
      accessId:  l.accessId,
      createdAt: l.createdAt,
      user:      l.user,
    })))
  } catch (err) { next(err) }
}

module.exports = { listAccesses, addAccess, updateAccess, revealAccess, deleteAccess, listLogs }
