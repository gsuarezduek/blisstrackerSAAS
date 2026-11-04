/**
 * Un `include` de Prisma SÓLO acepta relaciones (y `_count`). Nombrar un campo escalar
 * ahí es un error de validación —"include statements only accept relation fields"— que
 * tira 500 el endpoint entero, y lo tira siempre: no depende de los datos.
 *
 * Ningún test de integración lo atrapa porque todos mockean `lib/prisma`, así que el
 * cliente real —el único que valida la forma de la query— nunca corre. Este test cierra
 * esa brecha sin necesidad de base: el DMMF sabe qué campos son relaciones y qué campos
 * son escalares, y está disponible con sólo importar el cliente generado.
 */
// Importar el controller arrastra `src/lib/prisma`, que instancia un PrismaClient real
// al cargarse. Con `--runInBand` eso deja un cliente vivo que contamina suites posteriores
// (hacía fallar chat.controller.test.js). Acá no se usa el cliente, sólo el DMMF —que vive
// en `@prisma/client`, otro módulo—, así que mockearlo no le quita nada al test.
jest.mock('../../src/lib/prisma', () => ({}))

const { Prisma } = require('@prisma/client')
const { profileTaskInclude } = require('../../src/controllers/users.controller')

// Nombres de relación de un modelo según el DMMF (kind === 'object').
function relationsOf(modelName) {
  const model = Prisma.dmmf.datamodel.models.find(m => m.name === modelName)
  if (!model) throw new Error(`modelo ${modelName} no está en el DMMF`)
  return new Set(model.fields.filter(f => f.kind === 'object').map(f => f.name))
}

// Las claves de un include que NO son relaciones ni `_count`.
function invalidKeys(include, modelName) {
  const rels = relationsOf(modelName)
  return Object.keys(include).filter(k => k !== '_count' && !rels.has(k))
}

describe('forma de los include de Prisma', () => {
  test('profileTaskInclude sólo nombra relaciones de Task', () => {
    expect(invalidKeys(profileTaskInclude, 'Task')).toEqual([])
  })

  test('los escalares que rotulan las tareas de agente NO se nombran en el include', () => {
    // Vienen solos: un `include` devuelve todos los escalares del modelo. Nombrarlos
    // era el bug — y quitarlos no los saca de la respuesta.
    expect(profileTaskInclude).not.toHaveProperty('isAgentTask')
    expect(profileTaskInclude).not.toHaveProperty('agentName')
  })

  test('el helper detecta un escalar colado (si no, el test de arriba no prueba nada)', () => {
    const roto = { ...profileTaskInclude, isAgentTask: true, agentName: true }
    expect(invalidKeys(roto, 'Task')).toEqual(['isAgentTask', 'agentName'])
  })
})
