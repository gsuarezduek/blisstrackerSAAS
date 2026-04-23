const prisma = require('../lib/prisma')

/**
 * GET /api/legal/:key  (público, sin auth)
 * Devuelve el documento legal por key (ej: "terms_of_service").
 */
async function getDocument(req, res, next) {
  try {
    const doc = await prisma.legalDocument.findUnique({
      where: { key: req.params.key },
      select: { key: true, title: true, content: true, updatedAt: true },
    })
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' })
    res.json(doc)
  } catch (err) { next(err) }
}

/**
 * PUT /api/superadmin/legal/:key  (solo superadmin)
 * Crea o actualiza el documento legal.
 * Body: { title?, content }
 */
async function upsertDocument(req, res, next) {
  try {
    const { key } = req.params
    const { title, content } = req.body
    if (content === undefined) return res.status(400).json({ error: 'content requerido' })

    const doc = await prisma.legalDocument.upsert({
      where:  { key },
      update: {
        content,
        ...(title ? { title } : {}),
      },
      create: {
        key,
        title: title || key,
        content,
      },
    })
    res.json(doc)
  } catch (err) { next(err) }
}

module.exports = { getDocument, upsertDocument }
