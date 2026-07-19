const prisma = require('../../lib/prisma')

// GET /api/ventas/companies?search=
async function listCompanies(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { search } = req.query
    const where = { workspaceId }
    if (search && search.trim()) where.name = { contains: search.trim(), mode: 'insensitive' }

    const companies = await prisma.company.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { contacts: true, leads: true } } },
    })
    res.json(companies)
  } catch (err) { next(err) }
}

// GET /api/ventas/companies/:id
async function getCompany(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const company = await prisma.company.findFirst({
      where: { id: Number(req.params.id), workspaceId },
      include: {
        contacts: { orderBy: { name: 'asc' } },
        leads:    { orderBy: { createdAt: 'desc' }, select: { id: true, title: true, status: true, estimatedValue: true } },
      },
    })
    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' })
    res.json(company)
  } catch (err) { next(err) }
}

// POST /api/ventas/companies
async function createCompany(req, res, next) {
  try {
    const { name, website, industry, notes } = req.body
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nombre requerido' })
    const company = await prisma.company.create({
      data: {
        workspaceId: req.workspace.id,
        name: name.trim(),
        website:  website?.trim()  || null,
        industry: industry?.trim() || null,
        notes:    notes?.trim()    || null,
      },
    })
    res.status(201).json(company)
  } catch (err) { next(err) }
}

// PATCH /api/ventas/companies/:id
async function updateCompany(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.company.findFirst({ where: { id, workspaceId }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: 'Empresa no encontrada' })

    const { name, website, industry, notes } = req.body
    const data = {}
    if (name     !== undefined) { if (!name.trim()) return res.status(400).json({ error: 'Nombre requerido' }); data.name = name.trim() }
    if (website  !== undefined) data.website  = website?.trim()  || null
    if (industry !== undefined) data.industry = industry?.trim() || null
    if (notes    !== undefined) data.notes    = notes?.trim()    || null

    const company = await prisma.company.update({ where: { id }, data })
    res.json(company)
  } catch (err) { next(err) }
}

// DELETE /api/ventas/companies/:id  (cascada: elimina contactos y leads asociados)
async function deleteCompany(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.company.findFirst({ where: { id, workspaceId }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: 'Empresa no encontrada' })
    await prisma.company.delete({ where: { id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listCompanies, getCompany, createCompany, updateCompany, deleteCompany }
