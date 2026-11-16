# Integraciones OAuth (Google, Meta, TikTok, LinkedIn) — setup y scopes

> Parte de la documentación modular de BlissTracker. No se carga automáticamente en cada sesión de Claude Code — este archivo se lee bajo demanda cuando la tarea toca este módulo. Índice completo en `CLAUDE.md` (raíz).

### Google Cloud APIs habilitadas

Proyecto OAuth: el mismo que usa el login con Google (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) — **Bliss Team Tracker**, ID `bliss-team-tracker`, número `306615256468` (el número es el prefijo del Client ID). Ojo: en la misma cuenta de Google Cloud hay otro proyecto ("Mail MDZ") que no tiene nada que ver con BlissTracker.

| API | Uso actual | Autenticación |
|-----|-----------|---------------|
| **Google Analytics Data API** | Marketing → Informes: métricas GA4 por proyecto | OAuth (refresh token por proyecto) |
| **Google Analytics Admin API** | Futuro: listar properties disponibles (evitar tipear Property ID a mano) | OAuth |
| **Google Analytics API** | Legacy / fallback UA — habilitada por si acaso | OAuth |
| **Google Search Console API** | Marketing → GEO / SEO: impresiones, clicks, posición, snapshots mensuales e inventario del blog | OAuth (scope `webmasters.readonly`) |
| **PageSpeed Insights API** | Marketing → Web: performance score, CWV, oportunidades y diagnósticos | API Key (`PAGESPEED_API_KEY`) |
| **YouTube Data API v3** | Marketing → YouTube: suscriptores, vistas, videos nuevos (largos/shorts), engagement por proyecto | OAuth (scope `youtube.readonly`, type `google_youtube`) |
| **YouTube Analytics API** | Futuro (v2): watch time, retención, demografía, suscriptores ganados/perdidos exactos del mes | OAuth |
| **Business Profile Performance API** | Futuro (Marketing → GEO / SEO, "SEO local"): llamadas, indicaciones, clics al sitio/chat, vistas Maps/Búsqueda × dispositivo, términos de búsqueda mensuales | OAuth (scope `business.manage`) — **cuota 0 hasta que Google apruebe el allowlist** |
| **My Business Account Management API** | Futuro: listar las cuentas de Business Profile del usuario que conecta | OAuth (`business.manage`) — cuota 0 hasta el allowlist |
| **My Business Business Information API** | Futuro: listar las fichas (locations) para elegir cuál conectar + nombre/dirección/categoría | OAuth (`business.manage`) — cuota 0 hasta el allowlist |
| **Google My Business API (v4)** | Futuro: reseñas (calificación, cantidad, nuevas, respondidas) | OAuth (`business.manage`) — **todavía no se puede habilitar**: se libera con el allowlist |
| **Google Calendar API** | Calendario: empuja (push) las reuniones agendadas al Google Calendar personal del organizador | OAuth (scope `calendar.events`, conexión **por persona**, no por proyecto — ver `GoogleCalendarConnection`) |

**Redirect URIs registradas en Cloud Console (Google):**
- `https://blisstrackersaas-production.up.railway.app/api/marketing/integrations/google/callback` (producción — GA4/GSC/Ads/YouTube)
- `http://localhost:3001/api/marketing/integrations/google/callback` (desarrollo)
- `https://blisstrackersaas-production.up.railway.app/api/calendar/google/callback` (producción — Google Calendar, conexión personal, callback propio y separado del de arriba)
- `http://localhost:3001/api/calendar/google/callback` (desarrollo)

**Redirect URIs registradas en Meta for Developers (Instagram):**
- `https://blisstrackersaas-production.up.railway.app/api/marketing/integrations/meta/callback` (producción)
- `http://localhost:3001/api/marketing/integrations/meta/callback` (desarrollo)

**Redirect URIs registradas en Meta for Developers:**
- Instagram Business Login: `https://blisstrackersaas-production.up.railway.app/api/marketing/integrations/meta/callback`
- Meta Ads (Facebook Login): `https://blisstrackersaas-production.up.railway.app/api/marketing/integrations/meta-ads/callback`
- Facebook Pages (Facebook Login): `https://blisstrackersaas-production.up.railway.app/api/marketing/integrations/facebook/callback` (scopes `pages_show_list, pages_read_engagement, read_insights` — **App Review pendiente**: NO entraron en la aprobación del 9-nov-2026, que cubrió solo los dos de Instagram y `ads_read`; con System User Token no hace falta esperar)
- (+ variantes `http://localhost:3001/...` para desarrollo)

**Redirect URIs registradas en TikTok for Developers:**
- `https://blisstrackersaas-production.up.railway.app/api/marketing/integrations/tiktok/callback`
- `http://localhost:3001/api/marketing/integrations/tiktok/callback`

**Redirect URIs registradas en LinkedIn Developer Portal:**
- `https://blisstrackersaas-production.up.railway.app/api/marketing/integrations/linkedin/callback`
- `http://localhost:3001/api/marketing/integrations/linkedin/callback`

