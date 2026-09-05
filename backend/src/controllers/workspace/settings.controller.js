const prisma = require('../../lib/prisma')
const { validateImageUpload } = require('../../lib/imageType')
const { isFlagEnabledForWorkspace } = require('../../lib/featureFlags')
const { getTokenBudget } = require('../../lib/tokenBudget')

/**
 * GET /api/workspaces/current
 * Info del workspace actual.
 */
async function getCurrent(req, res, next) {
  try {
    const workspace = req.workspace
    const sub = await prisma.subscription.findUnique({
      where: { workspaceId: workspace.id },
    })
    res.json({
      ...workspace,
      subscription: sub,
      brandColors: JSON.parse(workspace.brandColors || '[]'),
      brandFonts:  JSON.parse(workspace.brandFonts  || '[]'),
      marketingDisabledSections: JSON.parse(workspace.marketingDisabledSections || '[]'),
    })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/workspaces/current
 * Editar nombre, timezone y datos de empresa. Solo admin/owner.
 */
async function updateCurrent(req, res, next) {
  try {
    const { name, timezone, companyName, companyDescription, industry, companyWebsite, brandColors, brandFonts, salesProposalGuidelines, salesSignatures, salesTasksProjectId } = req.body
    const data = {}
    if (name) data.name = name
    if (timezone) data.timezone = timezone
    if (companyName        !== undefined) data.companyName        = companyName
    if (companyDescription !== undefined) data.companyDescription = companyDescription
    if (industry           !== undefined) data.industry           = industry
    if (companyWebsite     !== undefined) data.companyWebsite     = companyWebsite
    if (brandColors        !== undefined) data.brandColors        = JSON.stringify(brandColors)
    if (brandFonts         !== undefined) data.brandFonts         = JSON.stringify(brandFonts)
    if (salesProposalGuidelines !== undefined) data.salesProposalGuidelines = salesProposalGuidelines?.trim() || null
    // Firmas del PDF de la propuesta: array, solo persistimos las claves conocidas (strings + showLogo bool).
    if (salesSignatures !== undefined) {
      data.salesSignatures = Array.isArray(salesSignatures)
        ? salesSignatures.filter(s => s && typeof s === 'object').map((s, i) => ({
            id:      typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `sig-${Date.now()}-${i}`,
            label:   typeof s.label   === 'string' ? s.label.trim()   : '',
            closing: typeof s.closing === 'string' ? s.closing.trim() : '',
            name:    typeof s.name    === 'string' ? s.name.trim()    : '',
            role:    typeof s.role    === 'string' ? s.role.trim()    : '',
            email:   typeof s.email   === 'string' ? s.email.trim()   : '',
            phone:   typeof s.phone   === 'string' ? s.phone.trim()   : '',
            note:    typeof s.note    === 'string' ? s.note.trim()    : '',
            showLogo: !!s.showLogo,
          }))
        : []
    }
    // Proyecto donde se crean las tareas futuras auto-generadas por las próximas
    // acciones de leads (ver leads.controller.js createTaskForAction).
    if (salesTasksProjectId !== undefined) {
      if (salesTasksProjectId == null) {
        data.salesTasksProjectId = null
      } else {
        const p = await prisma.project.findFirst({ where: { id: Number(salesTasksProjectId), workspaceId: req.workspace.id, active: true }, select: { id: true } })
        if (!p) return res.status(400).json({ error: 'Proyecto inválido' })
        data.salesTasksProjectId = p.id
      }
    }

    const workspace = await prisma.workspace.update({
      where: { id: req.workspace.id },
      data,
    })

    // Deserializar JSON antes de devolver
    res.json({
      ...workspace,
      brandColors: JSON.parse(workspace.brandColors || '[]'),
      brandFonts:  JSON.parse(workspace.brandFonts  || '[]'),
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/workspaces/current/logo
 * Sube el logo del workspace. Espera multipart con campo "image".
 */
async function uploadLogo(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' })

    // Validar por contenido real (magic bytes). No se permite SVG (riesgo de XSS al servirse
    // same-origin) ni se confía en la extensión / Content-Type del cliente.
    const check = validateImageUpload(req.file.buffer, ['image/png', 'image/jpeg', 'image/webp'])
    if (!check.ok) return res.status(400).json({ error: 'Formato no soportado. Usar PNG, JPG o WEBP.' })

    await prisma.workspace.update({
      where: { id: req.workspace.id },
      data: {
        logoData:     req.file.buffer,
        logoMimeType: check.mimeType,
      },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/workspaces/current/logo
 * Elimina el logo del workspace.
 */
async function deleteLogo(req, res, next) {
  try {
    await prisma.workspace.update({
      where: { id: req.workspace.id },
      data: { logoData: null, logoMimeType: null },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

/**
 * POST /api/workspaces/current/banner
 * Sube el banner del workspace. Espera multipart con campo "image".
 */
async function uploadBanner(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' })

    const check = validateImageUpload(req.file.buffer, ['image/png', 'image/jpeg', 'image/webp'])
    if (!check.ok) return res.status(400).json({ error: 'Formato no soportado. Usar PNG, JPG o WEBP.' })

    await prisma.workspace.update({
      where: { id: req.workspace.id },
      data: {
        bannerData:     req.file.buffer,
        bannerMimeType: check.mimeType,
      },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/workspaces/current/banner
 * Elimina el banner del workspace.
 */
async function deleteBanner(req, res, next) {
  try {
    await prisma.workspace.update({
      where: { id: req.workspace.id },
      data: { bannerData: null, bannerMimeType: null },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

/**
 * GET /api/workspaces/current/token-budget
 * Devuelve el consumo mensual de tokens vs el límite del workspace.
 */
async function getTokenBudgetStatus(req, res, next) {
  try {
    const budget = await getTokenBudget(req.workspace.id)
    res.json(budget)
  } catch (err) { next(err) }
}

/**
 * POST /api/workspaces/current/onboarding/complete
 * Marca completado (o saltado) el wizard de onboarding: selector de módulos + tour.
 * Idempotente — no pisa la fecha si ya estaba seteada.
 */
async function completeOnboarding(req, res, next) {
  try {
    let workspace = req.workspace
    if (!workspace.onboardingCompletedAt) {
      workspace = await prisma.workspace.update({
        where: { id: workspace.id },
        data:  { onboardingCompletedAt: new Date() },
        select: { onboardingCompletedAt: true },
      })
    }
    res.json({ onboardingCompletedAt: workspace.onboardingCompletedAt })
  } catch (err) { next(err) }
}

/**
 * GET /api/workspaces/current/onboarding/checklist
 * Estado de "Primeros pasos" para la tarjeta persistente del Dashboard (solo admin/owner).
 * Cada módulo aparece solo si está habilitado (grant de SuperAdmin) y no fue desactivado
 * por el workspace. `done` se recalcula en cada request, sin caché ni persistencia.
 */
async function getOnboardingChecklist(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const disabledKeys = JSON.parse(req.workspace.disabledFeatureKeys || '[]')

    const [flags, memberCount, integrationCount, eosData, leadCount] = await Promise.all([
      prisma.featureFlag.findMany({ where: { key: { in: ['marketing', 'eos', 'ventas'] } } }),
      prisma.workspaceMember.count({ where: { workspaceId, active: true } }),
      prisma.projectIntegration.count({ where: { workspaceId } }),
      prisma.eOSData.findUnique({ where: { workspaceId }, select: { purpose: true, niche: true } }),
      prisma.lead.count({ where: { workspaceId } }),
    ])

    function granted(key) {
      return isFlagEnabledForWorkspace(flags.find(f => f.key === key), workspaceId, disabledKeys)
    }

    res.json({
      team:      { done: memberCount > 1 },
      marketing: granted('marketing') ? { done: integrationCount > 0 } : null,
      eos:       granted('eos') ? { done: !!(eosData?.purpose || eosData?.niche) } : null,
      ventas:    granted('ventas') ? { done: leadCount > 0 } : null,
    })
  } catch (err) { next(err) }
}

module.exports = {
  getCurrent, updateCurrent,
  uploadLogo, deleteLogo, uploadBanner, deleteBanner,
  getTokenBudgetStatus,
  completeOnboarding, getOnboardingChecklist,
}
