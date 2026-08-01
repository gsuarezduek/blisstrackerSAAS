const prisma = require('../../lib/prisma')
const { isValidStatus, isValidOrigin, statusMeta } = require('../../lib/salesCatalog')
const { assertActiveMember } = require('../../lib/assertActiveMember')
const { LEAD_LIST_INCLUDE, LEAD_DETAIL_INCLUDE, logLeadEvent } = require('./_shared')
const { createProject } = require('../../services/projects.service')
const { todayString } = require('../../utils/dates')

// ── Helpers ──────────────────────────────────────────────────

async function findLead(id, workspaceId, include) {
  return prisma.lead.findFirst({ where: { id: Number(id), workspaceId }, ...(include ? { include } : {}) })
}

function parseDate(v) {
  if (v == null || v === '') return null
  // Fechas "solo día" (YYYY-MM-DD) → mediodía UTC, para que no se corran de día al
  // mostrarlas/bucketearlas en la timezone del workspace (ART = UTC-3 las llevaría al día previo).
  const s = String(v)
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : new Date(s)
  return isNaN(d.getTime()) ? undefined : d // undefined = inválido
}

// Notifica al nuevo responsable que se le asignó un lead.
async function notifyOwner({ workspaceId, actorId, ownerId, leadTitle }) {
  if (!ownerId || ownerId === actorId) return
  try {
    await prisma.notification.create({
      data: {
        userId:  ownerId,
        actorId,
        workspaceId,
        type:    'LEAD_ASSIGNED',
        message: `te asignó el lead "${leadTitle}"`,
      },
    })
  } catch (err) { console.error('[ventas] notifyOwner error:', err.message) }
}

function leadTitleOf(lead) {
  return lead.title?.trim() || lead.company?.name || 'Lead'
}

// ── Handlers ─────────────────────────────────────────────────

// GET /api/ventas/leads?status=&ownerId=&origin=&from=&to=&search=
// Filtros extensibles: cada parámetro presente agrega una cláusula al `where`.
async function listLeads(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { status, ownerId, origin, from, to, search } = req.query

    const where = { workspaceId }
    if (status) where.status = status
    if (origin) where.origin = origin
    if (ownerId) where.ownerId = ownerId === 'none' ? null : Number(ownerId)
    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = new Date(`${from}T00:00:00.000Z`)
      if (to)   where.createdAt.lte = new Date(`${to}T23:59:59.999Z`)
    }
    if (search && search.trim()) {
      const q = search.trim()
      where.OR = [
        { title:   { contains: q, mode: 'insensitive' } },
        { company: { name: { contains: q, mode: 'insensitive' } } },
      ]
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: LEAD_LIST_INCLUDE,
    })
    res.json(leads)
  } catch (err) { next(err) }
}

// GET /api/ventas/leads/:id
async function getLead(req, res, next) {
  try {
    const lead = await findLead(req.params.id, req.workspace.id, LEAD_DETAIL_INCLUDE)
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })
    res.json(lead)
  } catch (err) { next(err) }
}

