// Ids de las secciones de navegación de Marketing (espejo del array NAV de
// frontend/src/components/marketing/marketingNav.js). Fuente única para validar
// Workspace.marketingDisabledSections y para el bucketing de Prioridades
// (marketingPending.service.js).
const MARKETING_SECTION_IDS = ['hoy', 'geo-seo', 'web', 'rrss', 'anuncios', 'mailing', 'informes']

// Secciones ocultas en el código para TODOS los workspaces — espejo de `hidden: true`
// en el NAV del frontend, que es donde se decide qué ve el equipo. Acá se repite
// porque el backend tiene salidas propias que no pasan por la navegación (hoy, el
// aviso semanal por email de Prioridades): sin esto, una sección que nadie puede
// abrir seguiría mandando mails. Al prender o apagar una sección, cambiar LOS DOS
// lugares.
const MARKETING_HIDDEN_SECTIONS = ['hoy']

/**
 * ¿Esta sección de Marketing está fuera de la vista? Oculta en el código (para todos)
 * o apagada por el workspace en Preferencias → Módulos → Marketing. `disabledSections`
 * es el array ya parseado de `Workspace.marketingDisabledSections`.
 */
function isMarketingSectionHidden(sectionId, disabledSections = []) {
  return MARKETING_HIDDEN_SECTIONS.includes(sectionId) || (disabledSections ?? []).includes(sectionId)
}

module.exports = { MARKETING_SECTION_IDS, MARKETING_HIDDEN_SECTIONS, isMarketingSectionHidden }
