// Esquema de los bloques de Proposal.doc para el editor (ProposalDocEditor.jsx).
// Espejo de backend/src/lib/proposalDoc.js: si se agrega un bloque o campo, actualizar los dos.
//
// kinds de campo: 'text' (input), 'area' (textarea), 'textlist' (lista de textos),
// 'items' (lista de objetos con `itemFields`), 'select' (`options`), 'number'.

const f = (key, label, kind = 'text', extra = {}) => ({ key, label, kind, ...extra })

export const BLOCK_SPECS = {
  text: {
    label: 'Texto', icon: '¶',
    fields: [f('heading', 'Título de sección'), f('subheading', 'Subtítulo'), f('paragraphs', 'Párrafos', 'textlist')],
    blank: () => ({ type: 'text', heading: '', subheading: '', paragraphs: [''] }),
  },
  callout: {
    label: 'Recuadro destacado', icon: '❝',
    fields: [f('heading', 'Título de sección'), f('label', 'Etiqueta (negrita)'), f('text', 'Texto', 'area')],
    blank: () => ({ type: 'callout', heading: '', label: '', text: '' }),
  },
  before_after: {
    label: 'Antes → Después', icon: '⇄',
    fields: [f('heading', 'Título de sección'), f('fromLabel', 'Etiqueta "antes"'), f('from', 'Antes'), f('toLabel', 'Etiqueta "después"'), f('to', 'Después'), f('note', 'Nota', 'area')],
    blank: () => ({ type: 'before_after', heading: '', fromLabel: 'Hoy', from: '', toLabel: 'Hacia dónde vamos', to: '', note: '' }),
  },
  cards: {
    label: 'Tarjetas', icon: '▦',
    fields: [
      f('heading', 'Título de sección'), f('subheading', 'Subtítulo'), f('intro', 'Introducción', 'area'),
      f('variant', 'Estilo', 'select', { options: [['plain', 'Simple'], ['funnel', 'Embudo (color de marca)']] }),
      f('columns', 'Columnas (2-4)', 'number'),
      f('items', 'Tarjetas', 'items', { itemLabel: 'Tarjeta', itemFields: [f('tag', 'Etiqueta (ej. 01)'), f('title', 'Título'), f('text', 'Texto', 'area')], blankItem: () => ({ tag: '', title: '', text: '' }) }),
      f('outro', 'Cierre', 'area'),
    ],
    blank: () => ({ type: 'cards', heading: '', subheading: '', intro: '', variant: 'plain', columns: 3, items: [{ tag: '', title: '', text: '' }], outro: '' }),
  },
  bars: {
    label: 'Barras de porcentaje', icon: '▬',
    fields: [
      f('heading', 'Título de sección'), f('intro', 'Introducción', 'area'),
      f('items', 'Barras', 'items', { itemLabel: 'Barra', itemFields: [f('label', 'Etiqueta'), f('value', 'Valor (0-100)', 'number')], blankItem: () => ({ label: '', value: 0 }) }),
      f('outro', 'Cierre', 'area'),
    ],
    blank: () => ({ type: 'bars', heading: '', intro: '', items: [{ label: '', value: 0 }], outro: '' }),
  },
  pills: {
    label: 'Etiquetas', icon: '◖◗',
    fields: [f('heading', 'Título de sección'), f('subheading', 'Subtítulo'), f('intro', 'Introducción', 'area'), f('items', 'Etiquetas', 'textlist')],
    blank: () => ({ type: 'pills', heading: '', subheading: '', intro: '', items: [''] }),
  },
  steps: {
    label: 'Pasos', icon: '①',
    fields: [
      f('heading', 'Título de sección'), f('intro', 'Introducción', 'area'),
      f('variant', 'Estilo', 'select', { options: [['numbered', 'Lista numerada'], ['timeline', 'Línea de tiempo (horizontal)']] }),
      f('items', 'Pasos', 'items', { itemLabel: 'Paso', itemFields: [f('title', 'Título'), f('text', 'Texto', 'area')], blankItem: () => ({ title: '', text: '' }) }),
      f('outro', 'Cierre', 'area'),
    ],
    blank: () => ({ type: 'steps', heading: '', intro: '', variant: 'numbered', items: [{ title: '', text: '' }], outro: '' }),
  },
  services: {
    label: 'Servicios', icon: '🛠',
    hint: 'Los servicios y la etiqueta de qué planes los incluyen salen de los planes. Acá editás el texto de cada uno.',
    fields: [
      f('heading', 'Título de sección'), f('intro', 'Introducción', 'area'),
      f('items', 'Servicios', 'items', { itemLabel: 'Servicio', fixedItems: true, itemFields: [f('name', 'Nombre (igual al del plan)'), f('intro', 'Qué logra', 'area'), f('bullets', 'Entregables', 'textlist')], blankItem: () => ({ name: '', intro: '', bullets: [''] }) }),
    ],
    blank: () => ({ type: 'services', heading: 'Propuesta de servicios', intro: '', items: [] }),
  },
  pricing: {
    label: 'Inversión (tabla de planes)', icon: '$',
    hint: 'La tabla y los precios salen de los planes; no se editan acá.',
    fields: [f('heading', 'Título de sección'), f('intro', 'Introducción', 'area'), f('note', 'Nota debajo de la tabla', 'area')],
    blank: () => ({ type: 'pricing', heading: 'Inversión', intro: '', note: '' }),
  },
  closing: {
    label: 'Cierre (bloque oscuro)', icon: '■',
    fields: [f('label', 'Etiqueta'), f('quote', 'Frase central', 'area'), f('text', 'Texto', 'area')],
    blank: () => ({ type: 'closing', label: 'Idea central', quote: '', text: '' }),
  },
}

export const BLOCK_ORDER = Object.keys(BLOCK_SPECS)