// POST /api/ventas/leads
// Soporta crear empresa y/o contacto inline (flujo "crear lead → empresa si no existe → contacto").
async function createLead(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const {
      companyId, newCompany, primaryContactId, newContact,
      ownerId, status, origin, estimatedValue, currency, title, nextContactAt,
    } = req.body

    if (status && !isValidStatus(status)) return res.status(400).json({ error: 'Estado inválido' })
    if (!isValidOrigin(origin ?? null))   return res.status(400).json({ error: 'Origen inválido' })
    if (ownerId != null && !(await assertActiveMember(ownerId, workspaceId)))
      return res.status(400).json({ error: 'El responsable no es un miembro activo del workspace' })

    const nextContact = parseDate(nextContactAt)
    if (nextContact === undefined) return res.status(400).json({ error: 'Fecha de próximo contacto inválida' })

    // Resolver empresa (existente o nueva) + contacto en una transacción.
    const lead = await prisma.$transaction(async (tx) => {
      let resolvedCompanyId = companyId ? Number(companyId) : null
      if (!resolvedCompanyId) {
        if (!newCompany?.name?.trim()) throw Object.assign(new Error('Empresa requerida'), { status: 400 })
        const c = await tx.company.create({
          data: {
            workspaceId,
            name: newCompany.name.trim(),
            website:  newCompany.website?.trim()  || null,
            industry: newCompany.industry?.trim() || null,
            notes:    newCompany.notes?.trim()    || null,
          },
        })
        resolvedCompanyId = c.id
      } else {
        const c = await tx.company.findFirst({ where: { id: resolvedCompanyId, workspaceId }, select: { id: true } })
        if (!c) throw Object.assign(new Error('Empresa no encontrada'), { status: 404 })
      }

      let resolvedContactId = primaryContactId ? Number(primaryContactId) : null
      if (!resolvedContactId && newContact?.name?.trim()) {
        const ct = await tx.contact.create({
          data: {
            workspaceId, companyId: resolvedCompanyId,
            name: newContact.name.trim(),
            title: newContact.title?.trim() || null,
            email: newContact.email?.trim() || null,
            phone: newContact.phone?.trim() || null,
          },
        })
        resolvedContactId = ct.id
      } else if (resolvedContactId) {
        const ct = await tx.contact.findFirst({ where: { id: resolvedContactId, workspaceId, companyId: resolvedCompanyId }, select: { id: true } })
        if (!ct) throw Object.assign(new Error('El contacto no pertenece a la empresa'), { status: 400 })
      }

      // Si el lead se crea ya en un estado terminal, sellamos wonAt/lostAt para que
      // las métricas (win rate, ganados del mes) sean consistentes con changeStatus/convert.
      const initStatus = status || 'prospecto'
      const initMeta = statusMeta(initStatus)
      return tx.lead.create({
        data: {
          workspaceId,
          companyId: resolvedCompanyId,
          primaryContactId: resolvedContactId,
          ownerId: ownerId != null ? Number(ownerId) : null,
          title: title?.trim() || null,
          status: initStatus,
          origin: origin || null,
          estimatedValue: estimatedValue != null && estimatedValue !== '' ? Number(estimatedValue) : null,
          currency: currency || 'ARS',
          nextContactAt: nextContact,
          wonAt:  initMeta?.isWon  ? new Date() : null,
          lostAt: initMeta?.isLost ? new Date() : null,
          createdById: userId,
        },
        include: LEAD_LIST_INCLUDE,
      })
    })

    await logLeadEvent({ workspaceId, leadId: lead.id, userId, type: 'lead_created', content: 'creó el lead' })
    await notifyOwner({ workspaceId, actorId: userId, ownerId: lead.ownerId, leadTitle: leadTitleOf(lead) })
    res.status(201).json(lead)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
}

// PATCH /api/ventas/leads/:id  (campos generales; estado/responsable/próxima acción tienen endpoints propios)
async function updateLead(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const lead = await findLead(req.params.id, workspaceId)
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

    const { title, origin, estimatedValue, currency, nextContactAt, notes, primaryContactId, companyId } = req.body
    const data = {}
    if (title !== undefined) data.title = title?.trim() || null
    if (origin !== undefined) { if (!isValidOrigin(origin || null)) return res.status(400).json({ error: 'Origen inválido' }); data.origin = origin || null }
    if (currency !== undefined) data.currency = currency || 'ARS'
    if (estimatedValue !== undefined) data.estimatedValue = estimatedValue != null && estimatedValue !== '' ? Number(estimatedValue) : null
    if (nextContactAt !== undefined) { const d = parseDate(nextContactAt); if (d === undefined) return res.status(400).json({ error: 'Fecha inválida' }); data.nextContactAt = d }
    if (notes !== undefined) { if (typeof notes !== 'string') return res.status(400).json({ error: 'notes debe ser un string' }); data.notes = notes.trim() || null }
    if (companyId !== undefined) {
      const c = await prisma.company.findFirst({ where: { id: Number(companyId), workspaceId }, select: { id: true } })
      if (!c) return res.status(404).json({ error: 'Empresa no encontrada' })
      data.companyId = Number(companyId)
    }
    if (primaryContactId !== undefined) {
      if (primaryContactId == null) data.primaryContactId = null
      else {
        const targetCompany = data.companyId ?? lead.companyId
        const ct = await prisma.contact.findFirst({ where: { id: Number(primaryContactId), workspaceId, companyId: targetCompany }, select: { id: true } })
        if (!ct) return res.status(400).json({ error: 'El contacto no pertenece a la empresa' })
        data.primaryContactId = Number(primaryContactId)
      }
    }

    const updated = await prisma.lead.update({ where: { id: lead.id }, data, include: LEAD_DETAIL_INCLUDE })
    res.json(updated)
  } catch (err) { next(err) }
}

