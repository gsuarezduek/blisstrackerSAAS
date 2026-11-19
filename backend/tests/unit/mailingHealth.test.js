// Hallazgos de Mailing en Prioridades: lo que daña la reputación del dominio del
// cliente o deja una campaña trabada sin que nadie se entere.
const { mailingFindings } = require('../../src/services/mailing/health')

const NOW = new Date('2026-11-18T15:00:00Z')
const camp = over => ({ name: 'Novedades', status: 'sent', launchedAt: new Date('2026-11-10'), sentCount: 1000, bounceCount: 0, complaintCount: 0, ...over })
const active = { provider: 'resend', status: 'active', webhookSecret: 'x' }

it('sin problemas no hay hallazgos', () => {
  expect(mailingFindings({ config: active, campaigns: [camp()], now: NOW })).toEqual([])
})

it('config con error: alta prioridad y cuenta las campañas que esperan', () => {
  const [f] = mailingFindings({ config: { ...active, status: 'invalid', lastError: 'API key inválida' }, campaigns: [camp({ status: 'sending' })], now: NOW })
  expect(f).toMatchObject({ source: 'mailing', priority: 'high', link: { tab: 'mailing', sub: 'configuracion' } })
  expect(f.detail).toMatch(/API key inválida.*1 campaña/)
})

it('rebote arriba del 5% y quejas arriba del 0,1%', () => {
  const items = mailingFindings({ config: active, campaigns: [camp({ bounceCount: 60, complaintCount: 2 })], now: NOW })
  expect(items.map(i => i.title)).toEqual(['«Novedades» rebotó el 6%', '«Novedades» tuvo 2 quejas de spam (0,2%)'])
})

it('una campaña chica o vieja no genera alerta de tasas', () => {
  expect(mailingFindings({ config: active, campaigns: [camp({ sentCount: 40, bounceCount: 10 })], now: NOW })).toEqual([])
  expect(mailingFindings({ config: active, campaigns: [camp({ launchedAt: new Date('2026-09-01'), bounceCount: 200 })], now: NOW })).toEqual([])
})

it('sin webhook de rebotes avisa (salvo SMTP, que no tiene)', () => {
  expect(mailingFindings({ config: { ...active, webhookSecret: null }, campaigns: [], now: NOW })[0].priority).toBe('medium')
  expect(mailingFindings({ config: { provider: 'ses', status: 'active', webhookId: 'arn' }, campaigns: [], now: NOW })).toEqual([])
  expect(mailingFindings({ config: { provider: 'smtp', status: 'active' }, campaigns: [], now: NOW })).toEqual([])
})
