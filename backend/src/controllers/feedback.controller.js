const prisma = require('../lib/prisma')
const { sendPlatformNotification, platformCard, escHtml } = require('../services/email.service')

/**
 * Feedback: el canal directo de cualquier usuario de CUALQUIER workspace con el
 * equipo que desarrolla BlissTracker — sugerencias y reportes de error.
 *
 * **No es un buzón del workspace, y eso es a propósito.** El aviso va a la
 * casilla de plataforma (`platformAdminEmail`, SuperAdmin → Configuración) y se
 * lee en SuperAdmin → Feedback. El admin del workspace **no** tiene por dónde
 * leerlo: quien reporta que un módulo está mal configurado, que algo de la app
 * molesta o que una pantalla está rota lo escribe asumiendo que le habla a quien
 * la hace, no a su propia administración. Por eso acá vive solo el alta — había
 * un `GET /api/feedback` + `PUT /:id/read` con `workspaceAdminOnly` (sin UI que
 * los usara) que contradecían eso y se quitaron.
 */
async function create(req, res, next) {
  try {
    const { type, message } = req.body
    if (!type || !message?.trim()) {
      return res.status(400).json({ error: 'Tipo y mensaje requeridos' })
    }
    if (!['SUGGESTION', 'BUG'].includes(type)) {
      return res.status(400).json({ error: 'Tipo inválido' })
    }
    const feedback = await prisma.feedback.create({
      data: {
        userId: req.user.userId,
        workspaceId: req.workspace?.id ?? null,
        type,
        message: message.trim(),
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    })

    // Aviso interno al equipo BlissTracker (no-op si la casilla no está configurada).
    const isBug = type === 'BUG'
    const typeLabel = isBug ? '🐞 Reporte de error' : '💡 Sugerencia'
    // Responder el aviso le contesta DIRECTO a quien lo escribió, igual que el
    // formulario de contacto de la landing. Sin esto el canal es de ida sola: la
    // respuesta volvía a la propia casilla de plataforma. Se limpian los
    // caracteres que romperían el header del mail (el nombre lo elige el usuario).
    const replyName = String(feedback.user.name ?? '').replace(/[<>"\r\n]/g, ' ').trim().slice(0, 160)
    sendPlatformNotification('feedback', {
      workspaceId: req.workspace?.id ?? null,
      subject: `${typeLabel} de ${feedback.user.name} — ${req.workspace?.name ?? 'Sin workspace'}`,
      bodyHtml: platformCard(typeLabel, [
        ['Usuario',   `${escHtml(feedback.user.name)} (${escHtml(feedback.user.email)})`],
        ['Workspace', escHtml(req.workspace?.name) || '—'],
        ['Tipo',      isBug ? 'Bug' : 'Sugerencia'],
        ['Mensaje',   escHtml(feedback.message).replace(/\n/g, '<br>')],
      ], isBug ? '#dc2626' : '#E67A1F'),
      replyTo: `${replyName} <${feedback.user.email}>`,
    })

    res.status(201).json(feedback)
  } catch (err) { next(err) }
}

module.exports = { create }
