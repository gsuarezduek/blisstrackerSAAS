#!/usr/bin/env node
/**
 * Prueba la conexión con la Advertiser API de ChatGPT Ads SIN tocar la DB ni la app.
 *
 * Existe porque el servicio se escribió contra la documentación
 * (developers.openai.com/ads) antes de tener una cuenta con acceso: si algún nombre
 * de campo o de endpoint cambió, acá se ve en una sola corrida en vez de a través de
 * la pestaña. Imprime lo que devuelve la cuenta, los totales, las campañas y los
 * anuncios ya normalizados, y marca en qué paso falla si falla.
 *
 * Uso:
 *   OPENAI_ADS_API_KEY=sk-ads-... node scripts/chatgpt-ads-probe.js [preset]
 *
 * `preset` es cualquiera de los de la pestaña (default: this_month):
 *   today | yesterday | last_7d | last_30d | this_week | this_month | last_month | last_90d
 *
 * La API key NO se guarda en ningún lado: se cifra en memoria con una clave
 * descartable (el servicio espera el token cifrado, igual que viene de la DB).
 */
const crypto = require('crypto')

// Clave descartable: este script no lee ni escribe integraciones reales.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex')

const { encrypt } = require('../src/lib/encryption')
const { fetchChatGptAdsData, fetchAdAccount, resolveRange } = require('../src/services/chatgptAds.service')

const apiKey = process.env.OPENAI_ADS_API_KEY
const preset = process.argv[2] || 'this_month'

if (!apiKey) {
  console.error('Falta OPENAI_ADS_API_KEY. Generala en ads.openai.com → Settings.')
  process.exit(1)
}

;(async () => {
  console.log(`\n→ Paso 1: GET /ad_account (valida la key y da la timezone de la cuenta)`)
  const account = await fetchAdAccount(apiKey)
  console.log(JSON.stringify(account, null, 2))

  const range = resolveRange(preset, account.timezone)
  console.log(`\n→ Paso 2: insights de "${preset}" → ${range.since} a ${range.until} (tz ${account.timezone || 'default'})`)

  const data = await fetchChatGptAdsData({ accessToken: encrypt(apiKey) }, preset, null, { allAds: true })

  console.log('\nTotales del período:')
  console.table([{
    gasto: data.cost, impresiones: data.impressions, clicks: data.clicks,
    ctr: `${data.ctr}%`, cpc: data.avgCpc, cpm: data.cpm,
    conversiones: data.conversions, ventas: data.websitePurchaseValue, roas: data.roas,
  }])

  console.log(`\nCampañas (${data.campaigns.length}):`)
  if (data.campaigns.length) {
    console.table(data.campaigns.map(c => ({
      id: c.id, nombre: c.name, estado: c.status, gasto: c.cost,
      impresiones: c.impressions, clicks: c.clicks, ctr: c.ctr, conversiones: c.conversions,
    })))
  }

  console.log(`\nAnuncios (${data.ads.length}, se muestran los primeros 10):`)
  if (data.ads.length) {
    console.table(data.ads.slice(0, 10).map(a => ({
      id: a.id, titulo: a.headline, cuerpo: a.description, tipo: a.type, estado: a.status,
      imagen: a.thumbnailUrl ? 'sí' : 'no', impresiones: a.impressions, clicks: a.clicks, gasto: a.cost,
    })))
  }

  // Lo que queda vacío acá es lo que hay que mirar: un `null` en conversiones puede
  // ser una cuenta sin eventos configurados, pero también un nombre de campo cambiado.
  const vacios = []
  if (!data.campaigns.length) vacios.push('campañas (¿la cuenta tuvo actividad en el rango?)')
  if (!data.ads.length)       vacios.push('anuncios')
  if (data.conversions == null) vacios.push('conversiones (POST /conversions/insights — ¿hay píxel y eventos?)')
  if (data.ads.length && !data.ads.some(a => a.headline)) vacios.push('creativos (GET /ads?ad_group_id= — título/cuerpo/imagen)')
  if (vacios.length) console.log(`\n⚠ Sin datos en: ${vacios.join(', ')}`)
  else console.log('\n✓ Todos los bloques trajeron datos.')
})().catch(err => {
  console.error(`\n✗ Falló en "${err.context || 'desconocido'}" — código ${err.code || '?'} (HTTP ${err.httpStatus ?? '?'})`)
  console.error(err.message)
  process.exit(1)
})
