const jwt = require('jsonwebtoken')
const { verifyToken } = require('../../src/lib/jwt')
const { signState, verifyState } = require('../../src/lib/oauthState')
const { signChallenge, verifyChallenge, assertNotExhausted, registerFailure, consumeChallenge, MAX_ATTEMPTS } = require('../../src/lib/mfaChallenge')

const SECRET = process.env.JWT_SECRET

// El invariante que sostiene todo el 2FA: un JWT de propósito acotado NO sirve
// como token de sesión. `resolveWorkspace` resuelve la membresía con el header
// X-Workspace + el `userId` del token, así que cualquier token que traiga
// `userId` y pase `verifyToken` habilita las rutas de nivel `member`.
describe('verifyToken — sólo tokens de sesión', () => {
  it('acepta un token de sesión (sin purpose)', () => {
    const token = jwt.sign({ userId: 1, workspaceId: 1, role: 'member' }, SECRET)
    expect(verifyToken(token).userId).toBe(1)
  })

  it('rechaza el mfaToken del paso 2 del login', () => {
    // Sin esto el 2FA sería decorativo: contraseña → mfaToken → usarlo como Bearer.
    expect(() => verifyToken(signChallenge({ userId: 1, slug: null }))).toThrow()
  })

  it('rechaza el `state` de OAuth, que viaja en la URL del proveedor', () => {
    expect(() => verifyToken(signState({ userId: 1, workspaceId: 1, slug: 'bliss' }))).toThrow()
  })

  it('rechaza el linkToken de conectar Google', () => {
    const token = jwt.sign({ userId: 1, purpose: 'google-link' }, SECRET, { expiresIn: '5m' })
    expect(() => verifyToken(token)).toThrow()
  })

  it('rechaza el token del portal de cliente', () => {
    const token = jwt.sign({ contactId: 1, purpose: 'client-portal-live' }, SECRET)
    expect(() => verifyToken(token)).toThrow()
  })

  it('rechaza el magic link del portal de cliente', () => {
    const token = jwt.sign({ contactId: 1, purpose: 'client-portal-magic' }, SECRET)
    expect(() => verifyToken(token)).toThrow()
  })

  it('rechaza un token firmado con otro secret', () => {
    expect(() => verifyToken(jwt.sign({ userId: 1 }, 'otro-secret'))).toThrow()
  })
})

describe('oauthState', () => {
  it('ida y vuelta conserva el contexto', () => {
    const payload = { projectId: 3, workspaceId: 1, slug: 'bliss', userId: 7, type: 'ga4' }
    expect(verifyState(signState(payload))).toMatchObject(payload)
  })

  it('rechaza un token de sesión pasado como state (no se falsea el contexto)', () => {
    const session = jwt.sign({ userId: 1, workspaceId: 1, slug: 'otro', role: 'owner' }, SECRET)
    expect(() => verifyState(session)).toThrow('Invalid OAuth state')
  })
})

describe('mfaChallenge', () => {
  it('conserva userId y slug, y genera un jti distinto por desafío', () => {
    const a = verifyChallenge(signChallenge({ userId: 42, slug: 'bliss' }))
    const b = verifyChallenge(signChallenge({ userId: 42, slug: 'bliss' }))

    expect(a).toMatchObject({ userId: 42, slug: 'bliss' })
    expect(a.jti).not.toBe(b.jti)
  })

  it('slug null para el login del dominio raíz', () => {
    expect(verifyChallenge(signChallenge({ userId: 42 })).slug).toBeNull()
  })

  it('rechaza un token que no es un desafío de 2FA', () => {
    expect(() => verifyChallenge(jwt.sign({ userId: 1 }, SECRET))).toThrow()
    expect(() => verifyChallenge('basura')).toThrow()
    expect(() => verifyChallenge(undefined)).toThrow()
  })

  it('traduce el error a 401 con código, para que el controller no razone de nuevo', () => {
    try {
      verifyChallenge('basura')
      throw new Error('debería haber lanzado')
    } catch (err) {
      expect(err.status).toBe(401)
      expect(err.code).toBe('MFA_CHALLENGE_EXPIRED')
    }
  })

  it('quema el desafío después de MAX_ATTEMPTS fallidos', () => {
    const token = signChallenge({ userId: 1 })
    const { jti } = verifyChallenge(token)

    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      expect(registerFailure(jti)).toBe(MAX_ATTEMPTS - 1 - i)
      expect(() => verifyChallenge(token)).not.toThrow()
    }

    expect(registerFailure(jti)).toBe(0)
    try {
      verifyChallenge(token)
      throw new Error('debería haber lanzado')
    } catch (err) {
      expect(err.status).toBe(429)
      expect(err.code).toBe('MFA_TOO_MANY_ATTEMPTS')
    }
  })

  // El JWT sigue vivo 5 minutos después de un canje exitoso: sin quemarlo, el
  // mismo mfaToken serviría para pedir una segunda sesión mientras el TOTP siga
  // en su ventana.
  it('consumeChallenge lo deja de un solo uso', () => {
    const token = signChallenge({ userId: 1 })
    const { jti } = verifyChallenge(token)

    consumeChallenge(jti)

    expect(() => verifyChallenge(token)).toThrow()
  })

  it('assertNotExhausted aplica el mismo tope a una clave arbitraria (reset de contraseña)', () => {
    const key = 'reset:123'
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      expect(() => assertNotExhausted(key)).not.toThrow()
      registerFailure(key)
    }
    expect(() => assertNotExhausted(key)).toThrow(/Demasiados códigos/)
  })
})
