// Sincroniza los nombres de servicio entre el bloque `services` del documento y `Proposal.plans`.
// El renderer (proposalDocHtml.js) toma la lista de servicios y la tabla de inversión de los
// PLANES y busca el texto de cada uno en el doc por nombre: si se renombra un servicio solo en el
// editor de bloques, deja de matchear y la vista previa sigue mostrando el nombre del plan.

const key = s => String(s || '').trim().toLowerCase()

function planServiceKeys(plans) {
  const keys = []
  ;(plans || []).forEach(p => (p.services || []).forEach(s => {
    const k = key(s.name)
    if (k && !keys.includes(k)) keys.push(k)
  }))
  return keys
}

// Por cada bloque (null si no es `services`), la clave del servicio de los planes al que
// corresponde cada item: primero por nombre exacto; los que no matchean se emparejan por orden
// con los servicios de los planes que quedaron libres, solo si sobran la misma cantidad de cada lado.
export function linkServiceItems(doc, plans) {
  const keys = planServiceKeys(plans)
  return (doc?.blocks || []).map(b => {
    if (b.type !== 'services') return null
    const links = (b.items || []).map(it => (keys.includes(key(it.name)) ? key(it.name) : null))
    const used = new Set(links.filter(Boolean))
    const freeKeys = keys.filter(k => !used.has(k))
    const freeIdx = links.flatMap((l, i) => (l ? [] : [i]))
    if (freeIdx.length && freeIdx.length === freeKeys.length) freeIdx.forEach((i, n) => { links[i] = freeKeys[n] })
    return links
  })
}

function renamePlanService(plans, fromKey, name) {
  return plans.map(p => ({ ...p, services: (p.services || []).map(s => (key(s.name) === fromKey ? { ...s, name } : s)) }))
}

// Al editar el nombre de un servicio en el editor de bloques, lo renombra también en los planes.
// Un nombre vacío no se propaga (el item queda emparejado por orden y el siguiente tecleo sí).
export function syncServiceRenames(prevDoc, nextDoc, plans) {
  const prevBlocks = prevDoc?.blocks || []
  const nextBlocks = nextDoc?.blocks || []
  if (prevBlocks.length !== nextBlocks.length) return plans
  const links = linkServiceItems(prevDoc, plans)
  let out = plans
  nextBlocks.forEach((b, bi) => {
    const prev = prevBlocks[bi]
    if (b.type !== 'services' || prev?.type !== 'services' || !links[bi]) return
    const prevItems = prev.items || []
    const items = b.items || []
    if (prevItems.length !== items.length) return
    items.forEach((it, ii) => {
      const name = String(it.name || '').trim()
      if (!name || it.name === prevItems[ii].name || !links[bi][ii]) return
      out = renamePlanService(out, links[bi][ii], name)
    })
  })
  return out
}

// Al abrir una propuesta ya guardada: si algún servicio quedó renombrado solo en el doc (antes de
// que existiera la sincronización), le pone ese nombre también al plan.
export function reconcileServiceNames(doc, plans) {
  const links = linkServiceItems(doc, plans)
  let out = plans
  ;(doc?.blocks || []).forEach((b, bi) => (links[bi] || []).forEach((k, ii) => {
    const name = String(b.items[ii].name || '').trim()
    if (k && name && key(name) !== k) out = renamePlanService(out, k, name)
  }))
  return out
}