**OAuth Consent Screen scopes habilitados (Google):** la app OAuth está **publicada en Production** (no en Testing), así que los refresh tokens son permanentes.
- `https://www.googleapis.com/auth/analytics.readonly` — **verificado/aprobado**
- `https://www.googleapis.com/auth/adwords` — **verificación enviada (pendiente de aprobación)**. Alcanza con **Basic Access** del developer token; ya **no** se requiere Standard Access.
- `https://www.googleapis.com/auth/youtube.readonly` — **scope SENSIBLE, pendiente de habilitar/verificar**. Para activar YouTube hay que: (1) habilitar **YouTube Data API v3** en el proyecto de Google Cloud, (2) agregar este scope al consent screen y enviarlo a verificación (mismo trámite que `analytics.readonly`). Mientras no esté verificado, funciona con la cuenta del desarrollador / hasta ~100 usuarios de prueba. El callback es el mismo de Google (`/api/marketing/integrations/google/callback`).
- `https://www.googleapis.com/auth/webmasters.readonly` — Search Console (GSC). Ya está en el consent screen y en uso.
- `https://www.googleapis.com/auth/calendar.events` — **scope SENSIBLE, pendiente de habilitar/verificar** (mismo trámite que `youtube.readonly`). Habilita **Google Calendar API** + agregar el scope al consent screen + enviarlo a verificación. Mientras no esté verificado, la conexión de Calendario solo funciona con la cuenta del desarrollador o testers agregados a mano. Callback **propio**, distinto del resto (`/api/calendar/google/callback`) porque esta es la primera integración de Google **por persona** en vez de por proyecto — ver concepto "Calendario". **Estado al 2026-11-10:** el scope y su justificación ya están cargados en "Acceso a los datos", pero el envío está **trabado por falta del video de demostración** (la consola deshabilita "Confirmar" hasta que se cargue el link de YouTube).
- `https://www.googleapis.com/auth/business.manage` — Google Business Profile (APIs de la tabla de arriba). **Agregado al consent screen el 2026-11-10.** La consola lo clasifica como **no sensible**, así que no necesitaría verificación ni video propio. No existe variante de solo lectura: se usa solo para leer. Lo que bloquea su uso es el **allowlist de Google** (caso de soporte `3-4456000041835`, pedido el 2026-11-10, 7–10 días hábiles); hasta que lo aprueben, las cuotas de las APIs están en 0.

**Verificación de marca** (Información de la marca: home `https://blisstracker.app`, política `https://blisstracker.app/privacidad`, condiciones `https://blisstracker.app/condiciones`): **completa y publicada** (2026-11-10).

**Dos apps de Meta distintas, mismo backend:** Instagram Business Login + Facebook Pages usan una app (`META_APP_ID`/`META_APP_SECRET`); Meta Ads usa **otra app separada** (`META_ADS_APP_ID`/`META_ADS_APP_SECRET`) — `integrations.meta.controller.js` (`getMetaAdsAuthUrl`/`handleMetaAdsCallback`) y `metaAds.service.js` (`getValidFbToken`, refresh de token) son los únicos que leen las variables `META_ADS_*`. Hay que registrar el redirect URI de Meta Ads (`/api/marketing/integrations/meta-ads/callback`) en ESA app, no en la de Instagram.

**Permisos requeridos en Meta App:**
- Instagram Business Login (app `META_APP_ID`): `instagram_business_basic`, `instagram_business_manage_insights` — **aprobados por Meta el 9-nov-2026**. Se aplican al público solo con la app en **Modo en vivo**: en modo desarrollo únicamente autorizan las cuentas con rol en la app, que es lo que mantenía a la conexión oficial como método de respaldo.
- Facebook Login (Meta Ads, app `META_ADS_APP_ID`): `ads_read` — **aprobado por Meta el 9-nov-2026** (requiere además Business Verification). ⚠️ **Verificar en qué app quedó la aprobación**: `getMetaAdsAuthUrl` firma con `META_ADS_APP_ID`, que es una app distinta de la de Instagram, y las tres solicitudes se aprobaron juntas — si `ads_read` cayó en la app de Instagram, el OAuth de Ads sigue sin funcionar hasta re-solicitarlo en la app correcta. Alternativa sin OAuth (y la que está operativa hoy): System User Token generado desde Business Manager → Settings → System Users → Generate Token (Never expiry).
- Notas de implementación Instagram:
  - Usar `instagram.com/oauth/authorize` (NO `facebook.com/dialog/oauth`)
  - Token exchange: POST `api.instagram.com/oauth/access_token`
  - Long-lived token: GET `graph.instagram.com/access_token?grant_type=ig_exchange_token`
  - Todas las llamadas de datos usan `graph.instagram.com/me` (NO `/{user_id}` — da OAuthException code 2)
  - El `user_id` del token exchange es app-scoped; usar el `id` de `/me` como `propertyId`

