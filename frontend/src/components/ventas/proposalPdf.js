import api from '../../api/client'

// Escapa texto para inyectarlo seguro en el HTML de impresión.
function esc(s = '') {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

/**
 * Exporta una propuesta a PDF con diseño branded del workspace.
 * Abre una ventana de impresión con una plantilla propia (portada + contenido tipografiado)
 * y dispara window.print() → el usuario guarda como PDF (mismo patrón que los informes).
 */
export async function exportProposalPdf(proposal, { companyName } = {}) {
  // Branding del workspace (logo, colores, nombre de la agencia).
  let ws = {}
  try { ws = (await api.get('/workspaces/current')).data } catch { /* seguimos sin branding */ }

  const accent = (Array.isArray(ws.brandColors) && ws.brandColors[0]?.hex) || '#F7931A'
  const agency = ws.companyName || ws.name || 'Propuesta comercial'
  const hasLogo = !!ws.logoMimeType
  const logoUrl = hasLogo ? `${import.meta.env.VITE_API_URL}/api/public/logo/${ws.slug}` : ''
  const date = new Date(proposal.createdAt || Date.now()).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
  const title = proposal.title || `Propuesta v${proposal.version || 1}`

  const doc = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${esc(title)} — ${esc(companyName || '')}</title>
<style>
  :root { --accent: ${accent}; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1f2937; font-size: 13px; line-height: 1.6; }
  .page { max-width: 820px; margin: 0 auto; padding: 48px 56px; }
  .cover { border-bottom: 3px solid var(--accent); padding-bottom: 20px; margin-bottom: 32px; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
  .cover .logo { max-height: 56px; max-width: 200px; }
  .cover .agency { font-size: 18px; font-weight: 700; color: #111827; }
  .cover .meta { text-align: right; font-size: 12px; color: #6b7280; }
  .cover .meta strong { display: block; color: #111827; font-size: 15px; margin-bottom: 2px; }
  h1.doc-title { font-size: 26px; font-weight: 800; margin: 0 0 4px; color: #111827; }
  .subtitle { color: #6b7280; margin: 0 0 28px; font-size: 13px; }
  .content h2 { font-size: 17px; font-weight: 700; color: #111827; margin: 28px 0 8px; padding-left: 12px; border-left: 4px solid var(--accent); }
  .content h3 { font-size: 14px; font-weight: 700; margin: 18px 0 6px; color: #374151; }
  .content p { margin: 0 0 10px; }
  .content ul, .content ol { margin: 0 0 12px; padding-left: 20px; }
  .content li { margin-bottom: 4px; }
  .content strong { color: #111827; }
  .content a { color: var(--accent); text-decoration: none; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
  @page { margin: 16mm; }
  @media print { .page { padding: 0; max-width: none; } body { font-size: 12px; } }
</style></head>
<body>
  <div class="page">
    <div class="cover">
      <div>${hasLogo ? `<img class="logo" src="${logoUrl}" alt="${esc(agency)}"/>` : `<div class="agency">${esc(agency)}</div>`}</div>
      <div class="meta"><strong>Propuesta comercial</strong>${companyName ? `Para: ${esc(companyName)}<br>` : ''}${esc(date)}</div>
    </div>
    <h1 class="doc-title">${esc(title)}</h1>
    <p class="subtitle">Preparada por ${esc(agency)}${companyName ? ` para ${esc(companyName)}` : ''}</p>
    <div class="content">${proposal.content || '<p>(Sin contenido)</p>'}</div>
    <div class="footer">${esc(agency)} · Documento generado el ${esc(date)}</div>
  </div>
  <script>window.onload = function () { window.focus(); window.print(); }</script>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) { alert('Permití las ventanas emergentes para exportar el PDF.'); return }
  w.document.open()
  w.document.write(doc)
  w.document.close()
}