// PATCH /api/ventas/leads/:id/status  { status, lostReason? }
async function changeStatus(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const { status, lostReason } = req.body
    if (!isValidStatus(status)) return res.status(400).json({ error: 'Estado inválido' })

    const lead = await findLead(req.params.id, workspaceId, { company: { select: { name: true } } })
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })
    if (lead.status === status) return res.json(await findLead(lead.id, workspaceId, LEAD_DETAIL_INCLUDE))

    const meta = statusMeta(status)
    if (meta?.isLost && !lostReason?.trim()) {
      return res.status(400).json({ error: 'Indicá el motivo de la pérdida' })
    }
    const data = { status }
    data.wonAt  = meta?.isWon  ? new Date() : null
    data.lostAt = meta?.isLost ? new Date() : null
    data.lostReason = meta?.isLost ? lostReason.trim() : null

    await prisma.lead.update({ where: { id: lead.id }, data })
    await logLeadEvent({
      workspaceId, leadId: lead.id, userId, type: 'status_changed',
      content: `cambió el estado a "${meta?.label || status}"`,
      meta: { from: lead.status, to: status },
    })
    res.json(await findLead(lead.id, workspaceId, LEAD_DETAIL_INCLUDE))
  } catch (err) { next(err) }
}

// PATCH /api/ventas/leads/:id/owner  { ownerId }
async function changeOwner(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const { ownerId } = req.body
    const newOwnerId = ownerId != null ? Number(ownerId) : null
    if (newOwnerId != null && !(await assertActiveMember(newOwnerId, workspaceId)))
      return res.status(400).json({ error: 'El responsable no es un miembro activo del workspace' })

    const lead = await findLead(req.params.id, workspaceId, { company: { select: { name: true } } })
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

    await prisma.lead.update({ where: { id: lead.id }, data: { ownerId: newOwnerId } })
    await logLeadEvent({
      workspaceId, leadId: lead.id, userId, type: 'owner_changed',
      content: newOwnerId ? 'cambió el responsable comercial' : 'quitó el responsable comercial',
      meta: { from: lead.ownerId, to: newOwnerId },
    })
    await notifyOwner({ workspaceId, actorId: userId, ownerId: newOwnerId, leadTitle: leadTitleOf(lead) })
    res.json(await findLead(lead.id, workspaceId, LEAD_DETAIL_INCLUDE))
  } catch (err) { next(err) }
}

// Crea (best-effort) la tarea futura del dashboard vinculada a una LeadAction recién
// creada. Requiere fecha (dueAt) y responsable (ownerId) en la acción, y un proyecto
// resuelto: el del cliente si el lead ya se convirtió, si no el configurado en
// Workspace.salesTasksProjectId. Nunca lanza: si falta algo, la acción queda igual
// guardada, solo sin tarea vinculada (no bloquea el alta).
async function createTaskForAction({ workspaceId, tz, lead, action, requesterId }) {
  if (!action.dueAt || !action.ownerId) return null

  let projectId = lead.convertedProjectId
  if (!projectId) {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { salesTasksProjectId: true } })
    projectId = ws?.salesTasksProjectId || null
  }
  if (!projectId) return null

  const [project, member] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, workspaceId, active: true }, select: { id: true } }),
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: action.ownerId } },
      select: { active: true },
    }),
  ])
  if (!project || !member?.active) return null

  const today = todayString(tz)
  const dueStr = action.dueAt.toLocaleDateString('en-CA', { timeZone: tz })
  const scheduledFor = dueStr > today ? dueStr : null // hoy/pasado = tarea normal, no futura

  const wdKey = { userId_workspaceId_date: { userId: action.ownerId, workspaceId, date: today } }
  let workDay = await prisma.workDay.findUnique({ where: wdKey })
  if (!workDay) {
    try {
      workDay = await prisma.workDay.create({ data: { userId: action.ownerId, workspaceId, date: today } })
    } catch (e) {
      if (e.code === 'P2002') workDay = await prisma.workDay.findUnique({ where: wdKey })
      else throw e
    }
  }
  if (!workDay) return null

  return prisma.task.create({
    data: {
      description: `Ventas - ${action.title}`,
      projectId:   project.id,
      userId:      action.ownerId,
      workDayId:   workDay.id,
      createdById: action.ownerId !== requesterId ? requesterId : null,
      scheduledFor,
    },
  })
}

