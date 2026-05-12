const FormData         = require('form-data')
const axios            = require('axios')
const jwt              = require('jsonwebtoken')
const prisma           = require('../lib/prisma')
const { encrypt }      = require('../lib/encryption')

/**
 * Instagram Business Login — flujo directo con instagram.com/oauth/authorize.
 * No requiere Facebook Pages ni Business Manager.
 * Scopes: instagram_business_basic, instagram_business_manage_insights
 */

function buildMetaRedirectUri() {
  const base = process.env.BACKEND_URL || 'http://localhost:3001'
  return `${base}/api/marketing/integrations/meta/callback`
}

/**
 * GET /api/marketing/integrations/meta/auth-url?projectId=X
 */
async function getMetaAuthUrl(req, res, next) {
  try {
    const { projectId } = req.query
    if (!projectId) return res.status(400).json({ error: 'projectId requerido' })

    const project = await prisma.project.findFirst({
      where: { id: Number(projectId), workspaceId: req.workspace.id },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const state = jwt.sign(
      { projectId: Number(projectId), workspaceId: req.workspace.id, slug: req.workspace.slug, userId: req.user.userId },
      process.env.JWT_SECRET,
      { expiresIn: '10m' },
    )

    const params = new URLSearchParams({
      client_id:     process.env.META_APP_ID,
      redirect_uri:  buildMetaRedirectUri(),
      scope:         'instagram_business_basic,instagram_business_manage_insights',
      state,
      response_type: 'code',
    })

    // Instagram Business Login — endpoint de instagram.com, no facebook.com
    const url = `https://www.instagram.com/oauth/authorize?${params.toString()}`
    res.json({ url })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/integrations/meta/callback?code=...&state=...
 * Sin auth middleware.
 */
async function handleMetaCallback(req, res, next) {
  const { code, state, error: oauthError } = req.query
  const appDomain = process.env.APP_DOMAIN || 'blisstracker.app'

  if (oauthError) {
    return res.redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/oauth-result?error=${encodeURIComponent(oauthError)}`
    )
  }

  let statePayload
  try {
    statePayload = jwt.verify(state, process.env.JWT_SECRET)
  } catch {
    return res.redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/oauth-result?error=invalid_state`
    )
  }

  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
    console.error('[MetaOAuth] META_APP_ID o META_APP_SECRET no están configurados')
    return res.redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/oauth-result?error=server_config_error`
    )
  }

  const { projectId, workspaceId, slug, userId, codeVerifier } = statePayload
  const isLocalDev   = process.env.NODE_ENV !== 'production'
  const frontendBase = isLocalDev
    ? (process.env.FRONTEND_URL || 'http://localhost:5173')
    : `https://${slug}.${appDomain}`

  const redirectUri = buildMetaRedirectUri()

  try {
    // 1. Token exchange — Instagram Business Login requiere cuenta Professional (Business/Creator)
    const tokenRes = await axios.post(
      'https://api.instagram.com/oauth/access_token',
      new URLSearchParams({
        client_id:     process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        grant_type:    'authorization_code',
        redirect_uri:  redirectUri,
        code,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    )
    const shortToken = tokenRes.data.access_token
    const igUserId   = tokenRes.data.user_id ? String(tokenRes.data.user_id) : null

    // 2. Intercambiar short-lived token → long-lived token (60 días)
    //    api.instagram.com/oauth/access_token devuelve un token de 1 hora.
    //    graph.instagram.com/access_token lo convierte a 60 días.
    const longTokenRes = await axios.get('https://graph.instagram.com/access_token', {
      params: {
        grant_type:    'ig_exchange_token',
        client_id:     process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        access_token:  shortToken,
      },
    })
    const longToken = longTokenRes.data.access_token
    const expiresIn = longTokenRes.data.expires_in ?? (60 * 24 * 60 * 60)
    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    // 3. Verificar token y obtener id real + username via /me (versioned)
    let username = null
    let resolvedIgUserId = igUserId
    try {
      const profileRes = await axios.get('https://graph.instagram.com/v21.0/me', {
        params: { fields: 'id,username', access_token: longToken },
      })
      username         = profileRes.data?.username ?? null
      resolvedIgUserId = profileRes.data?.id ? String(profileRes.data.id) : igUserId
      console.log('[MetaOAuth] /me OK:', username, resolvedIgUserId)
    } catch (meErr) {
      const meMsg = meErr.response?.data?.error?.message ?? meErr.message
      console.warn('[MetaOAuth] /me falló:', meMsg)
      const userMsg = 'No se pudo acceder a la cuenta de Instagram. Asegurate de que sea una cuenta Professional (Business o Creator) y de que la app tenga los permisos necesarios.'
      return res.redirect(`${frontendBase}/oauth-result?error=${encodeURIComponent(userMsg)}`)
    }

    // 4. Upsert en ProjectIntegration
    await prisma.projectIntegration.upsert({
      where:  { projectId_type: { projectId, type: 'instagram' } },
      update: {
        workspaceId, status: 'active', propertyId: resolvedIgUserId,
        accessToken: encrypt(longToken), refreshToken: null,
        expiresAt, scopes: 'instagram_business_basic,instagram_business_manage_insights',
        connectedById: userId, connectedAt: new Date(),
      },
      create: {
        projectId, workspaceId, type: 'instagram', status: 'active',
        propertyId: resolvedIgUserId, accessToken: encrypt(longToken), refreshToken: null,
        expiresAt, scopes: 'instagram_business_basic,instagram_business_manage_insights',
        connectedById: userId, connectedAt: new Date(),
      },
    })

    console.log(`[MetaOAuth] Instagram conectado: proyecto ${projectId}, @${username} (${resolvedIgUserId})`)
    res.redirect(`${frontendBase}/oauth-result?success=true&type=instagram`)
  } catch (err) {
    const igMsg = err.response?.data?.error?.message || ''
    // Error típico cuando la cuenta de Instagram no es Professional (Business/Creator)
    const isAccountTypeError = igMsg.includes('method type: get') || igMsg.includes('IGApiException')
    const userMsg = isAccountTypeError
      ? 'La cuenta de Instagram debe ser Professional (Business o Creator). Convertila desde Configuración → Tipo de cuenta en Instagram.'
      : (err.response?.data?.error_message || igMsg || err.response?.data?.error_description || err.message)
    console.error('[MetaOAuth] Error:', err.response?.status, igMsg || err.message)
    res.redirect(`${frontendBase}/oauth-result?error=${encodeURIComponent(userMsg)}`)
  }
}

// ── Meta Ads OAuth (Facebook Login + ads_read) ────────────────────────────────

function buildMetaAdsRedirectUri() {
  const base = process.env.BACKEND_URL || 'http://localhost:3001'
  return `${base}/api/marketing/integrations/meta-ads/callback`
}

/**
 * GET /api/marketing/integrations/meta-ads/auth-url?projectId=X
 */
async function getMetaAdsAuthUrl(req, res, next) {
  try {
    const { projectId } = req.query
    if (!projectId) return res.status(400).json({ error: 'projectId requerido' })

    const project = await prisma.project.findFirst({
      where: { id: Number(projectId), workspaceId: req.workspace.id },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const state = jwt.sign(
      { projectId: Number(projectId), workspaceId: req.workspace.id, slug: req.workspace.slug, userId: req.user.userId },
      process.env.JWT_SECRET,
      { expiresIn: '10m' },
    )

    const params = new URLSearchParams({
      client_id:     process.env.META_APP_ID,
      redirect_uri:  buildMetaAdsRedirectUri(),
      scope:         'ads_read',
      state,
      response_type: 'code',
    })

    // Meta Ads usa Facebook Login — facebook.com (distinto al Instagram Business Login)
    const url = `https://www.facebook.com/dialog/oauth?${params.toString()}`
    res.json({ url })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/integrations/meta-ads/callback?code=...&state=...
 * Sin auth middleware.
 */
async function handleMetaAdsCallback(req, res, next) {
  const { code, state, error: oauthError } = req.query
  const appDomain = process.env.APP_DOMAIN || 'blisstracker.app'

  if (oauthError) {
    return res.redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/oauth-result?error=${encodeURIComponent(oauthError)}`
    )
  }

  let statePayload
  try {
    statePayload = jwt.verify(state, process.env.JWT_SECRET)
  } catch {
    return res.redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/oauth-result?error=invalid_state`
    )
  }

  const { projectId, workspaceId, slug, userId } = statePayload
  const isLocalDev   = process.env.NODE_ENV !== 'production'
  const frontendBase = isLocalDev
    ? (process.env.FRONTEND_URL || 'http://localhost:5173')
    : `https://${slug}.${appDomain}`

  const redirectUri = buildMetaAdsRedirectUri()

  try {
    // 1. Intercambiar code por short-lived token (Facebook Graph API)
    const tokenRes = await axios.post(
      'https://graph.facebook.com/v21.0/oauth/access_token',
      new URLSearchParams({
        client_id:     process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        grant_type:    'authorization_code',
        redirect_uri:  redirectUri,
        code,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    )
    const shortToken = tokenRes.data.access_token

    // 2. Canjear short-lived → long-lived (60 días)
    const longRes = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
      params: {
        grant_type:        'fb_exchange_token',
        client_id:         process.env.META_APP_ID,
        client_secret:     process.env.META_APP_SECRET,
        fb_exchange_token: shortToken,
      },
    })
    const longToken = longRes.data.access_token
    const expiresIn = longRes.data.expires_in ?? 5183944
    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    // 3. Obtener cuentas publicitarias del usuario
    const accountsRes = await axios.get('https://graph.facebook.com/v21.0/me/adaccounts', {
      params: {
        fields:       'id,name,account_status',
        access_token: longToken,
      },
    })

    const accounts = accountsRes.data.data ?? []
    // account_status 1 = ACTIVE
    const activeAccount = accounts.find(a => a.account_status === 1) ?? accounts[0]

    if (!activeAccount) {
      return res.redirect(
        `${frontendBase}/oauth-result?error=${encodeURIComponent('No se encontró ninguna cuenta publicitaria de Meta')}`
      )
    }

    const adAccountId = activeAccount.id   // ya incluye el prefijo "act_"
    const accountName = activeAccount.name

    // 4. Upsert en ProjectIntegration
    await prisma.projectIntegration.upsert({
      where:  { projectId_type: { projectId, type: 'meta_ads' } },
      update: {
        workspaceId, status: 'active', propertyId: adAccountId,
        accessToken: encrypt(longToken), refreshToken: null,
        expiresAt, scopes: 'ads_read',
        connectedById: userId, connectedAt: new Date(),
      },
      create: {
        projectId, workspaceId, type: 'meta_ads', status: 'active',
        propertyId: adAccountId, accessToken: encrypt(longToken), refreshToken: null,
        expiresAt, scopes: 'ads_read',
        connectedById: userId, connectedAt: new Date(),
      },
    })

    console.log(`[MetaAdsOAuth] Meta Ads conectado: proyecto ${projectId}, cuenta ${adAccountId} (${accountName})`)
    res.redirect(`${frontendBase}/oauth-result?success=true&type=meta_ads`)
  } catch (err) {
    console.error('[MetaAdsOAuth] Error:', JSON.stringify(err.response?.data ?? err.message, null, 2))
    const msg = err.response?.data?.error?.message || err.message
    res.redirect(`${frontendBase}/oauth-result?error=${encodeURIComponent(msg)}`)
  }
}

/**
 * POST /api/marketing/projects/:id/integrations/instagram/connect-token
 * Conecta Instagram mediante un token manual (System User Token de Business Manager).
 * Body: { accessToken: string }
 */
async function connectInstagramToken(req, res, next) {
  try {
    const projectId  = Number(req.params.id)
    const { accessToken } = req.body
    if (!accessToken) return res.status(400).json({ error: 'accessToken requerido' })

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId: req.workspace.id },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    // 1. Validar token y obtener id + username
    let username, igUserId
    try {
      const profileRes = await axios.get('https://graph.instagram.com/v21.0/me', {
        params: { fields: 'id,username', access_token: accessToken },
      })
      username  = profileRes.data?.username ?? null
      igUserId  = profileRes.data?.id ? String(profileRes.data.id) : null
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message
      return res.status(400).json({ error: `Token inválido: ${msg}` })
    }

    // 2. Intentar exchange a long-lived token (falla si ya es un System User Token permanente)
    let finalToken = accessToken
    let expiresAt  = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000) // 10 años (token permanente)
    try {
      const longRes = await axios.get('https://graph.instagram.com/access_token', {
        params: {
          grant_type:    'ig_exchange_token',
          client_id:     process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          access_token:  accessToken,
        },
      })
      finalToken = longRes.data.access_token
      const expiresIn = longRes.data.expires_in ?? (60 * 24 * 60 * 60)
      expiresAt = new Date(Date.now() + expiresIn * 1000)
    } catch {
      // System User Tokens son permanentes y no se pueden exchangear — se usa el token original
    }

    // 3. Guardar en ProjectIntegration
    await prisma.projectIntegration.upsert({
      where:  { projectId_type: { projectId, type: 'instagram' } },
      update: {
        workspaceId: req.workspace.id, status: 'active', propertyId: igUserId,
        accessToken: encrypt(finalToken), refreshToken: null,
        expiresAt, scopes: 'instagram_business_basic,instagram_business_manage_insights',
        connectedById: req.user.userId, connectedAt: new Date(),
      },
      create: {
        projectId, workspaceId: req.workspace.id, type: 'instagram', status: 'active',
        propertyId: igUserId, accessToken: encrypt(finalToken), refreshToken: null,
        expiresAt, scopes: 'instagram_business_basic,instagram_business_manage_insights',
        connectedById: req.user.userId, connectedAt: new Date(),
      },
    })

    console.log(`[MetaToken] Instagram conectado via token manual: proyecto ${projectId}, @${username} (${igUserId})`)
    res.json({ ok: true, username, igUserId })
  } catch (err) { next(err) }
}

module.exports = { getMetaAuthUrl, handleMetaCallback, getMetaAdsAuthUrl, handleMetaAdsCallback, connectInstagramToken }
