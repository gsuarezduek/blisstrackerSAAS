const prisma = require('../lib/prisma')
const {
  resolveLegajoFields, coerceCustomValue, isAdminEditableField,
} = require('../lib/legajoCatalog')
const { sendLegajoRequestEmail } = require('../services/email.service')

// ─── Legajo gestionado desde RRHH ─────────────────────────────────────────────
// Hasta ahora el legajo era estrictamente autoservicio ("cada persona carga y
// actualiza sus datos desde Mi Perfil"). Eso dejaba sin resolver el caso más
// común de RRHH: el dato llegó por mail o por WhatsApp y alguien lo tiene que
// cargar. Acá se agregan las dos mitades de eso — completarlo, y pedirlo.
//
// Lo que un admin NO puede escribir son los campos de salud (`selfOnly` en
// `lib/legajoCatalog.js`): que figuren en el legajo es útil, que los tipee un
// tercero es otra cosa. Esos solo se piden.

// Coacciona el valor de un campo BUILTIN al tipo de su columna en `User`.
// `profile.controller.js` hace lo mismo pero campo por campo (su lista es
// histórica y anterior al catálogo); acá se deriva del `type`, que es lo que el
// catálogo declara.
function coerceBuiltinValue(field, raw) {
  if (raw === null || raw === undefined || raw === '') return null
  switch (field.type) {
    case 'date':   { const d = new Date(raw); return isNaN(d) ? null : d }
    case 'number': { const n = Number(raw); return Number.isFinite(n) ? n : null }
    case 'boolean': return raw === true || raw === 'true'
    default: return String(raw)
  }
}

// Resuelve el destinatario y los campos del workspace de una sola vez.
async function loadTarget(req, res) {
  const workspaceId = req.workspace.id
  const userId = Number(req.params.userId)
  if (!Number.isInteger(userId)) {
    res.status(400).json({ error: 'userId inválido' })
    return null
  }
  const member = await prisma.workspaceMember.findUnique({
    where:  { workspaceId_userId: { workspaceId, userId } },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  if (!member) {
    res.status(404).json({ error: 'La persona no está en este workspace' })
    return null
  }
  return { workspaceId, userId, member, fields: resolveLegajoFields(req.workspace.legajoFields) }
}

/**
 * PATCH /api/admin/rrhh/legajo/:userId
 * Body: { values: { [fieldKey]: value } } — solo las claves que se quieren tocar.
 * Una clave ausente no se modifica; '' o null borran el dato.
 */
async function updateLegajo(req, res, next) {
  try {
    const target = await loadTarget(req, res)
    if (!target) return
    const { workspaceId, userId, member, fields } = target

    const values = req.body?.values
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      return res.status(400).json({ error: 'values debe ser un objeto { campo: valor }' })
    }

    const byKey = Object.fromEntries(fields.filter(f => f.enabled !== false).map(f => [f.key, f]))
    const userData = {}
    const nextLegajo = { ...(member.legajoData || {}) }
    const touched = []
    let anyCustom = false

    for (const [key, raw] of Object.entries(values)) {
      const field = byKey[key]
      if (!field) continue                           // clave desconocida o campo apagado
      if (!isAdminEditableField(key)) {
        return res.status(400).json({
          error: `"${field.label}" solo lo puede cargar la propia persona`,
          code: 'FIELD_SELF_ONLY',
          field: key,
        })
      }
      if (field.builtin) userData[field.column ?? key] = coerceBuiltinValue(field, raw)
      else {
        const val = coerceCustomValue(field, raw)
        if (val === undefined) delete nextLegajo[key]
        else nextLegajo[key] = val
        anyCustom = true
      }
      touched.push(field.label)
    }

    if (touched.length === 0) {
      return res.status(400).json({ error: 'Ningún campo editable en el pedido' })
    }

    const [user] = await prisma.$transaction([
      ...(Object.keys(userData).length > 0
        ? [prisma.user.update({ where: { id: userId }, data: userData, select: { id: true } })]
        : [prisma.user.findUnique({ where: { id: userId }, select: { id: true } })]),
      ...(anyCustom
        ? [prisma.workspaceMember.update({
            where: { workspaceId_userId: { workspaceId, userId } },
            data:  { legajoData: nextLegajo },
          })]
        : []),
    ])

    // La persona se entera de que alguien más tocó sus datos. Mismo criterio que
    // los avisos de 2FA: el falso positivo molesta, el silencio es peor.
    notifyPerson(workspaceId, userId, req.user.userId, req.user.name, touched)
      .catch(err => console.error('[RRHH legajo] aviso:', err.message))

    res.json({ ok: true, userId: user.id, updated: touched })
  } catch (err) { next(err) }
}

async function notifyPerson(workspaceId, userId, actorId, actorName, labels) {
  if (userId === actorId) return   // un admin editando su propio legajo no se avisa a sí mismo
  const preview = labels.length > 3 ? `${labels.slice(0, 3).join(', ')} y ${labels.length - 3} más` : labels.join(', ')
  await prisma.notification.create({
    data: {
      workspaceId, userId, actorId, type: 'LEGAJO_UPDATED',
      message: `${actorName} completó datos de tu legajo: ${preview}`,
    },
  })
}

/**
 * POST /api/admin/rrhh/legajo/:userId/request
 * Body: { fieldKeys: [...], note? }
 * Le pide a la persona que complete esos campos: notificación in-app + email con
 * un link a Mi Perfil que muestra arriba SOLO esos campos.
 */
async function requestLegajo(req, res, next) {
  try {
    const target = await loadTarget(req, res)
    if (!target) return
    const { workspaceId, userId, member, fields } = target

    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'No tiene sentido pedírtelo a vos mismo' })
    }

    const wanted = Array.isArray(req.body?.fieldKeys) ? req.body.fieldKeys : []
    const byKey = Object.fromEntries(fields.filter(f => f.enabled !== false).map(f => [f.key, f]))
    const asked = wanted.map(k => byKey[String(k)]).filter(Boolean)
    if (asked.length === 0) {
      return res.status(400).json({ error: 'Indicá al menos un campo que exista en el legajo' })
    }

    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : ''
    const labels = asked.map(f => f.label)
    const preview = labels.length > 3 ? `${labels.slice(0, 3).join(', ')} y ${labels.length - 3} más` : labels.join(', ')

    await prisma.notification.create({
      data: {
        workspaceId, userId, actorId: req.user.userId, type: 'LEGAJO_REQUESTED',
        message: `${req.user.name} te pide completar tu legajo: ${preview}`,
      },
    })

    // Best-effort, como el resto de los avisos de RRHH: el pedido ya quedó hecho
    // in-app aunque el mail falle.
    sendLegajoRequestEmail(
      member.user.email, member.user.name, req.workspace.name, req.workspace.slug,
      asked.map(f => ({ key: f.key, label: f.label })),
      req.user.name, note, workspaceId,
    ).catch(err => console.error('[RRHH legajo] email:', err.message))

    res.json({ ok: true, asked: labels })
  } catch (err) { next(err) }
}

module.exports = { updateLegajo, requestLegajo }
