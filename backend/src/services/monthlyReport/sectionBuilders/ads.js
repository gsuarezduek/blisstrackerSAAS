const { fetchGoogleAdsData } = require('../../googleAds.service')
const { fetchMetaAdsData, getValidFbToken } = require('../../metaAds.service')
const { fetchChatGptAdsData } = require('../../chatgptAds.service')
const { cacheImagesInArray } = require('../../socialImageCache.service')

/**
 * Google Ads + Meta Ads + ChatGPT Ads (fetch async con el rango de fechas REAL del
 * informe). Ads es range-native: para informes parciales o multi-mes trae el rango exacto.
 * @param {object} ctx — { wants, warn, integrations, dateRange, workspaceId }
 * @returns {Promise<{ googleAds: object|null, metaAds: object|null, chatgptAds: object|null }>}
 */
async function buildAdsSections({ wants, warn, integrations, dateRange, workspaceId }) {
  const gadsIntegration = integrations.find(i => i.type === 'google_ads')
  const metaIntegration = integrations.find(i => i.type === 'meta_ads')
  const gptIntegration  = integrations.find(i => i.type === 'chatgpt_ads')

  const [googleAdsRaw, metaAdsRaw, chatgptAdsRaw] = await Promise.all([
    wants('googleAds') && gadsIntegration && gadsIntegration.customerId && process.env.GOOGLE_ADS_DEVELOPER_TOKEN
      ? fetchGoogleAdsData(gadsIntegration, 'this_month', dateRange).catch(err => {
          warn('googleAds', 'Google Ads', err)
          return null
        })
      : Promise.resolve(null),
    wants('metaAds') && metaIntegration && metaIntegration.propertyId
      ? getValidFbToken(metaIntegration)
          .then(token => fetchMetaAdsData(metaIntegration.propertyId, token, 'this_month', dateRange))
          .catch(err => {
            warn('metaAds', 'Meta Ads', err)
            return null
          })
      : Promise.resolve(null),
    wants('chatgptAds') && gptIntegration && gptIntegration.accessToken
      ? fetchChatGptAdsData(gptIntegration, 'this_month', dateRange).catch(err => {
          warn('chatgptAds', 'ChatGPT Ads', err)
          return null
        })
      : Promise.resolve(null),
  ])

  const googleAds = googleAdsRaw ? {
    cost:        googleAdsRaw.cost,
    impressions: googleAdsRaw.impressions,
    clicks:      googleAdsRaw.clicks,
    ctr:         googleAdsRaw.ctr,
    conversions: googleAdsRaw.conversions,
    avgCpc:      googleAdsRaw.avgCpc,
    campaigns:   (googleAdsRaw.campaigns ?? []).slice(0, 5),
    topAds:      (googleAdsRaw.topAds ?? []).slice(0, 5),  // preview de texto, sin imagen
  } : null

  const metaAds = metaAdsRaw ? {
    spend:       metaAdsRaw.spend,
    impressions: metaAdsRaw.impressions,
    clicks:      metaAdsRaw.clicks,
    ctr:         metaAdsRaw.ctr,
    reach:       metaAdsRaw.reach,
    cpm:         metaAdsRaw.cpm,
    websitePurchases: metaAdsRaw.websitePurchases ?? null,
    campaigns:   (metaAdsRaw.campaigns ?? []).slice(0, 5),
    // Miniaturas del creativo cacheadas (las URLs de Meta vencen)
    topAds:      await cacheImagesInArray((metaAdsRaw.topAds ?? []).slice(0, 5), 'thumbnailUrl', workspaceId),
  } : null

  const chatgptAds = chatgptAdsRaw ? {
    cost:        chatgptAdsRaw.cost,
    impressions: chatgptAdsRaw.impressions,
    clicks:      chatgptAdsRaw.clicks,
    ctr:         chatgptAdsRaw.ctr,
    conversions: chatgptAdsRaw.conversions,
    avgCpc:      chatgptAdsRaw.avgCpc,
    currency:    chatgptAdsRaw.currency,
    websitePurchases:     chatgptAdsRaw.websitePurchases     ?? null,
    websitePurchaseValue: chatgptAdsRaw.websitePurchaseValue ?? null,
    campaigns:   (chatgptAdsRaw.campaigns ?? []).slice(0, 5),
    // La imagen del creativo se cachea igual que la de Meta: es una URL de la
    // plataforma y vence (el informe público se mira meses después).
    topAds:      await cacheImagesInArray((chatgptAdsRaw.topAds ?? []).slice(0, 5), 'thumbnailUrl', workspaceId),
  } : null

  return { googleAds, metaAds, chatgptAds }
}

module.exports = { buildAdsSections }
