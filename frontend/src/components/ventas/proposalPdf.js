import api from '../../api/client'

// Escapa texto para inyectarlo seguro en el HTML de impresión.
function esc(s = '') {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

/**
 * Exporta una propuesta a PDF con diseño branded del workspace.
 * Abre una ventana de impresión con una plantilla propia (portada + contenido tipografiado
 * + sección Contacto/firma configurable) y dispara window.print() → guardar como PDF.
 */
export async function exportProposalPdf(proposal, { companyName } = {}) {
  // Branding + firma del workspace.
  let ws = {}
  try { ws = (await api.get('/workspaces/current')).data } catch { /* seguimos sin branding */ }

  const accent = (Array.isArray(ws.brandColors) && ws.brandColors[0]?.hex) || '#F7931A'
  const agency = ws.companyName || ws.name || ''
  const hasLogo = !!ws.logoMimeType
  const logoUrl = hasLogo ? `${import.meta.env.VITE_API_URL}/api/public/logo/${ws.slug}` : ''
  const date = new Date(proposal.createdAt || Date.now()).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
  const title = proposal.title || `Propuesta v${proposal.version || 1}`

  // Firma / sección Contacto: la elegida en la propuesta (signatureId); si nunca se eligió una
  // (propuestas creadas antes de soportar múltiples firmas) se usa la única/primera configurada.
  const allSignatures = Array.isArray(ws.salesSignatures) ? ws.salesSignatures : []
  const sig = allSignatures.find(s => s.id === proposal.signatureId)
    || (proposal.signatureId == null ? allSignatures[0] : null)
    || {}
  const sigHasData = !!(sig.name || sig.email || sig.phone || sig.note || sig.closing || (sig.showLogo && hasLogo))
  const signatureHtml = sigHasData ? `
    <div class="signature">
      <h2>Contacto</h2>
      ${sig.note ? `<p>${esc(sig.note)}</p>` : ''}
      <p class="closing">${esc(sig.closing || 'Atte,')}</p>
      <div class="sig-row">
        ${sig.showLogo && hasLogo ? `<img class="sig-logo" src="${logoUrl}" alt=""/>` : ''}
        <div class="sig-info">
          ${sig.name  ? `<div class="sig-name">${esc(sig.name)}</div>` : ''}
          ${sig.role  ? `<div class="sig-role">${esc(sig.role)}</div>` : ''}
          ${sig.email ? `<div>${esc(sig.email)}</div>` : ''}
          ${sig.phone ? `<div>${esc(sig.phone)}</div>` : ''}
        </div>
      </div>
    </div>` : ''

  const doc = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${esc(title)} — ${esc(companyName || '')}</title>
<style>
  :root { --accent: ${accent}; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1f2937; font-size: 13px; line-height: 1.6; }
  .page { max-width: 820px; margin: 0 auto; padding: 48px 56px; }
  .cover { border-bottom: 3px solid var(--accent); padding-bottom: 20px; margin-bottom: 28px; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
  .cover .logo { max-height: 56px; max-width: 200px; }
  .cover .agency { font-size: 18px; font-weight: 700; color: #111827; }
  .cover .meta { text-align: right; font-size: 12px; color: #6b7280; }
  h1.doc-title { font-size: 26px; font-weight: 800; margin: 0 0 24px; color: #111827; }
  .content h2 { font-size: 17px; font-weight: 700; color: #111827; margin: 28px 0 8px; padding-left: 12px; border-left: 4px solid var(--accent); }
  .content h3 { font-size: 14px; font-weight: 700; margin: 18px 0 6px; color: #374151; }
  .content p { margin: 0 0 10px; }
  .content ul, .content ol { margin: 0 0 12px; padding-left: 20px; }
  .content li { margin-bottom: 4px; }
  .content strong { color: #111827; }
  .content a { color: var(--accent); text-decoration: none; }
  .content table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  .content th, .content td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; vertical-align: top; }
  .content th { font-weight: 700; background-color: #f9fafb; }
  .signature { margin-top: 32px; padding-top: 20px; border-top: 2px solid var(--accent); page-break-inside: avoid; }
  .signature h2 { font-size: 17px; font-weight: 700; color: #111827; margin: 0 0 8px; padding-left: 12px; border-left: 4px solid var(--accent); }
  .signature .closing { margin: 8px 0 8px; }
  .sig-row { display: flex; align-items: center; gap: 16px; }
  .sig-logo { max-height: 52px; max-width: 160px; }
  .sig-name { font-weight: 700; color: #111827; }
  .sig-role { color: #6b7280; font-size: 12px; }
  .sig-info div { line-height: 1.5; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
  @page { margin: 16mm; }
  @media print { .page { padding: 0; max-width: none; } body { font-size: 12px; } }
</style></head>
<body>
  <div class="page">
    <div class="cover">
      <div>${hasLogo ? `<img class="logo" src="${logoUrl}" alt="${esc(agency)}"/>` : (agency ? `<div class="agency">${esc(agency)}</div>` : '')}</div>
      <div class="meta">${companyName ? `Para: ${esc(companyName)}<br>` : ''}${esc(date)}</div>
    </div>
    <h1 class="doc-title">${esc(title)}</h1>
    <div class="content">${proposal.content || '<p>(Sin contenido)</p>'}</div>
    ${signatureHtml}
    <div class="footer">${esc(agency)}${agency ? ' · ' : ''}Documento generado el ${esc(date)}</div>
  </div>
  <script>window.onload = function () { window.focus(); window.print(); }</script>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) { alert('Permití las ventanas emergentes para exportar el PDF.'); return }
  w.document.open()
  w.document.write(doc)
  w.document.close()
}
