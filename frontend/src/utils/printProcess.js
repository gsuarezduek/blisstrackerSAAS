// Abre una ventana nueva con el proceso formateado para imprimir o exportar a PDF.
// Compartido entre EOS (admin) y Docs (todos los miembros).

function mdToHtml(text) {
  if (!text?.trim()) return ''

  function inlineToHtml(t) {
    return t
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  }

  const lines   = text.split('\n')
  const parts   = []
  let   listBuf = []

  const flushList = () => {
    if (!listBuf.length) return
    parts.push(`<ul>${listBuf.map(l => `<li>${inlineToHtml(l)}</li>`).join('')}</ul>`)
    listBuf = []
  }

  for (const line of lines) {
    if (line.startsWith('- ')) {
      listBuf.push(line.slice(2))
    } else {
      flushList()
      parts.push(line.trim() === '' ? '<br>' : `<p>${inlineToHtml(line)}</p>`)
    }
  }
  flushList()
  return parts.join('\n')
}

const STATUS_LABELS = {
  not_started: 'Sin documentar',
  documented:  'Documentado',
  followed:    'Seguido por todos',
}

export function printProcess(process, roles) {
  const roleLabel = process.ownerRole
    ? (roles.find(r => r.name === process.ownerRole)?.label ?? process.ownerRole)
    : null
  const steps = [...process.steps].sort((a, b) => a.order - b.order)

  const stepsHtml = steps.length === 0
    ? '<p style="color:#888;font-style:italic;margin:0">Sin pasos documentados.</p>'
    : steps.map((s, i) => `
        <div class="step">
          <div class="step-num">${i + 1}</div>
          <div class="step-body">
            <div class="step-title">${s.title}</div>
            ${s.description ? `<div class="step-desc">${mdToHtml(s.description)}</div>` : ''}
          </div>
        </div>`).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${process.name}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
           margin: 0; padding: 48px 56px; color: #111; font-size: 14px; line-height: 1.5; }
    .header { border-bottom: 2px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { margin: 0 0 6px; font-size: 24px; }
    .meta { color: #6b7280; font-size: 13px; display: flex; gap: 16px; flex-wrap: wrap; }
    .badge { display: inline-flex; align-items: center; gap: 5px; font-weight: 500; color: #374151; }
    .description { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;
                   padding: 12px 16px; margin-bottom: 28px; color: #374151; font-size: 13px; }
    .section-title { font-size: 10px; font-weight: 700; letter-spacing: .09em;
                     text-transform: uppercase; color: #9ca3af; margin-bottom: 12px; }
    .step { display: flex; gap: 14px; padding: 12px 0; border-bottom: 1px solid #f3f4f6; }
    .step:last-child { border-bottom: none; }
    .step-num { font-size: 11px; font-weight: 700; color: #d1d5db; width: 22px;
                text-align: right; flex-shrink: 0; padding-top: 2px; }
    .step-title { font-weight: 500; font-size: 14px; color: #111827; }
    .step-desc { margin-top: 5px; font-size: 12px; color: #6b7280; }
    .step-desc p { margin: 2px 0; }
    .step-desc ul { margin: 4px 0; padding-left: 18px; }
    .step-desc li { margin: 2px 0; }
    .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb;
              font-size: 11px; color: #9ca3af; text-align: right; }
    @media print {
      body { padding: 24px 32px; }
      .no-print { display: none !important; }
    }
    .print-btn { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 28px;
                 padding: 8px 16px; background: #111827; color: #fff; border: none;
                 border-radius: 8px; font-size: 13px; cursor: pointer; font-family: inherit; }
    .print-btn:hover { background: #1f2937; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
  <div class="header">
    <h1>${process.name}</h1>
    <div class="meta">
      ${roleLabel ? `<span class="badge">👤 ${roleLabel}</span>` : ''}
      <span class="badge">Estado: ${STATUS_LABELS[process.status] ?? process.status}</span>
      <span class="badge">${steps.length} paso${steps.length !== 1 ? 's' : ''}</span>
    </div>
  </div>
  ${process.description ? `<div class="description">${mdToHtml(process.description)}</div>` : ''}
  <div class="section-title">Pasos del proceso</div>
  ${stepsHtml}
  <div class="footer no-print">Generado desde BlissTracker · ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=820,height=700,scrollbars=yes')
  if (!win) return
  win.document.write(html)
  win.document.close()
}
