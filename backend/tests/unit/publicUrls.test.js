/**
 * Criterio único de URLs públicas. Lo que estos tests protegen es la distinción que
 * nació al separar el sitio público de la app: el dominio raíz ya NO sirve la app, así
 * que un link de login, de invitación o de baja de mailing armado sobre el raíz lleva a
 * un lugar donde esa pantalla no existe.
 */
const urls = require('../../src/lib/publicUrls')

const ENV_KEYS = ['APP_DOMAIN', 'APP_URL', 'SITE_URL', 'FRONTEND_URL', 'NODE_ENV']

// El módulo lee process.env en cada llamada, así que el entorno tiene que seguir puesto
// MIENTRAS corren las aserciones — de ahí la forma de callback.
function withEnv(env, fn) {
  const saved = {}
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k] }
  Object.assign(process.env, env)
  try {
    fn()
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  }
}

const PROD = { APP_DOMAIN: 'blisstracker.app', NODE_ENV: 'production' }

describe('publicUrls — las tres bases', () => {
  it('el sitio público es el apex (es el dominio canónico)', () => {
    withEnv(PROD, () => {
      expect(urls.siteUrl('/')).toBe('https://blisstracker.app/')
      expect(urls.siteUrl('/privacidad')).toBe('https://blisstracker.app/privacidad')
    })
  })

  it('la app vive en app.<dominio>, no en el apex', () => {
    withEnv(PROD, () => {
      expect(urls.appUrl('/login')).toBe('https://app.blisstracker.app/login')
      expect(urls.appUrl('/join?token=abc')).toBe('https://app.blisstracker.app/join?token=abc')
    })
  })

  it('el workspace de una agencia va a su subdominio', () => {
    withEnv(PROD, () => {
      expect(urls.workspaceUrl('blissmkt', '/report/tok')).toBe('https://blissmkt.blisstracker.app/report/tok')
    })
  })

  it('sin slug, workspaceUrl cae a la app y no al sitio público', () => {
    // Es el caso del reset de contraseña sin X-Workspace: tiene que llevar al login
    // central, que está en la app. El apex no tiene /reset-password.
    withEnv(PROD, () => {
      expect(urls.workspaceUrl(null, '/reset-password?token=x'))
        .toBe('https://app.blisstracker.app/reset-password?token=x')
    })
  })

  it('normaliza la barra: con o sin "/" inicial da lo mismo', () => {
    withEnv(PROD, () => {
      expect(urls.appUrl('login')).toBe(urls.appUrl('/login'))
      expect(urls.siteUrl('pricing')).toBe(urls.siteUrl('/pricing'))
    })
  })

  it('sin path devuelve la base con barra final', () => {
    withEnv(PROD, () => {
      expect(urls.appUrl()).toBe('https://app.blisstracker.app/')
      expect(urls.siteUrl()).toBe('https://blisstracker.app/')
    })
  })

  it('APP_URL y SITE_URL sobrescriben, sin barra duplicada', () => {
    withEnv({ ...PROD, APP_URL: 'https://app-preview.blisstracker.app/', SITE_URL: 'https://preview.blisstracker.app/' }, () => {
      expect(urls.appUrl('/login')).toBe('https://app-preview.blisstracker.app/login')
      expect(urls.siteUrl('/')).toBe('https://preview.blisstracker.app/')
    })
  })

  it('sin APP_DOMAIN cae a FRONTEND_URL (el entorno local del .env.example)', () => {
    withEnv({ FRONTEND_URL: 'http://localhost:5173', NODE_ENV: 'development' }, () => {
      expect(urls.appUrl('/login')).toBe('http://localhost:5173/login')
    })
  })
})

describe('publicUrls — oauthReturnBase', () => {
  it('en desarrollo vuelve al frontend local', () => {
    withEnv({ APP_DOMAIN: 'blisstracker.app', FRONTEND_URL: 'http://localhost:5173', NODE_ENV: 'development' }, () => {
      expect(urls.oauthReturnBase('blissmkt')).toBe('http://localhost:5173')
      expect(urls.oauthReturnBase()).toBe('http://localhost:5173')
    })
  })

  it('en producción con slug vuelve al subdominio del workspace', () => {
    withEnv(PROD, () => {
      expect(urls.oauthReturnBase('blissmkt')).toBe('https://blissmkt.blisstracker.app')
    })
  })

  it('en producción sin slug vuelve a la app, no al apex', () => {
    // Pasa cuando falla el state de OAuth antes de poder leer el workspace. Antes caía
    // en el apex, donde /oauth-result no existe y el error se perdía.
    withEnv(PROD, () => {
      expect(urls.oauthReturnBase()).toBe('https://app.blisstracker.app')
      expect(urls.oauthReturnBase(null)).toBe('https://app.blisstracker.app')
    })
  })
})
