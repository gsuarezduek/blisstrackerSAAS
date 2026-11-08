const {
  MARKETING_PROJECT_WHERE,
  CONTENIDO_PROJECT_WHERE,
  projectModuleWhere,
  isProjectModuleEnabled,
  PROJECT_MODULE_FIELD,
  PROJECT_MODULE_OFF_BY_DEFAULT_ON_CREATE,
} = require('../../src/lib/projectModules')

// Marketing, Contenido y Briefs se prenden/apagan por proyecto (ver concepto
// "Secciones por proyecto (Marketing, Contenido, Briefs)"). Este es el criterio único
// que comparten el middleware, los agregados cross-proyecto, los crons y el alta: si
// se parte, un proyecto apagado vuelve a aparecer en algún lado.
describe('projectModules — criterio de secciones por proyecto', () => {
  describe('isProjectModuleEnabled', () => {
    it('apagado solo cuando el campo es explícitamente false', () => {
      expect(isProjectModuleEnabled({ marketingEnabled: false }, 'marketing')).toBe(false)
      expect(isProjectModuleEnabled({ marketingEnabled: true }, 'marketing')).toBe(true)
    })

    // El campo puede no venir en el `select` de quien llama; el default del modelo
    // es `true`, así que nunca se esconde un módulo por no haberlo pedido.
    it('un proyecto sin el campo cuenta como prendido', () => {
      expect(isProjectModuleEnabled({ id: 1, name: 'Acme' }, 'marketing')).toBe(true)
      expect(isProjectModuleEnabled({}, 'contenido')).toBe(true)
    })

    // `findUnique` de un id que no existe devuelve null: no debe explotar acá —
    // el caller ya cortó con 404 antes de llegar a preguntar por el módulo.
    it('null/undefined no explota', () => {
      expect(isProjectModuleEnabled(null, 'marketing')).toBe(true)
      expect(isProjectModuleEnabled(undefined, 'contenido')).toBe(true)
    })

    it('cada módulo mira su propio campo, no el del otro', () => {
      const soloContenido = { marketingEnabled: false, contenidoEnabled: true }
      expect(isProjectModuleEnabled(soloContenido, 'marketing')).toBe(false)
      expect(isProjectModuleEnabled(soloContenido, 'contenido')).toBe(true)
    })

    it('un módulo desconocido es un error de programación, no un false silencioso', () => {
      expect(() => isProjectModuleEnabled({}, 'ventas')).toThrow(/desconocido/i)
    })

    // Briefs entró al mismo criterio que Marketing/Contenido, aunque no tenga
    // feature flag de workspace: su toggle de proyecto es su única palanca.
    it('Briefs es una sección más', () => {
      expect(PROJECT_MODULE_FIELD.briefs).toBe('briefsEnabled')
      expect(isProjectModuleEnabled({ briefsEnabled: false }, 'briefs')).toBe(false)
      expect(isProjectModuleEnabled({}, 'briefs')).toBe(true)
    })
  })

  // Lo que estrena apagado un proyecto NUEVO. El default del modelo sigue en `true`
  // para no apagarle nada a los proyectos que ya existen.
  describe('defaults de alta', () => {
    it('Briefs nace apagado; Marketing y Contenido, no', () => {
      expect(PROJECT_MODULE_OFF_BY_DEFAULT_ON_CREATE).toEqual(['briefs'])
    })

    it('todo lo que está en la lista es una sección conocida', () => {
      for (const key of PROJECT_MODULE_OFF_BY_DEFAULT_ON_CREATE) {
        expect(PROJECT_MODULE_FIELD[key]).toBeDefined()
      }
    })
  })

  describe('where de Prisma', () => {
    it('los where exportados coinciden con el campo de cada módulo', () => {
      expect(MARKETING_PROJECT_WHERE).toEqual({ [PROJECT_MODULE_FIELD.marketing]: true })
      expect(CONTENIDO_PROJECT_WHERE).toEqual({ [PROJECT_MODULE_FIELD.contenido]: true })
      expect(projectModuleWhere('marketing')).toEqual(MARKETING_PROJECT_WHERE)
      expect(projectModuleWhere('contenido')).toEqual(CONTENIDO_PROJECT_WHERE)
    })

    // Se esparcen (`{ ...MARKETING_PROJECT_WHERE }`) en decenas de queries: si
    // alguna los mutara, las siguientes del mismo proceso filtrarían de más.
    it('componer un where no muta la constante', () => {
      const where = { workspaceId: 1, active: true, ...MARKETING_PROJECT_WHERE }
      where.marketingEnabled = false
      expect(MARKETING_PROJECT_WHERE).toEqual({ marketingEnabled: true })
      expect(where.active).toBe(true)
    })
  })
})