// POST /api/ventas/leads/:id/actions  { title, dueAt?, ownerId? }
// ownerId por defecto: quien crea la acción. Si hay dueAt, se intenta crear además
// la tarea futura vinculada (ver createTaskForAction) — best-effort.
async function addAction(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const userId = req.user.userId
    const { title, dueAt, ownerId } = req.body
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'El título de la acción es requerido' })

    const lead = await findLead(req.params.id, workspaceId)
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

    const due = parseDate(dueAt)
    if (due === undefined) return res.status(400).json({ error: 'Fecha de la acción inválida' })

    const actionOwnerId = ownerId != null ? Number(ownerId) : userId
    if (!(await assertActiveMember(actionOwnerId, workspaceId)))
      return res.status(400).json({ error: 'El responsable de la acción no es un miembro activo' })

    let action = await prisma.leadAction.create({
      data: {
        workspaceId, leadId: lead.id,
        title: String(title).trim(), dueAt: due, ownerId: actionOwnerId,
        createdById: userId,
      },
    })

    let task = null
    try {
      task = await createTaskForAction({ workspaceId, tz, lead, action, requesterId: userId })
    } catch (err) {
      console.error('[ventas] createTaskForAction error:', err.message)
    }
    if (task) {
      action = await prisma.leadAction.update({ where: { id: action.id }, data: { taskId: task.id } })
    }

    await logLeadEvent({
      workspaceId, leadId: lead.id, userId, type: 'next_action_added',
      content: `agregó la próxima acción: "${action.title}"`,
    })
    res.status(201).json(await findLead(lead.id, workspaceId, LEAD_DETAIL_INCLUDE))
  } catch (err) { next(err) }
}

// PATCH /api/ventas/leads/:id/actions/:actionId/resolve
// Marca la acción como resuelta. Si tiene tarea vinculada aún abierta, la completa
// también (sync en ambos sentidos con la tarea del dashboard — al revés, completar
// la tarea desde el dashboard resuelve la acción, ver tasks.controller.js).
async function resolveAction(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const actionId = Number(req.params.actionId)

    const lead = await findLead(req.params.id, workspaceId)
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

    const action = await prisma.leadAction.findFirst({ where: { id: actionId, workspaceId, leadId: lead.id } })
    if (!action) return res.status(404).json({ error: 'Acción no encontrada' })

    if (action.status !== 'done') {
      const now = new Date()
      await prisma.leadAction.update({ where: { id: action.id }, data: { status: 'done', doneAt: now, doneById: userId } })

      if (action.taskId) {
        await prisma.task.updateMany({ where: { id: action.taskId, status: { not: 'COMPLETED' } }, data: { status: 'COMPLETED', completedAt: now, pausedAt: null } })
        await prisma.taskSession.updateMany({ where: { taskId: action.taskId, endedAt: null }, data: { endedAt: now } })
      }

      await logLeadEvent({
        workspaceId, leadId: lead.id, userId, type: 'next_action_done',
        content: `resolvió la acción: "${action.title}"`,
      })
    }
    res.json(await findLead(lead.id, workspaceId, LEAD_DETAIL_INCLUDE))
  } catch (err) { next(err) }
}

// DELETE /api/ventas/leads/:id/actions/:actionId
async function deleteAction(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const actionId = Number(req.params.actionId)

    const lead = await findLead(req.params.id, workspaceId)
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

    const action = await prisma.leadAction.findFirst({ where: { id: actionId, workspaceId, leadId: lead.id } })
    if (!action) return res.status(404).json({ error: 'Acción no encontrada' })

    await prisma.leadAction.delete({ where: { id: action.id } })
    res.json(await findLead(lead.id, workspaceId, LEAD_DETAIL_INCLUDE))
  } catch (err) { next(err) }
}

