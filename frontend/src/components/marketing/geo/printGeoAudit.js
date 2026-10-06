// ─── Impresión de audit GEO ───────────────────────────────────────────────────

export function printGeoAudit(audit, findings, negativeSignals, projectName) {
  const COMP_LABELS = {
    citability:     'Citabilidad IA',
    brandAuthority: 'Autoridad de Marca',
    eeat:           'E-E-A-T',
    technical:      'Técnico',
    schema:         'Schema Markup',
    platforms:      'Plataformas IA',
  }
  const SEV_LABELS  = { high: 'Alta', medium: 'Media', low: 'Baja' }
  const SEV_COLORS  = { high: '#fee2e2', medium: '#fef9c3', low: '#f0fdf4' }
  const SEV_TEXT    = { high: '#991b1b', medium: '#92400e', low: '#166534' }

  const bandLabel = audit.score >= 86 ? 'Excelente' : audit.score >= 68 ? 'Bueno' : audit.score >= 36 ? 'Base' : 'Crítico'
  const bandColor = audit.score >= 86 ? '#10b981' : audit.score >= 68 ? '#22c55e' : audit.score >= 36 ? '#f59e0b' : '#ef4444'

  const compsHtml = Object.entries(COMP_LABELS).map(([key, label]) => {
    const val = audit[key] ?? '—'
    const c = typeof val === 'number'
      ? (val >= 80 ? '#10b981' : val >= 55 ? '#f59e0b' : '#ef4444')
      : '#9ca3af'
    return `<div class="comp-card">
      <div class="comp-score" style="color:${c}">${val}</div>
      <div class="comp-label">${label}</div>
    </div>`
  }).join('')

  const findingsHtml = findings.map(f => `
    <div class="finding">
      <span class="sev-badge" style="background:${SEV_COLORS[f.severity] ?? '#f9fafb'};color:${SEV_TEXT[f.severity] ?? '#374151'}">${SEV_LABELS[f.severity] ?? f.severity}</span>
      <div class="finding-body">
        <p class="finding-title">${f.title ?? ''}</p>
        ${f.description ? `<p class="finding-desc">${f.description}</p>` : ''}
        ${f.action     ? `<p class="finding-action">→ ${f.action}</p>` : ''}
        ${f.impact     ? `<p class="finding-impact">${f.impact}</p>` : ''}
      </div>
    </div>`).join('')

  const negHtml = negativeSignals.length ? `
    <div class="section-title neg-title">Señales negativas (${negativeSignals.length})</div>
    ${negativeSignals.map(s => `
      <div class="neg-item">
        <p class="neg-name">${s.title ?? ''}</p>
        ${s.description ? `<p class="neg-desc">${s.description}</p>` : ''}
      </div>`).join('')}` : ''

  const date = new Date(audit.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Análisis GEO — ${projectName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;
         color: #111827; background: #fff; padding: 32px 40px; line-height: 1.5; }
  .print-btn { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 28px;
               padding: 8px 16px; background: #111827; color: #fff; border: none;
               border-radius: 8px; font-size: 13px; cursor: pointer; font-family: inherit; }
  .print-btn:hover { background: #1f2937; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
  .header-left h1 { font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 4px; }
  .header-left .url { font-size: 12px; color: #6b7280; margin-bottom: 2px; }
  .header-left .date { font-size: 12px; color: #9ca3af; }
  .score-bubble { text-align: center; min-width: 90px; }
  .score-num { font-size: 40px; font-weight: 800; line-height: 1; color: ${bandColor}; }
  .score-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .band-badge { display: inline-block; margin-top: 6px; padding: 2px 10px; border-radius: 99px;
                background: ${bandColor}22; color: ${bandColor}; font-weight: 600; font-size: 12px; }
  .section-title { font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase;
                   letter-spacing: .05em; margin: 24px 0 12px; }
  .neg-title { color: #b91c1c; }
  .comps-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .comp-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; text-align: center; }
  .comp-score { font-size: 22px; font-weight: 700; }
  .comp-label { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .finding { display: flex; gap: 10px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
  .finding:last-child { border-bottom: none; }
  .sev-badge { flex-shrink: 0; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; white-space: nowrap; }
  .finding-body { flex: 1; }
  .finding-title { font-weight: 600; font-size: 13px; color: #1f2937; }
  .finding-desc { font-size: 12px; color: #6b7280; margin-top: 3px; }
  .finding-action { font-size: 12px; color: #059669; margin-top: 4px; }
  .finding-impact { font-size: 11px; color: #9ca3af; margin-top: 3px; font-style: italic; }
  .neg-item { padding: 8px 0; border-bottom: 1px solid #fef2f2; }
  .neg-item:last-child { border-bottom: none; }
  .neg-name { font-weight: 600; font-size: 13px; color: #991b1b; }
  .neg-desc { font-size: 12px; color: #b91c1c; margin-top: 2px; }
  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb;
            font-size: 11px; color: #9ca3af; text-align: right; }
  @media print {
    body { padding: 20px 28px; }
    .no-print { display: none !important; }
  }
</style></head><body>
  <button class="print-btn no-print" onclick="window.print()">Imprimir / Guardar como PDF</button>
  <div class="header">
    <div class="header-left">
      <h1>${projectName}</h1>
      <p class="url">${audit.url}</p>
      <p class="date">Análisis del ${date}</p>
    </div>
    <div class="score-bubble">
      <div class="score-num">${audit.score}</div>
      <div class="score-sub">/100</div>
      <span class="band-badge">${bandLabel}</span>
    </div>
  </div>
  <div class="section-title">Componentes</div>
  <div class="comps-grid">${compsHtml}</div>
  ${negHtml}
  <div class="section-title">Análisis detallado (${findings.length})</div>
  ${findingsHtml}
  <div class="footer no-print">Generado desde BlissTracker · ${date}</div>
</body></html>`

  const win = window.open('', '_blank', 'width=860,height=750,scrollbars=yes')
  if (!win) return
  win.document.write(html)
  win.document.close()
}
