const prisma = require('../../lib/prisma')
const { normalizePhone } = require('../../lib/phone')

// Verifica que la empresa exista dentro del workspace. Devuelve la company o null.
async function assertCompany(companyId, workspaceId) {
  return prisma.company.findFirst({ where: { id: Number(companyId), workspaceId }, select: { id: true } })
}

// GET /api/ventas/contacts?companyId=
async function listContacts(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const where = { workspaceId }
    if (req.query.companyId) where.companyId = Number(req.query.companyId)
    const contacts = await prisma.contact.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { company: { select: { id: true, name: true } } },
    })
    res.json(contacts)
  } catch (err) { next(err) }
}

// POST /api/ventas/contacts
async function createContact(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { companyId, name, title, email, phone } = req.body
    if (!companyId) return res.status(400).json({ error: 'Empresa requerida' })
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nombre requerido' })
    if (!(await assertCompany(companyId, workspaceId))) return res.status(404).json({ error: 'Empresa no encontrada' })

    const contact = await prisma.contact.create({
      data: {
        workspaceId,
        companyId: Number(companyId),
        name: name.trim(),
        title: title?.trim() || null,
        email: email?.trim() || null,
        phone: normalizePhone(phone),
      },
    })
    res.status(201).json(contact)
  } catch (err) { next(err) }
}

// PATCH /api/ventas/contacts/:id
async function updateContact(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.contact.findFirst({ where: { id, workspaceId }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: 'Contacto no encontrado' })

    const { name, title, email, phone } = req.body
    const data = {}
    if (name  !== undefined) { if (!name.trim()) return res.status(400).json({ error: 'Nombre requerido' }); data.name = name.trim() }
    if (title !== undefined) data.title = title?.trim() || null
    if (email !== undefined) data.email = email?.trim() || null
    if (phone !== undefined) data.phone = normalizePhone(phone)

    const contact = await prisma.contact.update({ where: { id }, data })
    res.json(contact)
  } catch (err) { next(err) }
}

// DELETE /api/ventas/contacts/:id
async function deleteContact(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.contact.findFirst({ where: { id, workspaceId }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: 'Contacto no encontrado' })
    await prisma.contact.delete({ where: { id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listContacts, createContact, updateContact, deleteContact }
