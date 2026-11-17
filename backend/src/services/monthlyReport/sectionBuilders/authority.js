const { pct } = require('../_shared')

// ── Autoridad y enlaces ──────────────────────────────────────────────────────
//
// La sección del informe que sale del módulo de Enlaces. Pura y sincrónica, como el
// resto de los builders: recibe el snapshot mensual ya cargado y devuelve el objeto
// que el frontend pinta.
//
// **Qué NO entra acá, y es deliberado:** nada de `BacklinkProspect`. Competencia,
// oportunidades y pipeline son trabajo interno — a quién le vamos a pedir un enlace,
// cuánto estamos dispuestos a pagar y qué descartamos — y publicárselo al cliente
// sería mostrarle la cocina. La garantía se sostiene en que esta función recibe un
// solo argumento de datos y no tiene acceso a nada más; el test de integración del
// informe público la vuelve verificable.
//
// Tampoco entra `reportedDomains` (lo que reportó Ahrefs/Semrush la última vez que
// alguien lo leyó): es un número tipeado a mano que puede tener meses, y un informe
// al cliente no debería cargar un dato cuya procedencia es "alguien lo vio en una
// herramienta". La brecha entre ese valor y nuestro inventario es información
// operativa — vive en la vista de Perfil, para el equipo.
function buildAuthoritySection(snap, prev, flow) {
  if (!snap) return null
  return {
    domainRating:     snap.domainRating    ?? null,
    avgDomainRating:  snap.avgDomainRating ?? null,
    referringDomains: snap.referringDomains ?? 0,
    activeLinks:      snap.activeLinks      ?? 0,
    followLinks:      snap.followLinks      ?? 0,
    // Los de FLUJO se suman a lo largo de los meses que cubre el informe; los de
    // STOCK (arriba) se toman del mes ancla. Mismo criterio que el resto de las
    // secciones.
    newLinks:         flow ? flow.blk.newLinks  : (snap.newLinks  ?? 0),
    lostLinks:        flow ? flow.blk.lostLinks : (snap.lostLinks ?? 0),
    // El delta mes a mes solo tiene sentido en un informe de UN mes; en multi-mes se
    // omite, igual que en analytics y seo.
    delta: (!flow && prev) ? {
      referringDomains: pct(snap.referringDomains ?? 0, prev.referringDomains),
      activeLinks:      pct(snap.activeLinks      ?? 0, prev.activeLinks),
      // El DR se mueve en PUNTOS, no en porcentaje: "subió 3 puntos" es como se lee
      // una escala 0–100. Un +7,3% sobre 41 no le dice nada a nadie.
      domainRating: (snap.domainRating != null && prev.domainRating != null)
        ? parseFloat((snap.domainRating - prev.domainRating).toFixed(1))
        : null,
    } : null,
  }
}

module.exports = { buildAuthoritySection }
