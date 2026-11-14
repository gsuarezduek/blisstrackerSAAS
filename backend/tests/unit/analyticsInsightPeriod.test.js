/**
 * generateInsight — qué se le manda a la IA cuando el mes está en curso.
 *
 * El test de arriba (analyticsPartialMonth) fija el criterio; éste fija que el
 * prompt lo use: que el mes en curso se refresque antes de analizarlo, que la
 * comparación sea contra la ventana equivalente del mes anterior y que el mes
 * anterior completo aparezca SÓLO contra una proyección rotulada como tal.
 */
let mockToday     = '2026-11-13'
let mockSnapDate = '2026-11-13'   // hasta dónde llegan los datos del snapshot guardado

jest.mock('../../src/lib/prisma', () => ({
  analyticsSnapshot:  { findUnique: jest.fn(), upsert: jest.fn() },
  analyticsInsight:   { upsert: jest.fn() },
  project:            { findUnique: jest.fn() },
  workspace:          { findUnique: jest.fn() },
  projectIntegration: { findUnique: jest.fn() },
}))
jest.mock('../../src/utils/dates', () => ({
  todayString:   () => mockToday,
  dateStringInTz: () => mockSnapDate,
}))
jest.mock('../../src/lib/logTokens', () => ({ logTokens: jest.fn().mockResolvedValue(undefined) }))
jest.mock('../../src/lib/claude', () => ({
  anthropic:         { messages: { create: jest.fn() } },
  assertTokenBudget: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../../src/services/googleAnalytics.service', () => {
  const actual = jest.requireActual('../../src/services/googleAnalytics.service')
  return { ...actual, fetchGA4Report: jest.fn(), fetchAiTrafficData: jest.fn().mockResolvedValue({}) }
})

const prisma = require('../../src/lib/prisma')
const { anthropic } = require('../../src/lib/claude')
const ga4 = require('../../src/services/googleAnalytics.service')
const { generateInsight } = require('../../src/services/analyticsSnapshot.service')

const snap = (month, over = {}) => ({
  month, sessions: 1300, activeUsers: 1000, newUsers: 800, pageviews: 2600,
  bounceRate: 0.42, avgDuration: 95, conversions: 20,
  topChannels: '[]', topPages: '[]', topSources: '[]', aiTraffic: '{}',
  updatedAt: new Date('2026-11-13T12:00:00Z'), ...over,
})

// Octubre cerrado: 3 veces más volumen que los 13 días de noviembre — es justo el
// par de números que antes producía la "caída del 58%".
const OCTOBER_FULL = snap('2026-10', { sessions: 3100, activeUsers: 2400, newUsers: 1900, pageviews: 6200, conversions: 48 })

const AI_JSON = JSON.stringify({
  titulo: 'Noviembre en curso', resumen: 'ok', tendencias: [], recomendaciones: ['hacer algo'],
})

function overview(sessions, conversions) {
  return {
    overview: { sessions, activeUsers: sessions * 0.8, newUsers: sessions * 0.6, screenPageViews: sessions * 2, bounceRate: 0.4, averageSessionDuration: 90 },
    conversions: { total: conversions },
    channels: [], topPages: [], trafficSources: [],
  }
}

function promptSent() {
  return anthropic.messages.create.mock.calls[0][0].messages[0].content
}
function savedContent() {
  return JSON.parse(prisma.analyticsInsight.upsert.mock.calls[0][0].create.content)
}

beforeEach(() => {
  mockToday = '2026-11-13'
  mockSnapDate = '2026-11-13'
  prisma.project.findUnique.mockResolvedValue({ name: 'Acme' })
  prisma.workspace.findUnique.mockResolvedValue({ timezone: 'America/Argentina/Buenos_Aires' })
  prisma.projectIntegration.findUnique.mockResolvedValue({ id: 7, status: 'active', propertyId: '1234' })
  prisma.analyticsSnapshot.findUnique.mockImplementation(({ where }) =>
    Promise.resolve(where.projectId_month.month === '2026-11' ? snap('2026-11') : OCTOBER_FULL))
  prisma.analyticsSnapshot.upsert.mockResolvedValue(snap('2026-11'))
  prisma.analyticsInsight.upsert.mockImplementation(({ create }) => Promise.resolve({ id: 1, ...create }))
  anthropic.messages.create.mockResolvedValue({ content: [{ type: 'text', text: AI_JSON }], usage: { input_tokens: 10, output_tokens: 10 } })
  // saveMonthSnapshot pide el mes entero; la ventana comparable pide 1–13 de octubre
  ga4.fetchGA4Report.mockImplementation((_i, start) =>
    Promise.resolve(start === '2026-10-01' ? overview(1400, 22) : overview(1300, 20)))
})

describe('mes en curso', () => {
  test('refresca el snapshot del mes antes de analizarlo', async () => {
    await generateInsight(1, 2, '2026-11')
    expect(prisma.analyticsSnapshot.upsert).toHaveBeenCalled()
    expect(prisma.analyticsSnapshot.upsert.mock.calls[0][0].where.projectId_month.month).toBe('2026-11')
  })

  test('pide a GA4 los MISMOS días del mes anterior como base de comparación', async () => {
    await generateInsight(1, 2, '2026-11')
    expect(ga4.fetchGA4Report).toHaveBeenCalledWith(expect.anything(), '2026-10-01', '2026-10-13')
  })

  test('el prompt avisa que el mes está en curso y con qué ventana se compara', async () => {
    await generateInsight(1, 2, '2026-11')
    const prompt = promptSent()
    expect(prompt).toContain('EL MES ESTÁ EN CURSO')
    expect(prompt).toContain('13 de 30 días')
    expect(prompt).toContain('1 al 13 de octubre')
    expect(prompt).toMatch(/PROHIBIDO decir que el mes "cayó"/)
  })

  test('las variaciones salen de la ventana equivalente, NO del mes anterior completo', async () => {
    await generateInsight(1, 2, '2026-11')
    const prompt = promptSent()
    // 1300 vs 1400 (mismos 13 días) = -7%, y nunca 1300 vs 3100 = -58%
    expect(prompt).toContain('Sesiones: -7%')
    expect(prompt).not.toContain('-58%')
    // El bloque de referencia es la ventana, no octubre entero
    expect(prompt).toContain('Datos de referencia — 1 al 13 de octubre')
    expect(prompt).not.toContain('Datos de referencia — Octubre 2026 completo')
  })

  test('el mes anterior completo entra sólo contra la proyección, rotulada como proyección', async () => {
    await generateInsight(1, 2, '2026-11')
    const prompt = promptSent()
    expect(prompt).toContain('3100 sesiones')          // octubre completo, como referencia
    expect(prompt).toContain('~3000 sesiones')          // 1300 / 13 * 30
    expect(prompt).toContain('proyección simple')
  })

  test('`periodo` viaja con el insight guardado: qué se analizó y contra qué', async () => {
    const result = await generateInsight(1, 2, '2026-11')
    expect(result.content.periodo).toMatchObject({
      mes: '2026-11', parcial: true, desde: '2026-11-01', hasta: '2026-11-13',
      dias: 13, diasDelMes: 30,
    })
    expect(result.content.periodo.comparado.etiqueta).toContain('1 al 13 de octubre')
    expect(result.content.periodo.proyeccion.sessions).toBe(3000)
    expect(result.content.periodo.mesAnterior).toMatchObject({ mes: '2026-10', sessions: 3100 })
    expect(savedContent().periodo.parcial).toBe(true)
  })

  test('el 1° del mes no hay ventana comparable: se le pide a la IA que no compare', async () => {
    mockToday = '2026-11-01'
    mockSnapDate = '2026-11-01'
    await generateInsight(1, 2, '2026-11')
    expect(ga4.fetchGA4Report).not.toHaveBeenCalledWith(expect.anything(), '2026-10-01', '2026-10-01')
    const prompt = promptSent()
    expect(prompt).toContain('NO hay una ventana comparable')
    expect(prompt).toContain('"tendencias": []')
    expect(savedContent().periodo.comparado).toBeNull()
  })

  test('si el snapshot quedó viejo y no se pudo refrescar, la ventana dice hasta dónde llega de verdad', async () => {
    mockSnapDate = '2026-11-08'        // el refresco no alcanzó a traer los últimos días
    await generateInsight(1, 2, '2026-11')
    expect(ga4.fetchGA4Report).toHaveBeenCalledWith(expect.anything(), '2026-10-01', '2026-10-08')
    expect(savedContent().periodo).toMatchObject({ hasta: '2026-11-08', dias: 8 })
  })

  test('sin GA4 activo no se inventa una comparación', async () => {
    prisma.projectIntegration.findUnique.mockResolvedValue({ id: 7, status: 'expired', propertyId: '1234' })
    await generateInsight(1, 2, '2026-11')
    expect(ga4.fetchGA4Report).not.toHaveBeenCalled()
    expect(promptSent()).toContain('NO hay una ventana comparable')
    expect(savedContent().periodo.comparado).toBeNull()
  })
})

describe('mes cerrado', () => {
  test('sigue siendo snapshot contra snapshot: no toca GA4 ni refresca nada', async () => {
    await generateInsight(1, 2, '2026-10')
    expect(ga4.fetchGA4Report).not.toHaveBeenCalled()
    expect(prisma.analyticsSnapshot.upsert).not.toHaveBeenCalled()
    const prompt = promptSent()
    expect(prompt).not.toContain('EL MES ESTÁ EN CURSO')
    expect(prompt).toContain('Octubre 2026 completo')
  })

  test('`periodo` marca el mes completo y sin proyección', async () => {
    const result = await generateInsight(1, 2, '2026-10')
    expect(result.content.periodo).toMatchObject({ parcial: false, dias: 31, diasDelMes: 31, proyeccion: null })
    expect(result.content.periodo.comparado).toMatchObject({ desde: '2026-09-01', hasta: '2026-09-30' })
  })
})

describe('sin snapshot', () => {
  test('falla con un mensaje accionable', async () => {
    prisma.analyticsSnapshot.findUnique.mockResolvedValue(null)
    prisma.analyticsSnapshot.upsert.mockResolvedValue(null)
    prisma.projectIntegration.findUnique.mockResolvedValue(null)
    await expect(generateInsight(1, 2, '2026-11')).rejects.toThrow(/No hay snapshot guardado/)
  })
})
