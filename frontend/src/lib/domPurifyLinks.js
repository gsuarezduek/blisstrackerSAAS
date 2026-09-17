import DOMPurify from 'dompurify'

// Efecto global (DOMPurify es un singleton): cualquier `<a>` que sobreviva al
// sanitize de un componente de la app abre en pestaña nueva. Evita tener que
// tocar cada uno de los ~15 call sites de `DOMPurify.sanitize(...)` (situación
// de proyecto, notas de reunión, briefs, análisis de informes, EOS Visión,
// propuestas, blog, etc.) y cubre los que se agreguen a futuro.
DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})
