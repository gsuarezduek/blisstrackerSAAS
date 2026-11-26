import sanitizeHtml from 'sanitize-html'

/**
 * Sanitiza el HTML de un artículo del blog, que lo escribe el editor Tiptap de
 * SuperAdmin y se guarda tal cual en `BlogPost.contentHtml`.
 *
 * Por qué `sanitize-html` y no `isomorphic-dompurify`, que es lo que se usó primero:
 * ese paquete arrastra `jsdom` para tener un DOM en el server, y en el runtime de Vercel
 * su árbol de dependencias se rompe —`html-encoding-sniffer` hace `require()` de un
 * módulo ESM (`@exodus/bytes`)— así que el módulo de la página no cargaba y CUALQUIER
 * render por demanda de /blog/:slug devolvía 500. Se veía bien sólo porque los posts
 * salían prerenderizados del build; al revalidar se habrían caído todos.
 * `sanitize-html` parsea con htmlparser2, sin DOM y sin jsdom.
 *
 * La lista es explícita (lo que genera Tiptap) y no la default de la librería: así se
 * sabe exactamente qué puede aparecer en una nota, y agregar una extensión al editor
 * obliga a pasar por acá en vez de que el tag se caiga en silencio.
 */
const OPTIONS = {
  allowedTags: [
    'p', 'br', 'hr',
    'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'span',
    // h1 NO está: el <h1> de la página es el título del artículo, y un segundo h1
    // metido desde el editor rompería el "un solo H1 por página". Abajo se convierte.
    'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'code', 'pre',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a:    ['href', 'title', 'target', 'rel'],
    img:  ['src', 'alt', 'width', 'height', 'loading'],
    span: ['style'],
    mark: ['style'],
    th:   ['colspan', 'rowspan', 'scope'],
    td:   ['colspan', 'rowspan'],
  },
  // Sólo color y resaltado, que son las marcas de Tiptap que usan `style`. Cualquier
  // otra propiedad (position, display…) se descarta: con estilos libres se puede tapar
  // la página entera desde el contenido de una nota.
  allowedStyles: {
    '*': {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\(/i, /^[a-z]+$/i],
      'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\(/i, /^[a-z]+$/i],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    // Un h1 del editor baja a h2 en vez de desaparecer: el texto importa y la jerarquía
    // queda correcta debajo del título del artículo.
    h1: 'h2',
    // Los links externos se abren aparte y sin pasarle el `window` al destino.
    a: (tagName, attribs) => {
      const href = attribs.href || ''
      const external = /^https?:\/\//i.test(href) && !href.includes('blisstracker.app')
      return {
        tagName,
        attribs: external
          ? { ...attribs, target: '_blank', rel: 'noopener noreferrer' }
          : attribs,
      }
    },
  },
}

export function sanitizePostHtml(html) {
  return sanitizeHtml(String(html || ''), OPTIONS)
}