// POST /api/ventas/leads/:id/notes  { content }
async function addNote(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const { content } = req.body
    if (!content || !content.trim()) return res.status(400).json({ error: 'La nota no puede estar vacía' })

    const lead = await findLead(req.params.id, workspaceId)
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

    const note = await prisma.leadActivity.create({
      data: { workspaceId, leadId: lead.id, userId, kind: 'note', content: content.trim() },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    })
    // touch: mueve el lead al tope de la lista (updatedAt)
    await prisma.lead.update({ where: { id: lead.id }, data: { updatedAt: new Date() } }).catch(() => {})
    res.status(201).json(note)
  } catch (err) { next(err) }
}

// DELETE /api/ventas/leads/:id/notes/:noteId  (solo notas manuales, no eventos automáticos)
async function deleteNote(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const note = await prisma.leadActivity.findFirst({
      where: { id: Number(req.params.noteId), workspaceId, leadId: Number(req.params.id), kind: 'note' },
      select: { id: true, userId: true },
    })
    if (!note) return res.status(404).json({ error: 'Nota no encontrada' })
    // Solo el autor o un admin puede borrar la nota.
    const isAdmin = req.user?.isSuperAdmin || ['admin', 'owner'].includes(req.workspaceMember?.role)
    if (note.userId !== req.user.userId && !isAdmin) return res.status(403).json({ error: 'No podés borrar esta nota' })
    await prisma.leadActivity.delete({ where: { id: note.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// DELETE /api/ventas/leads/:id
async function deleteLead(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const lead = await findLead(req.params.id, workspaceId)
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })
    const confirmedCount = await prisma.proposal.count({ where: { leadId: lead.id, status: 'confirmed' } })
    if (confirmedCount > 0) {
      return res.status(409).json({ error: 'Este lead tiene propuestas confirmadas — no se puede eliminar' })
    }
    await prisma.lead.delete({ where: { id: lead.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// POST /api/ventas/leads/:id/convert  { name?, serviceIds?, memberIds? }
// Convierte un lead ganado en Proyecto (reutiliza projects.service.createProject).
async function convertToProject(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const { name, serviceIds = [], memberIds = [] } = req.body

    const lead = await findLead(req.params.id, workspaceId, LEAD_DETAIL_INCLUDE)
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })
    if (lead.convertedProjectId) return res.status(409).json({ error: 'Este lead ya fue convertido en proyecto' })
    if (!['propuesta', 'ganado'].includes(lead.status)) {
      return res.status(409).json({ error: 'El lead debe estar en Propuesta o Ganado para convertirlo en proyecto' })
    }

    const projectName = (name?.trim()) || lead.company?.name || leadTitleOf(lead)

    let project
    try {
      project = await createProject({
        workspaceId,
        name: projectName,
        creatorId: userId,
        serviceIds,
        memberIds,
        websiteUrl: lead.company?.website || undefined,
      })
    } catch (err) {
      if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe un proyecto con ese nombre' })
      throw err
    }

    // Marca el lead como ganado + vincula el proyecto.
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        convertedProjectId: project.id,
        status: 'ganado',
        wonAt: lead.wonAt || new Date(),
        lostAt: null,
      },
    })

    await logLeadEvent({ workspaceId, leadId: lead.id, userId, type: 'converted_to_client', content: 'marcó el lead como cliente ganado' })
    await logLeadEvent({ workspaceId, leadId: lead.id, userId, type: 'project_created', content: `creó el proyecto "${projectName}"`, meta: { projectId: project.id } })

    const updated = await findLead(lead.id, workspaceId, LEAD_DETAIL_INCLUDE)
    res.status(201).json({ lead: updated, project })
  } catch (err) { next(err) }
}

module.exports = {
  listLeads, getLead, createLead, updateLead, changeStatus, changeOwner,
  addAction, resolveAction, deleteAction, addNote, deleteNote, deleteLead, convertToProject,
}
