import DOMPurify from 'dompurify'
import { isHtml, formatDateLabel } from './visionHelpers'

// ─── VTO Print ───────────────────────────────────────────────────────────────

export function printVTO(data, workspaceName, rocks, members, issues, quarter) {
  function ownerName(ownerId) {
    const m = members.find(m => m.id === ownerId)
    return m ? m.name.split(' ')[0] : ''
  }

  function listHtml(items, empty = 'No definido') {
    if (!items || items.length === 0) return `<span class="empty">${empty}</span>`
    return `<ul>${items.map(i => `<li>${typeof i === 'string' ? i : i?.name ?? ''}</li>`).join('')}</ul>`
  }

  function coreValuesHtml(items, empty = 'Sin valores definidos') {
    if (!items || items.length === 0) return `<span class="empty">${empty}</span>`
    return `<ul>${items.map(v => {
      const name = typeof v === 'string' ? v : v?.name ?? ''
      const desc = typeof v === 'object' && v?.description ? v.description : ''
      return `<li><strong>${name}</strong>${desc ? `<div style="font-size:9px;color:#6b7280;margin-top:1px">${desc}</div>` : ''}</li>`
    }).join('')}</ul>`
  }

  function textHtml(value, empty = 'No definido') {
    if (!value?.trim()) return `<span class="empty">${empty}</span>`
    if (isHtml(value)) return DOMPurify.sanitize(value)
    return `<p>${value.replace(/\n/g, '<br>')}</p>`
  }

  function quarterLabel(q) {
    if (!q) return ''
    const [year, qPart] = q.split('-')
    return `${qPart} ${year}`
  }

  const activeRocks = (rocks ?? []).filter(r => r.status !== 'complete')
  const openIssues  = (issues ?? []).slice(0, 8)

  const rocksHtml = activeRocks.length
    ? `<ul class="rocks-list">${activeRocks.map(r => {
        const dot = r.status === 'on_track' ? '#22c55e' : r.status === 'off_track' ? '#ef4444' : '#9ca3af'
        return `<li><span class="dot" style="background:${dot}"></span><span class="rock-title">${r.title}</span>${r.ownerId ? `<span class="rock-owner">${ownerName(r.ownerId)}</span>` : ''}</li>`
      }).join('')}</ul>`
    : `<span class="empty">Sin rocas para este trimestre</span>`

  const issuesHtml = openIssues.length
    ? `<ul>${openIssues.map(i => {
        const color = i.priority === 'high' ? '#ef4444' : i.priority === 'medium' ? '#f59e0b' : '#9ca3af'
        return `<li style="display:flex;gap:6px;align-items:flex-start"><span style="color:${color};font-size:9px;margin-top:2px">●</span><span>${i.title}</span></li>`
      }).join('')}</ul>`
    : `<span class="empty">Sin issues abiertos</span>`

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>VTO — ${workspaceName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', system-ui, sans-serif; font-size: 11px; color: #111827;
           padding: 24px 32px; background: #fff; }
    h1 { font-size: 18px; font-weight: 700; color: #111827; margin-bottom: 2px; }
    .subtitle { font-size: 11px; color: #6b7280; margin-bottom: 20px; }
    .print-btn { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 18px;
                 padding: 7px 14px; background: #111827; color: #fff; border: none;
                 border-radius: 8px; font-size: 12px; cursor: pointer; font-family: inherit; }
    .print-btn:hover { background: #1f2937; }
    /* Grid */
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .col { display: flex; flex-direction: column; gap: 12px; }
    .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    /* Caja */
    .box { border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; page-break-inside: avoid; }
    .box-header { padding: 5px 10px; font-size: 9px; font-weight: 700; text-transform: uppercase;
                  letter-spacing: .08em; }
    .box-header.blue { background: #1d4ed8; color: #fff; }
    .box-header.gray { background: #374151; color: #fff; }
    .box-body { padding: 8px 10px; min-height: 50px; }
    .box-sub { font-size: 9px; font-weight: 600; color: #6b7280; text-transform: uppercase;
               letter-spacing: .05em; margin-bottom: 3px; margin-top: 8px; }
    .box-sub:first-child { margin-top: 0; }
    ul { list-style: none; padding: 0; }
    ul li { padding: 2px 0 2px 12px; position: relative; font-size: 11px; color: #374151; }
    ul li::before { content: '·'; position: absolute; left: 0; color: #9ca3af; }
    p { font-size: 11px; color: #374151; line-height: 1.5; }
    .empty { font-style: italic; color: #9ca3af; font-size: 11px; }
    .metrics { display: flex; gap: 16px; font-size: 11px; padding-bottom: 6px;
               border-bottom: 1px solid #f3f4f6; margin-bottom: 6px; flex-wrap: wrap; }
    .metrics span .label { color: #9ca3af; }
    /* Rocks */
    .rocks-list li { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
    .rocks-list li::before { display: none; }
    .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .rock-title { flex: 1; }
    .rock-owner { color: #9ca3af; font-size: 10px; }
    .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e5e7eb;
              font-size: 10px; color: #9ca3af; text-align: right; }
    @media print {
      body { padding: 16px 24px; }
      .print-btn { display: none !important; }
      .grid { gap: 8px; }
      .col { gap: 8px; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
  <h1>Vision/Traction Organizer™</h1>
  <p class="subtitle">${workspaceName} · ${new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long' })}</p>

  <div class="grid">
    <!-- Columna izquierda -->
    <div class="col">
      <div class="row-2">
        <div class="box">
          <div class="box-header blue">Core Values</div>
          <div class="box-body">${coreValuesHtml(data?.coreValues, 'Sin valores definidos')}</div>
        </div>
        <div class="box">
          <div class="box-header blue">Core Focus™</div>
          <div class="box-body">
            <div class="box-sub">Propósito</div>
            ${textHtml(data?.purpose, 'Sin definir')}
            <div class="box-sub">Nicho</div>
            ${textHtml(data?.niche, 'Sin definir')}
          </div>
        </div>
      </div>

      <div class="box">
        <div class="box-header blue">Imagen a 3 Años™</div>
        <div class="box-body">
          ${(data?.threeYearRevenue || data?.threeYearProfit || data?.threeYearHeadcount) ? `
          <div class="metrics">
            ${data?.threeYearRevenue   ? `<span><span class="label">Ingresos: </span>${data.threeYearRevenue}</span>` : ''}
            ${data?.threeYearProfit    ? `<span><span class="label">Rentabilidad: </span>${data.threeYearProfit}</span>` : ''}
            ${data?.threeYearHeadcount ? `<span><span class="label">Equipo: </span>${data.threeYearHeadcount}</span>` : ''}
          </div>` : ''}
          ${textHtml(data?.threeYearDescription, 'Sin descripción')}
          ${data?.threeYearGoals?.length ? listHtml(data.threeYearGoals) : ''}
        </div>
      </div>

      <div class="box">
        <div class="box-header blue">Plan a 1 Año</div>
        <div class="box-body">
          ${(data?.oneYearDate || data?.oneYearRevenue || data?.oneYearProfit) ? `
          <div class="metrics">
            ${data?.oneYearDate    ? `<span><span class="label">Fecha: </span>${formatDateLabel(data.oneYearDate)}</span>` : ''}
            ${data?.oneYearRevenue ? `<span><span class="label">Ingresos: </span>${data.oneYearRevenue}</span>` : ''}
            ${data?.oneYearProfit  ? `<span><span class="label">Rentabilidad: </span>${data.oneYearProfit}</span>` : ''}
          </div>` : ''}
          ${listHtml(data?.oneYearGoals, 'Sin metas anuales')}
        </div>
      </div>
    </div>

    <!-- Columna derecha -->
    <div class="col">
      <div class="box">
        <div class="box-header gray">Meta a 10 Años™</div>
        <div class="box-body" style="min-height:80px">${textHtml(data?.tenYearTarget, 'Sin meta a 10 años')}</div>
      </div>

      <div class="box">
        <div class="box-header gray">Estrategia de Marketing</div>
        <div class="box-body">
          <div class="box-sub">Cliente Ideal</div>
          ${textHtml(data?.marketingTarget, 'Sin definir')}
          <div class="box-sub">3 Diferenciadores</div>
          ${listHtml(data?.marketingUniques, 'Sin diferenciadores')}
          ${data?.marketingProcess ? `<div class="box-sub">Proceso Probado</div>${textHtml(data.marketingProcess)}` : ''}
          ${data?.marketingGuarantee ? `<div class="box-sub">Garantía</div>${textHtml(data.marketingGuarantee)}` : ''}
        </div>
      </div>

      <div class="box">
        <div class="box-header gray">Rocas · ${quarterLabel(quarter)}</div>
        <div class="box-body">${rocksHtml}</div>
      </div>

      <div class="box">
        <div class="box-header gray">Asuntos</div>
        <div class="box-body">${issuesHtml}</div>
      </div>
    </div>
  </div>

  <div class="footer">BlissTracker EOS · Vision/Traction Organizer™</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=750,scrollbars=yes')
  if (win) { win.document.write(html); win.document.close() }
}
