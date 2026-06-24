// Catálogo de tipos de briefs por proyecto.
// El backend solo necesita validar el `type`; las preguntas/campos viven en el
// espejo del frontend (frontend/src/components/briefs/briefCatalog.js) para el render.
// El Brief de Marca ("marca") es el documento madre; el resto son específicos por servicio.
// "memoria" es un espacio de notas libres del cliente, va primero (antes de Marca).

const BRIEF_TYPES = ['memoria', 'marca', 'organico', 'meta_ads', 'web', 'seo_sem', 'crm']

function isValidBriefType(type) {
  return BRIEF_TYPES.includes(type)
}

module.exports = { BRIEF_TYPES, isValidBriefType }
