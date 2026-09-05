const prisma = require('../../lib/prisma')
const { sendReportPublishedEmail } = require('../../services/email.service')
const { SECTION_KEYS, reportLabel, sanitizeSections, safeParseArr, safeParseObj } = require('./_shared')

/**
 * PATCH /api/marketing/projects/:id/reports/:month/status
 * Publica o vuelve a borrador un informe. body: { status: 'draft' | 'published' }
 * Solo los informes publicados son visibles por el link público del cliente.
 */
async function setReportStatus(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { month }   = req.params
    const { status }  = req.body

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Formato de mes inválido (esperado YYYY-MM)' })
    }
    if (status !== 'draft' && status !== 'published') {
      return res.status(400).json({ error: 'Estado inválido (draft | published)' })
    }

    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const report = await prisma.monthlyReport.findFirst({ where: { projectId, workspaceId, month }, select: { id: true } })
    if (!report) return res.status(404).json({ error: 'Informe no encontrado' })

    await prisma.monthlyReport.update({ where: { id: report.id }, data: { status } })
    res.json({ status })
  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/marketing/projects/:id/reports/:month/notify
 * Avisa por email a los contactos activos del portal de cliente de que el
 * informe (ya publicado) está disponible. Requiere portal activo con al menos
 * un contacto — mismo criterio que "Pedir aprobación" de Contenido.
 */
async function notifyReportPublished(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { month }   = req.params

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Formato de mes inválido (esperado YYYY-MM)' })
    }

    const report = await prisma.monthlyReport.findFirst({ where: { projectId, workspaceId, month } })
    if (!report) return res.status(404).json({ error: 'Informe no encontrado' })
    if (report.status !== 'published') {
      return res.status(400).json({ error: 'Publicá el informe antes de avisarle al cliente' })
    }

    const portal = await prisma.projectClientPortal.findUnique({ where: { projectId } })
    if (!portal || !portal.active) {
      return res.status(400).json({ error: 'Este proyecto no tiene un portal de cliente activo — configuralo en la pestaña Info' })
    }

    const contacts = await prisma.clientPortalContact.findMany({
      where:  { portalId: portal.id, active: true },
      select: { email: true },
    })
    if (contacts.length === 0) {
      return res.status(400).json({ error: 'No hay contactos activos en el portal — agregá uno en la configuración' })
    }

    const [project, workspace] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { slug: true, name: true, companyName: true } }),
    ])

    const domain    = process.env.APP_DOMAIN || 'blisstracker.app'
    const portalUrl = `https://${workspace.slug}.${domain}/report/${portal.slug}?report=${report.token}`
    const emails    = contacts.map(c => c.email)

    setImmediate(() => {
      sendReportPublishedEmail(emails, {
        projectName:   project?.name || 'Proyecto',
        periodLabel:   reportLabel(report),
        portalUrl,
        workspaceName: workspace?.companyName || workspace?.name,
      }, workspaceId).catch(() => {})
    })

    res.json({ sent: emails.length })
  } catch (err) {
    next(err)
  }
}

/**
 * PATCH /api/marketing/projects/:id/reports/:month/sections
 * Elimina secciones/sub-secciones de un informe ya generado, sin regenerar ni
 * llamar a la IA. Actualiza `enabledSections` y poda el `dataCache` para que las
 * secciones borradas no viajen al link del cliente. body: { remove: [keys] }
 */
async function removeReportSections(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { month }   = req.params

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Formato de mes inválido (esperado YYYY-MM)' })
    }

    const remove = sanitizeSections(req.body?.remove)
    if (!remove || remove.length === 0) {
      return res.status(400).json({ error: 'No se indicaron secciones válidas a eliminar.' })
    }

    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const report = await prisma.monthlyReport.findFirst({ where: { projectId, workspaceId, month } })
    if (!report) return res.status(404).json({ error: 'Informe no encontrado' })

    const isGenerated = report.enabledSections != null || report.dataCache != null || report.analysis != null
    if (!isGenerated) return res.status(400).json({ error: 'El informe todavía no está generado.' })

    // enabledSections null (legacy) = todas → materializamos el catálogo completo antes de restar.
    const current   = report.enabledSections ? safeParseArr(report.enabledSections) : [...SECTION_KEYS]
    const removeSet = new Set(remove)
    const next      = (current || [...SECTION_KEYS]).filter(k => !removeSet.has(k))

    const update = { enabledSections: JSON.stringify(next) }
    // Podar el caché para que la sección no viaje al informe público.
    if (report.dataCache) {
      const dc = safeParseObj(report.dataCache)
      if (dc && dc.sections) {
        for (const k of remove) if (k in dc.sections) dc.sections[k] = null
        // `evolution` es la serie histórica de `analytics`: si se borra analytics, también se va.
        if (removeSet.has('analytics') && 'evolution' in dc.sections) dc.sections.evolution = null
        update.dataCache = JSON.stringify(dc)
      }
    }

    await prisma.monthlyReport.update({ where: { id: report.id }, data: update })

    res.json({ enabledSections: next })
  } catch (err) {
    next(err)
  }
}

module.exports = { setReportStatus, notifyReportPublished, removeReportSections }
