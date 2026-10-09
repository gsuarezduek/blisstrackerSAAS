const { resend, getEmailFrom, emailShell, logEmail, escHtml } = require('./_shared')
const objectStorage = require('../objectStorage.service')

const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024 // 20MB — límite típico de adjuntos por email

async function streamToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}

/**
 * Envía una o más facturas por mail al cliente (sección 4.5b "Enviar por
 * mail"), con sus adjuntos. Trae cada adjunto de R2 a memoria para pasarlo a
 * Resend — acotado a MAX_TOTAL_ATTACHMENT_BYTES (los adjuntos de factura son
 * livianos, PDFs/imágenes de unas pocas páginas).
 * @param {string} to
 * @param {Array<{number:string, concept:string, amount:string, currency:string, attachments:Array<{name:string, objectKey:string, sizeBytes:number}>}>} invoices
 * @param {{ workspaceId:number, workspaceName:string }} ctx
 */
async function sendInvoicesEmail(to, invoices, { workspaceId, workspaceName }) {
  const from = await getEmailFrom(workspaceId)
  const subject = invoices.length === 1
    ? `Factura ${invoices[0].number} — ${workspaceName}`
    : `${invoices.length} facturas — ${workspaceName}`

  const rowsHtml = invoices.map(inv => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;">${escHtml(inv.number)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;">${escHtml(inv.concept)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;text-align:right;">${escHtml(inv.currency)} ${Number(inv.amount).toLocaleString('es-AR')}</td>
    </tr>`).join('')

  const body = `
    <h2 style="font-size:18px;color:#0f172a;">${invoices.length === 1 ? 'Factura adjunta' : 'Facturas adjuntas'}</h2>
    <table style="width:100%;border-collapse:collapse;margin-top:12px;">
      <thead><tr>
        <th style="text-align:left;font-size:12px;color:#64748b;padding:4px 8px;">N°</th>
        <th style="text-align:left;font-size:12px;color:#64748b;padding:4px 8px;">Concepto</th>
        <th style="text-align:right;font-size:12px;color:#64748b;padding:4px 8px;">Monto</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`

  // Trae los adjuntos a memoria, respetando el tope total.
  const attachments = []
  let totalBytes = 0
  for (const inv of invoices) {
    for (const att of inv.attachments || []) {
      if (totalBytes + (att.sizeBytes || 0) > MAX_TOTAL_ATTACHMENT_BYTES) continue
      try {
        const { body: stream } = await objectStorage.getObjectStream(att.objectKey)
        const buffer = await streamToBuffer(stream)
        attachments.push({ filename: att.name, content: buffer })
        totalBytes += buffer.length
      } catch { /* adjunto faltante/ilegible en R2 — se omite, el resto del mail sigue */ }
    }
  }

  try {
    const { error } = await resend.emails.send({ from, to, subject, html: emailShell(body), attachments })
    if (error) throw new Error(error.message)
    await logEmail({ workspaceId, to, subject, type: 'finance_invoices', status: 'sent' })
    return { ok: true, attachmentsSent: attachments.length }
  } catch (err) {
    await logEmail({ workspaceId, to, subject, type: 'finance_invoices', status: 'failed', errorMsg: err.message })
    throw err
  }
}

module.exports = { sendInvoicesEmail }
