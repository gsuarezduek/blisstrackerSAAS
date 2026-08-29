const prisma = require('../lib/prisma')
const { validateImageUpload } = require('../lib/imageType')

const CONTENT_ID = 1 // fila única
const MAX_ACCENT_WORDS = 12
const MAX_ACCENT_WORD_LEN = 40

// Sanea la lista de palabras del typewriter del hero: strings no vacías, trim,
// dedup, con tope de cantidad y largo (mismo criterio que blockedWords/examples
// del bot de WhatsApp) para no dejar animar frases larguísimas o listas gigantes.
function sanitizeAccentWords(input) {
  if (!Array.isArray(input)) return null
  const seen = new Set()
  const words = []
  for (const raw of input) {
    const w = String(raw ?? '').trim().slice(0, MAX_ACCENT_WORD_LEN)
    if (!w || seen.has(w)) continue
    seen.add(w)
    words.push(w)
    if (words.length >= MAX_ACCENT_WORDS) break
  }
  return words
}

// ─── Hero / video (LandingContent) ───────────────────────────────────────────

/**
 * GET /api/landing/content
 * Contenido editable del hero de la landing pública. Ruta pública (sin auth).
 * Si todavía no se editó nada, devuelve los defaults del schema (el copy
 * original) para que la landing nunca quede vacía.
 */
async function getContent(req, res, next) {
  try {
    const content = await prisma.landingContent.findUnique({ where: { id: CONTENT_ID } })
    if (content) return res.json(content)

    // Sin fila todavía: devolver los defaults sin crear nada (evita escribir en un GET).
    res.json({
      heroBadge:            'Hecho para agencias de marketing · Gratis hasta 3 usuarios',
      heroTitle:            'El sistema operativo',
      heroTitleAccentWords: ['agencia', 'negocio', 'equipo', 'empresa'],
      heroSubtitle:         'Tareas con foco real, visibilidad de tu equipo en vivo, e informes automáticos — más los módulos que tu agencia necesite: marketing, EOS, ventas.',
      demoVideoUrl:         null,
    })
  } catch (err) { next(err) }
}

/**
 * PUT /api/superadmin/landing/content
 * Body: { heroBadge?, heroTitle?, heroTitleAccentWords?, heroSubtitle?, demoVideoUrl? }
 */
async function updateContent(req, res, next) {
  try {
    const { heroBadge, heroTitle, heroTitleAccentWords, heroSubtitle, demoVideoUrl } = req.body
    const data = {}
    if (heroBadge    !== undefined) data.heroBadge    = String(heroBadge).trim()
    if (heroTitle    !== undefined) data.heroTitle    = String(heroTitle).trim()
    if (heroSubtitle !== undefined) data.heroSubtitle = String(heroSubtitle).trim()
    if (demoVideoUrl !== undefined) data.demoVideoUrl = demoVideoUrl?.trim() || null
    if (heroTitleAccentWords !== undefined) {
      const words = sanitizeAccentWords(heroTitleAccentWords)
      if (!words || words.length === 0) {
        return res.status(400).json({ error: 'heroTitleAccentWords debe ser una lista con al menos una palabra' })
      }
      data.heroTitleAccentWords = words
    }

    const content = await prisma.landingContent.upsert({
      where:  { id: CONTENT_ID },
      update: data,
      create: { id: CONTENT_ID, ...data },
    })
    res.json(content)
  } catch (err) { next(err) }
}

// ─── Empresas que confían (TrustedCompany) — público / usuarios ─────────────

/**
 * GET /api/landing/trusted-companies
 * Solo activas, ordenadas. Ruta pública (sin auth). No incluye imageData.
 */
async function listTrustedCompanies(req, res, next) {
  try {
    const companies = await prisma.trustedCompany.findMany({
      where:   { active: true },
      orderBy: { order: 'asc' },
      select:  { id: true, name: true, websiteUrl: true },
    })
    res.json(companies.map(c => ({ ...c, imageUrl: `/api/landing/trusted-companies/${c.id}/image` })))
  } catch (err) { next(err) }
}

/**
 * GET /api/landing/trusted-companies/:id/image
 * Sirve el logo directamente desde la DB. Ruta pública (sin auth).
 */
