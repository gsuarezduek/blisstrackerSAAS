jest.mock('../../src/lib/prisma', () => ({ workspace: { findUnique: jest.fn() } }))

const prisma = require('../../src/lib/prisma')
const { checkSlug } = require('../../src/controllers/workspace/registration.controller')

function run(slug) {
  const res = { json: jest.fn() }
  return checkSlug({ query: { slug } }, res, (err) => { throw err }).then(() => res.json.mock.calls[0][0])
}

describe('slug de workspace', () => {
  beforeEach(() => prisma.workspace.findUnique.mockReset())

  it('acepta minúsculas, números y guiones simples', async () => {
    prisma.workspace.findUnique.mockResolvedValue(null)
    expect(await run('mi-agencia-2')).toEqual({ available: true })
  })

  // `--` es el separador de la dirección de prueba del frontend
  // (`bliss--preview.blisstracker.app`): un workspace con ese nombre se la robaría.
  it('rechaza dos guiones seguidos sin consultar la base', async () => {
    expect(await run('bliss--preview')).toEqual({ available: false, reason: 'format' })
    expect(prisma.workspace.findUnique).not.toHaveBeenCalled()
  })

  it('sigue rechazando mayúsculas y largos fuera de rango', async () => {
    expect(await run('Bliss')).toEqual({ available: false, reason: 'format' })
    expect(await run('a')).toEqual({ available: false, reason: 'format' })
  })
})
