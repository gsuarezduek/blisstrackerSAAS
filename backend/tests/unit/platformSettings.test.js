/**
 * Tests del helper de PlatformSetting:
 * - fallback a default cuando la key no existe en DB
 * - parseo de valor cuando existe
 * - defensa por bounds (out-of-range → default + warning)
 * - clampToBounds para cada tipo
 * - getSettings batch
 */

jest.mock('../../src/lib/prisma', () => ({
  platformSetting: {
    findUnique: jest.fn(),
    findMany:   jest.fn(),
  },
}))

const prisma = require('../../src/lib/prisma')
const {
  getSetting,
  getSettings,
  invalidateCache,
  clampToBounds,
} = require('../../src/lib/platformSettings')

describe('clampToBounds', () => {
  test('integer dentro de rango pasa', () => {
    expect(clampToBounds({ type: 'integer', min: 0, max: 365 }, 14)).toBe(14)
  })

  test('integer fuera de rango devuelve null', () => {
    expect(clampToBounds({ type: 'integer', min: 0, max: 365 }, -1)).toBeNull()
    expect(clampToBounds({ type: 'integer', min: 0, max: 365 }, 500)).toBeNull()
  })

  test('integer no numérico devuelve null', () => {
    expect(clampToBounds({ type: 'integer' }, 'abc')).toBeNull()
    expect(clampToBounds({ type: 'integer' }, NaN)).toBeNull()
  })

  test('boolean valida tipo', () => {
    expect(clampToBounds({ type: 'boolean' }, true)).toBe(true)
    expect(clampToBounds({ type: 'boolean' }, 'true')).toBeNull()
  })

  test('pricingTiers válido pasa', () => {
    const value = [{ upTo: 19, pricePerSeat: 3 }, { upTo: null, pricePerSeat: 2 }]
    expect(clampToBounds({ type: 'pricingTiers' }, value)).toEqual(value)
  })

  test('pricingTiers vacío devuelve null', () => {
    expect(clampToBounds({ type: 'pricingTiers' }, [])).toBeNull()
  })

  test('pricingTiers con shape inválido devuelve null', () => {
    expect(clampToBounds({ type: 'pricingTiers' }, [{ upTo: 'foo', pricePerSeat: 3 }])).toBeNull()
    expect(clampToBounds({ type: 'pricingTiers' }, [{ upTo: 19, pricePerSeat: -5 }])).toBeNull()
    expect(clampToBounds({ type: 'pricingTiers' }, [{ upTo: 19 }])).toBeNull()
  })
})

describe('getSetting', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    invalidateCache()
  })

  test('devuelve el valor de DB cuando existe', async () => {
    prisma.platformSetting.findUnique.mockResolvedValue({ key: 'trialDays', value: { value: 7 } })
    const v = await getSetting('trialDays')
    expect(v).toBe(7)
  })

  test('fallback a default del catálogo cuando DB no tiene la key', async () => {
    prisma.platformSetting.findUnique.mockResolvedValue(null)
    const v = await getSetting('trialDays')
    expect(v).toBe(14) // default del catálogo
  })

  test('valor fuera de bounds devuelve default + log de warning', async () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    prisma.platformSetting.findUnique.mockResolvedValue({ key: 'trialDays', value: { value: -1 } })
    const v = await getSetting('trialDays')
    expect(v).toBe(14)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  test('cachea el resultado (segundo call no pega a DB)', async () => {
    prisma.platformSetting.findUnique.mockResolvedValue({ key: 'trialDays', value: { value: 30 } })
    await getSetting('trialDays')
    await getSetting('trialDays')
    expect(prisma.platformSetting.findUnique).toHaveBeenCalledTimes(1)
  })

  test('lanza error si la key no existe en el catálogo', async () => {
    await expect(getSetting('unknownKey')).rejects.toThrow('key desconocida')
  })
})

describe('getSettings (batch)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    invalidateCache()
  })

  test('hace una sola query para múltiples keys', async () => {
    prisma.platformSetting.findMany.mockResolvedValue([
      { key: 'trialDays', value: { value: 7 } },
      { key: 'tokenWarningPct', value: { value: 85 } },
    ])
    const result = await getSettings(['trialDays', 'tokenWarningPct'])
    expect(result).toEqual({ trialDays: 7, tokenWarningPct: 85 })
    expect(prisma.platformSetting.findMany).toHaveBeenCalledTimes(1)
  })

  test('usa default para keys faltantes en DB', async () => {
    prisma.platformSetting.findMany.mockResolvedValue([
      { key: 'trialDays', value: { value: 30 } },
    ])
    const result = await getSettings(['trialDays', 'tokenCriticalPct'])
    expect(result.trialDays).toBe(30)
    expect(result.tokenCriticalPct).toBe(95) // default
  })

  test('aprovecha la caché para las keys ya pedidas', async () => {
    prisma.platformSetting.findUnique.mockResolvedValue({ key: 'trialDays', value: { value: 10 } })
    await getSetting('trialDays')

    prisma.platformSetting.findMany.mockResolvedValue([
      { key: 'tokenWarningPct', value: { value: 88 } },
    ])
    const result = await getSettings(['trialDays', 'tokenWarningPct'])
    expect(result).toEqual({ trialDays: 10, tokenWarningPct: 88 })
    // findMany debe solo buscar tokenWarningPct (no trialDays)
    expect(prisma.platformSetting.findMany).toHaveBeenCalledWith({ where: { key: { in: ['tokenWarningPct'] } } })
  })
})