async function serveTrustedCompanyImage(req, res, next) {
  try {
    const id = Number(req.params.id)
    const company = await prisma.trustedCompany.findUnique({
      where:  { id },
      select: { imageData: true, mimeType: true },
    })
    if (!company) return res.status(404).json({ error: 'Imagen no encontrada' })

    res.set('Content-Type', company.mimeType)
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Cache-Control', 'public, max-age=86400') // 24h cache
    res.send(Buffer.from(company.imageData))
  } catch (err) { next(err) }
}

// ─── Empresas que confían — superadmin ───────────────────────────────────────

/**
 * GET /api/superadmin/landing/trusted-companies
 * Lista completa (activas + inactivas) para el panel.
 */
async function listAllTrustedCompanies(req, res, next) {
  try {
    const companies = await prisma.trustedCompany.findMany({
      orderBy: { order: 'asc' },
      select:  { id: true, name: true, websiteUrl: true, order: true, active: true, createdAt: true },
    })
    res.json(companies)
  } catch (err) { next(err) }
}

/**
 * POST /api/superadmin/landing/trusted-companies
 * Multipart/form-data: campo "image" + "name" + "websiteUrl" (opcional).
 */
async function createTrustedCompany(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' })

    const { name, websiteUrl } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'El nombre es requerido' })

    const check = validateImageUpload(req.file.buffer, ['image/png', 'image/jpeg', 'image/webp'])
    if (!check.ok) return res.status(400).json({ error: 'Formato no soportado. Usar PNG, JPG o WEBP.' })

    const maxOrder = await prisma.trustedCompany.aggregate({ _max: { order: true } })
    const nextOrder = (maxOrder._max.order ?? 0) + 1

    const company = await prisma.trustedCompany.create({
      data: {
        name:       name.trim(),
        websiteUrl: websiteUrl?.trim() || null,
        order:      nextOrder,
        active:     true,
        imageData:  req.file.buffer,
        mimeType:   check.mimeType,
      },
      select: { id: true, name: true, websiteUrl: true, order: true, active: true },
    })
    res.status(201).json(company)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/landing/trusted-companies/:id
 * Actualiza name/websiteUrl/order.
 */
async function updateTrustedCompany(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { name, websiteUrl, order } = req.body

    const existing = await prisma.trustedCompany.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Empresa no encontrada' })

    const data = {}
    if (name       !== undefined) data.name       = name.trim()
    if (websiteUrl !== undefined) data.websiteUrl = websiteUrl?.trim() || null
    if (order      !== undefined) data.order      = Number(order)

    const company = await prisma.trustedCompany.update({
      where:  { id },
      data,
      select: { id: true, name: true, websiteUrl: true, order: true, active: true },
    })
    res.json(company)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/landing/trusted-companies/reorder
 * Body: { items: [{ id, order }] }
 */
async function reorderTrustedCompanies(req, res, next) {
  try {
    const { items } = req.body
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items debe ser un array' })
    }

    await prisma.$transaction(
      items.map(({ id, order }) =>
        prisma.trustedCompany.update({
          where: { id: Number(id) },
          data:  { order: Number(order) },
        })
      )
    )

    const companies = await prisma.trustedCompany.findMany({
      orderBy: { order: 'asc' },
      select:  { id: true, name: true, websiteUrl: true, order: true, active: true },
    })
    res.json(companies)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/landing/trusted-companies/:id/toggle
 */
async function toggleTrustedCompany(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.trustedCompany.findUnique({ where: { id }, select: { active: true } })
    if (!existing) return res.status(404).json({ error: 'Empresa no encontrada' })

    const company = await prisma.trustedCompany.update({
      where:  { id },
      data:   { active: !existing.active },
      select: { id: true, name: true, websiteUrl: true, order: true, active: true },
    })
    res.json(company)
  } catch (err) { next(err) }
}

/**
 * DELETE /api/superadmin/landing/trusted-companies/:id
 */
async function deleteTrustedCompany(req, res, next) {
  try {
    await prisma.trustedCompany.delete({ where: { id: Number(req.params.id) } })
    res.json({ ok: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Empresa no encontrada' })
    next(err)
  }
}

module.exports = {
  getContent, updateContent,
  listTrustedCompanies, serveTrustedCompanyImage,
  listAllTrustedCompanies, createTrustedCompany, updateTrustedCompany,
  reorderTrustedCompanies, toggleTrustedCompany, deleteTrustedCompany,
}
