// El handler global solo deja stack por stderr para los 5xx. Un 4xx —un origen fuera
// de CORS, un JSON mal formado, "ya tenés una tarea en curso"— es una respuesta
// esperable y va en una línea por stdout: en producción cada uno dejaba ~15 líneas
// de stack, Railway las pinta de rojo, y tapaban los errores de verdad.
jest.mock('../../src/lib/prisma', () => ({}))

const request = require('supertest')
const app     = require('../../src/app')

let errSpy, logSpy
beforeEach(() => {
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => { errSpy.mockRestore(); logSpy.mockRestore() })

describe('CORS rechazado', () => {
  it('responde 403 (no 500) y el log dice qué origen fue, sin stack', async () => {
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'https://sitio-ajeno.com')
      .set('Access-Control-Request-Method', 'GET')

    expect(res.status).toBe(403)
    expect(errSpy).not.toHaveBeenCalled()
    const line = logSpy.mock.calls.map(c => c.join(' ')).find(l => l.includes('Not allowed by CORS'))
    expect(line).toMatch(/^\[http 403\]/)
    expect(line).toContain('origin https://sitio-ajeno.com')
  })

  it('un subdominio propio sigue pasando', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://bliss.blisstracker.app')
    expect(res.status).toBe(200)
  })
})

describe('JSON mal formado', () => {
  it('400 con el mensaje del parser (que es seguro mostrar) y sin stack por stderr', async () => {
    const prevEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('tools/list')

      expect(res.status).toBe(400)
      expect(res.body.error).not.toBe('Internal server error')
      expect(errSpy).not.toHaveBeenCalled()
    } finally {
      process.env.NODE_ENV = prevEnv
    }
  })
})
