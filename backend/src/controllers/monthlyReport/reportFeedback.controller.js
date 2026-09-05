const prisma = require('../../lib/prisma')
const { sendReportFeedbackEmail } = require('../../services/email.service')
const { getProjectNotifyRecipients } = require('../../lib/projectRecipients')
const { SYSTEM_TYPES, postProjectSystemMessage } = require('../../lib/chatSystemMessage')
const { reportLabel } = require('./_shared')

/**
 * POST /api/public/report/:token/feedback
 * Endpoint PÚBLICO (sin auth). El cliente califica el informe 1–5 + comentario opcional.
 * Solo se acepta feedback de informes publicados.
 */
async function submitReportFeedback(req, res, next) {
  try {
    const { token } = req.params
    const { name, rating, comment } = req.body

    const r = Number(rating)
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      return res.status(400).json({ error: 'Elegí una calificación de 1 a 5 estrellas.' })
    }

    const report = await prisma.monthlyReport.findUnique({
      where:  { token },
      select: { id: true, projectId: true, workspaceId: true, status: true },
    })
    if (!report) return res.status(404).json({ error: 'Informe no encontrado' })
    if (report.status !== 'published') return res.status(404).json({ error: 'Informe no disponible' })

    const cleanName    = (name    ?? '').toString().trim().slice(0, 120)  || null
    const cleanComment = (comment ?? '').toString().trim().slice(0, 2000) || null

    await prisma.reportFeedback.create({
      data: { reportId: report.id, workspaceId: report.workspaceId, name: cleanName, rating: r, comment: cleanComment },
    })

    res.status(201).json({ ok: true })

    // Aviso por email a la agencia (fire-and-forget, no bloquea ni rompe la respuesta)
    setImmediate(() => {
      notifyReportFeedback(report, { name: cleanName, rating: r, comment: cleanComment })
        .catch(err => console.warn('[ReportFeedback] aviso por email fallido (ignorado):', err.message))
    })
  } catch (err) {
    next(err)
  }
}

// Avisa a admins/owners del workspace + miembros del proyecto que un cliente dejó feedback.
async function notifyReportFeedback(report, feedback) {
  const { id: reportId, projectId, workspaceId } = report
  const [fullReport, project, workspace, { emails }] = await Promise.all([
    prisma.monthlyReport.findUnique({ where: { id: reportId }, select: { token: true, month: true, periodStart: true, periodEnd: true } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { slug: true, name: true, companyName: true } }),
    getProjectNotifyRecipients(projectId, workspaceId),
  ])
  if (!fullReport) return

  // Deja constancia en el chat del proyecto aunque no haya nadie a quien avisar por
  // email (workspace/emails vacío) — el resto de la función es solo el aviso por mail.
  const clientLabel = (feedback.name || '').trim() || 'Un cliente'
  const comment = (feedback.comment || '').trim()
  const commentPart = comment ? `: "${comment.length > 140 ? `${comment.slice(0, 137)}…` : comment}"` : ''
  setImmediate(() => {
    postProjectSystemMessage(
      projectId, workspaceId, SYSTEM_TYPES.REPORT_RATED,
      `⭐ ${clientLabel} calificó el informe de ${reportLabel(fullReport)}: ${feedback.rating}/5${commentPart}`
    ).catch(() => {})
  })

  if (!workspace || emails.length === 0) return

  const domain    = process.env.APP_DOMAIN || 'blisstracker.app'
  const reportUrl = `https://${workspace.slug}.${domain}/report/${fullReport.token}`

  await sendReportFeedbackEmail(emails, {
    projectName:   project?.name || 'Proyecto',
    periodLabel:   reportLabel(fullReport),
    reportUrl,
    name:          feedback.name,
    rating:        feedback.rating,
    comment:       feedback.comment,
    workspaceName: workspace.companyName || workspace.name,
  }, workspaceId)
}

module.exports = { submitReportFeedback }
