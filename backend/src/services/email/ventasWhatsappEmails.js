const { resend, getEmailFrom, emailShell, logEmail } = require('./_shared')

// Recordatorio diario de Ventas: próximas acciones para hoy + vencidas del responsable.
async function sendSalesReminderEmail(email, { name, workspaceName, today = [], overdue = [], appUrl, tz = 'America/Argentina/Buenos_Aires' }, workspaceId) {
  const from = await getEmailFrom(workspaceId)
  const nT = today.length, nO = overdue.length
  const subjectParts = []
  if (nO > 0) subjectParts.push(`${nO} vencida${nO === 1 ? '' : 's'}`)
  if (nT > 0) subjectParts.push(`${nT} para hoy`)
  const subject = `🔔 Ventas: ${subjectParts.join(' · ')}`

  const item = (l, overdueRow) => `
    <tr>
      <td style="padding:9px 0;border-top:1px solid #f1f5f9;">
        <a href="${appUrl}?lead=${l.id}" style="color:#1e293b;font-size:14px;font-weight:600;text-decoration:none;">${l.company}</a>
        <br><span style="color:#64748b;font-size:13px;">${l.actionTitle || 'Próxima acción'}</span>
      </td>
      <td style="padding:9px 0;border-top:1px solid #f1f5f9;text-align:right;white-space:nowrap;vertical-align:top;">
        <span style="color:${overdueRow ? '#dc2626' : '#64748b'};font-size:12px;">${l.due}</span>
      </td>
    </tr>`

  const section = (title, rows, color) => rows.length ? `
    <p style="color:${color};font-size:13px;font-weight:600;margin:18px 0 4px;">${title}</p>
    <table style="width:100%;border-collapse:collapse;">${rows.join('')}</table>` : ''

  const inner = `
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
      <h2 style="color:#1e293b;margin:0 0 6px;font-size:20px;">🔔 Tus seguimientos de hoy</h2>
      <p style="color:#475569;margin:0 0 8px;font-size:14px;">Hola ${name || ''}, esto es lo que tenés pendiente en <strong>${workspaceName}</strong>.</p>
      ${section('⚠️ Vencidas', overdue.map(l => item(l, true)), '#dc2626')}
      ${section('📅 Para hoy', today.map(l => item(l, false)), '#0f766e')}
      <div style="text-align:center;margin-top:24px;">
        <a href="${appUrl}" style="display:inline-block;background:#F7931A;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 22px;border-radius:8px;">Ver mis leads</a>
      </div>
    </div>`

  try {
    const { error } = await resend.emails.send({ from, to: email, subject, html: emailShell(inner) })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: email, subject, type: 'salesReminder', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: email, subject, type: 'salesReminder', status: 'failed', errorMsg: err.message })
    throw err
  }
}

// Aviso de "juego de Gamification finalizado" a todo el equipo (con el ganador).
async function sendGameFinishedEmail(emails, workspaceName, game, winner, appUrl, workspaceId) {
  const from = await getEmailFrom(workspaceId)
  const subject = winner
    ? `🏆 ${game.title} — ganó ${winner.label}`
    : `🏁 ${game.title} — finalizó`

  const winnerBlock = winner
    ? `
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:18px 20px;margin:0 0 18px;text-align:center;">
          <p style="margin:0 0 4px;color:#92400e;font-size:13px;font-weight:600;">🏆 GANADOR</p>
          <p style="margin:0;color:#1e293b;font-size:20px;font-weight:700;">${winner.label}</p>
          <p style="margin:4px 0 0;color:#b45309;font-size:13px;">${winner.score} ${game.scoring === 'vote' ? 'votos' : 'puntos'}</p>
        </div>`
    : `<p style="color:#475569;margin:0 0 18px;font-size:14px;">El desafío finalizó sin un ganador con puntaje.</p>`

  const prizeBlock = game.prize
    ? `<p style="color:#475569;margin:0 0 18px;font-size:14px;">🎁 Premio: <strong>${game.prize}</strong></p>`
    : ''

  const inner = `
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;margin-top:8px;">
      <h2 style="color:#1e293b;margin:0 0 6px;font-size:20px;">🏆 ${game.title}</h2>
      <p style="color:#94a3b8;font-size:13px;margin:0 0 18px;">${workspaceName}</p>
      ${winnerBlock}
      ${prizeBlock}
      <div style="text-align:center;margin-top:8px;">
        <a href="${appUrl || ''}" style="display:inline-block;background:#F7931A;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 22px;border-radius:8px;">Ver resultados</a>
      </div>
    </div>`

  try {
    const { error } = await resend.emails.send({ from, to: emails, subject, html: emailShell(inner) })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'gameFinished', status: 'sent' })
  } catch (err) {
    await logEmail({ workspaceId, to: emails.join(','), subject, type: 'gameFinished', status: 'failed', errorMsg: err.message })
    throw err
  }
}

module.exports = { sendSalesReminderEmail, sendGameFinishedEmail }
