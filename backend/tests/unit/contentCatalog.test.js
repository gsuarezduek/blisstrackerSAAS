const fs = require('fs')
const path = require('path')
const {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  CONTENT_NETWORKS,
  CONTENT_STATUS_KEYS,
  PORTAL_VISIBLE_STATUSES,
  OPEN_STATUSES,
  isValidStatus,
  isValidType,
  isValidNetwork,
  statusMeta,
  isPortalVisible,
  awaitsClient,
  nextOnTaskDone,
  sanitizeNetworks,
} = require('../../src/lib/contentCatalog')

describe('contentCatalog', () => {
  describe('integridad del catálogo', () => {
    test('las claves de estado son únicas y el order es correlativo', () => {
      expect(new Set(CONTENT_STATUS_KEYS).size).toBe(CONTENT_STATUSES.length)
      const orders = CONTENT_STATUSES.map(s => s.order)
      expect(orders).toEqual([...orders].sort((a, b) => a - b))
      expect(new Set(orders).size).toBe(orders.length)
    })

    test('las claves de tipo y red son únicas', () => {
      expect(new Set(CONTENT_TYPES.map(t => t.key)).size).toBe(CONTENT_TYPES.length)
      expect(new Set(CONTENT_NETWORKS.map(n => n.key)).size).toBe(CONTENT_NETWORKS.length)
    })

    test('todo estado tiene label y color', () => {
      for (const s of CONTENT_STATUSES) {
        expect(typeof s.label).toBe('string')
        expect(s.label.length).toBeGreaterThan(0)
        expect(typeof s.color).toBe('string')
      }
    })
  })

  describe('visibilidad en el portal del cliente', () => {
    // Es el activo crítico del módulo: el query público filtra por esta lista en
    // el WHERE de SQL. Un estado interno que se cuele acá expone al cliente
    // trabajo sin terminar.
    test('los estados internos NO son visibles en el portal', () => {
      for (const key of ['idea', 'produccion', 'revision', 'archivado']) {
        expect(isPortalVisible(key)).toBe(false)
        expect(PORTAL_VISIBLE_STATUSES).not.toContain(key)
      }
    })

    test('el portal ve desde "esperando aprobación" en adelante', () => {
      expect(PORTAL_VISIBLE_STATUSES).toEqual(
        ['aprobacion', 'cambios', 'aprobado', 'programado', 'publicado']
      )
    })

    test('solo "aprobacion" espera una decisión del cliente', () => {
      const waiting = CONTENT_STATUSES.filter(s => awaitsClient(s.key)).map(s => s.key)
      expect(waiting).toEqual(['aprobacion'])
    })

    test('todo estado que espera al cliente es visible en el portal', () => {
      for (const s of CONTENT_STATUSES) {
        if (s.awaitingClient) expect(s.portalVisible).toBe(true)
      }
    })
  })

  describe('OPEN_STATUSES (columnas del Kanban)', () => {
    test('excluye los terminales', () => {
      const keys = OPEN_STATUSES.map(s => s.key)
      expect(keys).not.toContain('publicado')
      expect(keys).not.toContain('archivado')
      expect(keys).toContain('idea')
    })
  })

  describe('validadores', () => {
    test('isValidStatus / isValidType / isValidNetwork', () => {
      expect(isValidStatus('aprobado')).toBe(true)
      expect(isValidStatus('inventado')).toBe(false)
      expect(isValidType('reel')).toBe(true)
      expect(isValidType('reel ')).toBe(false)
      expect(isValidNetwork('instagram')).toBe(true)
      expect(isValidNetwork('myspace')).toBe(false)
    })

    test('statusMeta devuelve null para una clave desconocida', () => {
      expect(statusMeta('idea').label).toBe('Idea')
      expect(statusMeta('nope')).toBeNull()
    })

    test('sanitizeNetworks descarta inválidas y deduplica', () => {
      expect(sanitizeNetworks(['instagram', 'myspace', 'instagram', 'tiktok']))
        .toEqual(['instagram', 'tiktok'])
      expect(sanitizeNetworks(null)).toEqual([])
      expect(sanitizeNetworks('instagram')).toEqual([])
    })
  })

  describe('nextOnTaskDone', () => {
    test('avanza solo desde las etapas de producción', () => {
      expect(nextOnTaskDone('produccion')).toBe('revision')
      expect(nextOnTaskDone('revision')).toBe('aprobacion')
    })

    test('no mueve una pieza ya aprobada ni una recién creada', () => {
      for (const key of ['idea', 'aprobacion', 'aprobado', 'publicado', 'archivado']) {
        expect(nextOnTaskDone(key)).toBeNull()
      }
    })

    test('todo destino de avance es un estado válido', () => {
      for (const key of CONTENT_STATUS_KEYS) {
        const next = nextOnTaskDone(key)
        if (next) expect(isValidStatus(next)).toBe(true)
      }
    })
  })

  describe('espejo del frontend', () => {
    // El frontend tiene su propia copia (no puede importar CommonJS del backend).
    // Este test falla si alguien agrega un estado/tipo/red de un solo lado.
    const mirrorSrc = fs.readFileSync(
      path.join(__dirname, '../../../frontend/src/components/contenido/contentCatalog.js'),
      'utf8'
    )
    const keysIn = (block) => {
      const start = mirrorSrc.indexOf(`export const ${block} = [`)
      const end = mirrorSrc.indexOf(']', start)
      return [...mirrorSrc.slice(start, end).matchAll(/key:\s*'([^']+)'/g)].map(m => m[1])
    }

    test('los estados del espejo coinciden con los del backend', () => {
      expect(keysIn('CONTENT_STATUSES')).toEqual(CONTENT_STATUS_KEYS)
    })

    test('los tipos del espejo coinciden con los del backend', () => {
      expect(keysIn('CONTENT_TYPES')).toEqual(CONTENT_TYPES.map(t => t.key))
    })

    test('las redes del espejo coinciden con las del backend', () => {
      expect(keysIn('CONTENT_NETWORKS')).toEqual(CONTENT_NETWORKS.map(n => n.key))
    })

    test('STATUS_BADGE cubre todos los colores usados, con clases literales', () => {
      // Tailwind purga las clases construidas por interpolación: cada color tiene
      // que estar escrito entero en el espejo.
      for (const color of new Set(CONTENT_STATUSES.map(s => s.color))) {
        expect(mirrorSrc).toContain(`bg-${color}-100`)
      }
    })
  })
})