**Permisos requeridos en TikTok App:**
- `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list` — App Review en curso
- OAuth v2 requiere PKCE obligatorio: `code_verifier` generado con `crypto.randomBytes(32).toString('base64url')`, `code_challenge = base64url(sha256(codeVerifier))`. El `codeVerifier` se almacena en el JWT state (10min) y se recupera en el callback.
- Access tokens duran 24h, refresh tokens duran 365 días. `tiktokTokenRefresh.service.js` renueva automáticamente.

**Permisos requeridos en LinkedIn App (Marketing Developer Platform / Community Management API):**
- Scopes: `r_organization_social` (leer posts y stats) + `rw_organization_admin` (listar páginas administradas + reporting data — es el único scope que LinkedIn ofrece para acceso a páginas; no hay un `r_organization_admin` de solo lectura, aunque acá solo leemos). Configurable por env `LINKEDIN_SCOPES`. Requiere el producto **Community Management API** aprobado en la app.
- Access tokens duran 60 días (5184000 s); refresh tokens duran 365 días. `linkedinTokenRefresh.service.js` renueva silenciosamente con `expiresAt < now + 5min`. Si el refresh falla, la integración se marca como `status: 'expired'` y el frontend muestra prompt de reconexión (`code: TOKEN_EXPIRED`).
- API REST versionada en `https://api.linkedin.com/rest/*` con header `LinkedIn-Version` (constante `LINKEDIN_API_VERSION` en `linkedin.service.js`, default `202601`, overridable por env `LINKEDIN_API_VERSION`; LinkedIn soporta cada versión ~12 meses, actualizar cuando la API la rechace) + `X-Restli-Protocol-Version: 2.0.0`.
- Auto-detección de Company Page: tras OAuth, el callback llama a `/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR`. Si hay 1 sola org, se auto-asigna como `propertyId`; si hay >1, la integración se guarda sin `propertyId` y el frontend muestra un dropdown (`GET /projects/:id/linkedin/orgs`).
- Endpoints utilizados: `/rest/networkSizes/{urn}` (followers), `/rest/organizationPageStatistics` (page views, visitors), `/rest/organizationalEntityShareStatistics` (impressions, clicks, engagement agregado), `/rest/organizationalEntityFollowerStatistics` (demographics: industry, seniority, function, region), `/rest/posts` + batch stats (top posts del mes).

**Token expiry — patrón unificado:**
- Todos los servicios de integración detectan tokens expirados y marcan `ProjectIntegration.status = 'expired'`
- Los controllers devuelven `{ error: '...', code: 'TOKEN_EXPIRED' }` con status HTTP 400 (nunca 401 — evita logout del usuario)
- El frontend detecta `code === 'TOKEN_EXPIRED'` y muestra prompt de reconexión
- `connect-existing` solo reutiliza tokens con `status: 'active'` y `expiresAt > now` — si todos expiraron cae al flujo OAuth completo
- Google tokens: `invalid_grant` → status `expired`, requiere reconectar. La app OAuth está **publicada en Production**, así que los refresh tokens son permanentes (ya no aplica la expiración a 7 días del modo Testing).
- **Propagación de refresh token (incluye `google_ads`), scopeada por cuenta de Google:** al reconectar por OAuth, el callback propaga el refresh token nuevo a las demás integraciones del workspace del mismo grupo. GA4/GSC comparten tokens entre sí (`GOOGLE_LINKED_TYPES`); `google_ads` usa otro scope (`adwords`) pero **el mismo refresh token del usuario de Google**, así que también se propaga a los otros proyectos con `google_ads` conectado (evita que queden con un refresh token viejo → `invalid_grant`). **La propagación está acotada a la MISMA cuenta de Google** (`ProjectIntegration.accountId` = `sub` del id_token; `accountEmail` informativo): así, con **2 cuentas de Google distintas en el mismo workspace** (ej. `cuenta1@gmail` para `cuenta1.com` y `cuenta2@gmail` para `cuenta2.com`), reconectar una **no pisa** el token de la otra. Para conocer la cuenta se piden los scopes de identidad `openid email` (en `getAuthUrl`, no se persisten como scopes de la integración); el `id_token` se decodifica en el callback (`jwt.decode`, viene directo de Google sobre TLS). **Si no se conoce la cuenta (sin id_token) NO se propaga** — mejor no propagar que pisar la cuenta equivocada. **Integraciones legacy** (creadas antes de este cambio) tienen `accountId = null` y quedan fuera de la propagación hasta reconectarse una vez. Migración `add_integration_account` (`ProjectIntegration.accountId` + `accountEmail` + índice `[workspaceId, type, accountId]`).
- **Cambiar de Customer ID bajo el mismo Manager NO requiere reconectar:** el token es del usuario/manager de Google, no por cuenta cliente. `updateIntegration` conserva los tokens y, si la integración estaba `expired`, la reactiva a `active` al cambiar el `customerId`/`propertyId`. El error de "token expirado" (`TOKEN_EXPIRED`) solo se devuelve cuando el *refresh* falla con `invalid_grant`; los errores de permiso/cuenta de la Google Ads API se devuelven como `PERMISSION_DENIED`/`NOT_FOUND` con su propio mensaje (no se confunden con expiración de token).

