// Cruce entre los conflictos detectados en Search Console y el estado REAL de sus URLs.
//
// ── El problema ──────────────────────────────────────────────────────────────
// El análisis mira 30/90/180 días hacia atrás, así que una URL redirigida hace 40 días
// sigue produciendo el conflicto con datos de antes del arreglo. Hasta ahora el sistema
// la recomendaba igual: pedía diferenciar intención, enlazar y eventualmente redirigir
// una URL que ya redirigía. Pedir la página es la única forma de saberlo.
//
// ── Qué NO se hace ───────────────────────────────────────────────────────────
// No se borra nada. Igual que con las resoluciones manuales, el reporte guarda TODOS los
// conflictos detectados y el filtrado se aplica EN LECTURA: así un chequeo que se
// equivocó (un 503 momentáneo, un bloqueo al bot) no esconde un conflicto para siempre, y
// lo que se descartó queda a la vista con el motivo.
//
// Lógica pura: el fetch vive en lib/urlLiveCheck.js y la orquestación en
// services/cannibalization.service.js.

const { liveVerdict } = require('./urlLiveCheck')

/**
 * Anota cada URL de cada conflicto con lo que respondió en vivo, y marca el conflicto
 * completo como `liveFixed` cuando quedan menos de 2 URLs realmente compitiendo.
 *
 * @param {Array}  conflicts — salida de groupConflicts
 * @param {Map}    checks    — url → resultado de checkUrlLive
 * @returns {Array} los mismos conflictos, con `urls[].live` y `live` a nivel conflicto
 */
function annotateConflictsWithLive(conflicts = [], checks = new Map()) {
  return conflicts.map(conflict => {
    const urls = conflict.urls ?? []
    const checked = urls.filter(u => checks.has(u.url))
    if (checked.length === 0) return conflict

    const annotated = urls.map(u => {
      const check = checks.get(u.url)
      if (!check) return u
      const verdict = liveVerdict(check, { otherUrls: urls.filter(o => o.url !== u.url).map(o => o.url) })
      return {
        ...u,
        live: {
          state:  verdict.state,
          fixed:  verdict.fixed,
          note:   verdict.note ?? null,
          target: verdict.target ?? null,
          status: check.status ?? null,
        },
      }
    })

    // Una URL que redirige, que ya no existe o que está noindex no compite por nada.
    const stillCompeting = annotated.filter(u => !u.live?.fixed)
    const main = conflict.recommendation?.mainUrl
    const mainGone = annotated.find(u => u.url === main)?.live?.fixed === true

    let live = null
    if (stillCompeting.length < 2) {
      const reasons = annotated.filter(u => u.live?.fixed).map(u => `${u.url}: ${u.live.note}`)
      live = {
        fixed: true,
        reason: reasons.length
          ? `Ya está resuelto en el sitio — ${reasons.join(' · ')}. Sigue apareciendo en el reporte porque Search Console mira días anteriores al arreglo.`
          : 'Ya no hay dos URLs compitiendo por esta búsqueda.',
      }
    } else if (mainGone) {
      // Caso incómodo pero real: la que el sistema propone como principal es la que
      // redirige. Recomendar consolidar HACIA ella sería mandar a romper el arreglo.
      live = {
        fixed: false,
        warning: `La URL principal sugerida (${main}) ya no responde con contenido propio: revisá hacia dónde consolidar antes de actuar.`,
      }
    }

    return { ...conflict, urls: annotated, ...(live ? { live } : {}) }
  })
}

/**
 * Parte los conflictos en los que siguen pendientes y los que el sitio ya resolvió.
 * Se aplica EN LECTURA, igual que splitByResolution.
 */
function splitByLive(conflicts = []) {
  const pending = []
  const fixedLive = []
  for (const c of conflicts) {
    (c.live?.fixed ? fixedLive : pending).push(c)
  }
  return { pending, fixedLive }
}

/**
 * Las URLs de un conjunto de conflictos, las más severas primero y sin repetir — el orden
 * con el que se gasta el presupuesto de chequeos.
 */
function urlsToCheck(conflicts = [], limit = 40) {
  const out = []
  const seen = new Set()
  for (const c of conflicts) {
    for (const u of c.urls ?? []) {
      if (seen.has(u.url)) continue
      seen.add(u.url)
      out.push(u.url)
      if (out.length >= limit) return out
    }
  }
  return out
}

/**
 * Verifica los hallazgos de hreflang contra las etiquetas reales de las páginas.
 *
 * El hallazgo se emitía sin haber pedido una sola página: decía "revisar el emparejamiento
 * hreflang" mirando solo datos de Search Console, y por eso marcaba problemas en sitios
 * donde las etiquetas estaban bien puestas. Ahora:
 *   - etiquetas correctas y recíprocas → NO es un hallazgo (sale de la lista, se cuenta
 *     aparte como "revisado y está bien")
 *   - etiquetas mal o faltantes → sigue siendo un hallazgo, con el detalle de qué falta
 *   - no se pudieron leer las páginas → se mantiene, marcado como sin verificar
 *
 * @param {Array} issues — salida de groupConflicts.hreflangIssues
 * @param {Map}   checks — url → resultado de checkUrlLive
 * @param {Function} verdictFn — inyectable para test (default: hreflangVerdict)
 */
function verifyHreflangIssues(issues = [], checks = new Map(), verdictFn = require('./urlLiveCheck').hreflangVerdict) {
  const confirmed = []
  let okCount = 0

  for (const issue of issues) {
    const pages = (issue.urls ?? []).map(u => ({
      url: u.url, language: u.language, check: checks.get(u.url) ?? null,
    }))
    const verdict = verdictFn(pages)

    if (verdict.checked && verdict.ok) { okCount++; continue }

    confirmed.push({
      ...issue,
      verified: verdict.checked,
      problems: verdict.problems ?? [],
      // `notes` son observaciones que NO son errores (ej. declara el idioma pero hacia
      // otra URL: no son par de traducción) y `skipped`, las páginas que no se le exigen
      // porque canonicalizan a otra. Van aparte a propósito: meterlas entre los problemas
      // fue el falso positivo reportado.
      notes:   verdict.notes ?? [],
      skipped: verdict.skipped ?? [],
      suggestion: verdict.checked
        ? `Las etiquetas hreflang de estas URLs tienen problemas reales: ${(verdict.problems ?? []).map(p => `${p.url} → ${p.detail}`).join(' · ')}`
        : `${verdict.note ?? 'No se pudieron leer las etiquetas hreflang de estas páginas en vivo'}. Revisalas a mano antes de tocar nada.`,
    })
  }

  return { hreflangIssues: confirmed, hreflangOkCount: okCount }
}

module.exports = { annotateConflictsWithLive, splitByLive, urlsToCheck, verifyHreflangIssues }
