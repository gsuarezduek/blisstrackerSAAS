// ═══════════════════════════════════════════════════════════════════════════════
// Organigrama de Rendición de Cuentas — helpers puros
// ═══════════════════════════════════════════════════════════════════════════════

export function printAccountabilityChart(nodes, members) {
  function personName(userId) {
    if (!userId) return null
    const m = members.find(m => m.id === userId)
    return m ? m.name : null
  }

  // Genera HTML recursivo para el árbol (DFS)
  function renderNode(node, depth) {
    const person = personName(node.userId)
    const accs   = node.accountabilities ?? []
    const children = nodes.filter(n => n.parentId === node.id).sort((a, b) => a.order - b.order)

    const childrenHtml = children.length
      ? `<div class="children">${children.map(c => renderNode(c, depth + 1)).join('')}</div>`
      : ''

    return `
      <div class="node depth-${depth}">
        <div class="card">
          <div class="seat">${node.seat}</div>
          ${person ? `<div class="person">${person}</div>` : '<div class="person unassigned">Sin asignar</div>'}
          ${accs.length ? `<ul class="accs">${accs.map(a => `<li>${a}</li>`).join('')}</ul>` : ''}
        </div>
        ${childrenHtml}
      </div>`
  }

  const rootNodes = nodes.filter(n => n.parentId === null).sort((a, b) => a.order - b.order)
  const treeHtml  = rootNodes.map(r => renderNode(r, 0)).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Organigrama de Rendición de Cuentas</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', system-ui, sans-serif; font-size: 13px; color: #111827;
           padding: 32px 40px; background: #fff; }
    h1 { font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 2px; }
    .subtitle { font-size: 12px; color: #6b7280; margin-bottom: 28px; }
    .print-btn { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 24px;
                 padding: 8px 16px; background: #111827; color: #fff; border: none;
                 border-radius: 8px; font-size: 13px; cursor: pointer; font-family: inherit; }
    .print-btn:hover { background: #1f2937; }
    /* Árbol */
    .node { display: flex; flex-direction: column; }
    .children { margin-left: 28px; padding-left: 16px;
                border-left: 2px solid #d1d5db; margin-top: 12px; }
    .children .node { margin-top: 12px; }
    .children .node:first-child { margin-top: 0; }
    .card { border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 10px 14px;
            background: #fff; max-width: 360px; page-break-inside: avoid; }
    .depth-0 .card { border-color: #f97316; border-width: 2px; }
    .depth-1 .card { border-color: #6b7280; }
    .seat { font-weight: 700; font-size: 14px; color: #111827; margin-bottom: 3px; }
    .person { font-size: 12px; color: #6b7280; margin-bottom: 6px; }
    .person.unassigned { font-style: italic; color: #9ca3af; }
    .accs { list-style: none; border-top: 1px solid #f3f4f6; padding-top: 6px; }
    .accs li { font-size: 11px; color: #4b5563; padding: 2px 0 2px 12px; position: relative; }
    .accs li::before { content: '·'; position: absolute; left: 0; color: #9ca3af; }
    .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb;
              font-size: 11px; color: #9ca3af; text-align: right; }
    @media print {
      body { padding: 20px 28px; }
      .print-btn { display: none !important; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Imprimir / Guardar como PDF</button>
  <h1>Organigrama de Rendición de Cuentas</h1>
  <p class="subtitle">Generado desde BlissTracker · ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
  ${treeHtml || '<p style="color:#9ca3af;font-style:italic">El organigrama está vacío.</p>'}
  <div class="footer">BlissTracker EOS · Accountability Chart</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=820,height=700,scrollbars=yes')
  if (win) { win.document.write(html); win.document.close() }
}

// Devuelve el Set de IDs del nodo y todos sus descendientes
export function getDescendantIds(nodes, nodeId) {
  const ids = new Set([nodeId])
  const queue = [nodeId]
  while (queue.length) {
    const curr = queue.shift()
    nodes.filter(n => n.parentId === curr).forEach(child => {
      ids.add(child.id)
      queue.push(child.id)
    })
  }
  return ids
}

// Construye una lista ordenada (BFS) para el dropdown de "Reporta a"
export function buildParentOptions(nodes, excludeIds = new Set()) {
  const result = []
  function visit(parentId, depth) {
    nodes
      .filter(n => n.parentId === parentId)
      .sort((a, b) => a.order - b.order)
      .forEach(n => {
        if (!excludeIds.has(n.id)) {
          result.push({ node: n, depth })
          visit(n.id, depth + 1)
        }
      })
  }
  visit(null, 0)
  return result
}
