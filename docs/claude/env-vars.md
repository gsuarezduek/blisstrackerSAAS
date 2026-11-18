# Variables de entorno

> Se movió desde `CLAUDE.md` para que no se cargue en todas las sesiones. Leelo cuando la tarea toque este tema.

## Backend (`backend/.env`)

```
DATABASE_URL=postgresql://user:pass@localhost:5432/team_tracker
JWT_SECRET=<long random string>
RESEND_API_KEY=re_xxxx
EMAIL_FROM=BlissTracker <noreply@blisstracker.app>
APP_DOMAIN=blisstracker.app
FRONTEND_URL=http://localhost:5173
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...              # client secret del OAuth app de Google Cloud
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...                  # (opcional, prototipo) habilita Whisper para "Resumen automático (prueba)" en Reuniones del proyecto. Sin ella, POST .../meetings/:mid/transcribe-test devuelve 503
STRIPE_SECRET_KEY=sk_live_...          # o sk_test_... en desarrollo
STRIPE_WEBHOOK_SECRET=whsec_...        # secret del webhook en Stripe Dashboard
STRIPE_PRICE_ID=price_...             # ID del precio por seat/mes en Stripe
ENCRYPTION_KEY=<64 chars hex>         # AES-256-GCM key para cifrar tokens OAuth en DB (node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
BACKEND_URL=https://blisstrackersaas-production.up.railway.app  # URL pública del backend (para construir redirect URI de OAuth)
PAGESPEED_API_KEY=...                 # Google Cloud API Key con acceso a PageSpeed Insights API
SERP_API_KEY=...                      # SerpAPI key (serpapi.com) — SERP snapshots, features y competidores
AHREFS_API_KEY=...                    # API key v3 de Ahrefs (gratis, Account settings → API keys). El endpoint de Domain Rating la exige desde ago 2026; sin ella "Actualizar DR" responde 503
GIPHY_API_KEY=...                     # (opcional) API key gratuita de Giphy (developers.giphy.com) — habilita el envío de GIFs en el Chat interno. Sin ella, GET /api/chat/gifs/search y /trending devuelven 503 GIFS_NOT_CONFIGURED; el resto del chat funciona igual
META_APP_ID=...                       # App ID de Meta usada por Instagram Business Login y Facebook Pages (Meta for Developers)
META_APP_SECRET=...                   # App Secret de esa misma app
META_ADS_APP_ID=...                   # App ID de Meta usada SOLO por Meta Ads (Facebook Login + ads_read) — es una app de Meta distinta a la de arriba
META_ADS_APP_SECRET=...               # App Secret de esa app de Ads
TIKTOK_CLIENT_KEY=...                 # TikTok App Client Key (TikTok for Developers)
TIKTOK_CLIENT_SECRET=...              # TikTok App Client Secret
LINKEDIN_CLIENT_ID=...                # LinkedIn App Client ID (developer.linkedin.com)
LINKEDIN_CLIENT_SECRET=...            # LinkedIn App Client Secret
LINKEDIN_API_VERSION=...              # (opcional) versión de la API REST de LinkedIn (YYYYMM). Default 202601. LinkedIn soporta cada versión ~12 meses; actualizá si la API rechaza la versión
LINKEDIN_SCOPES=...                   # (opcional) scopes OAuth separados por espacio. Default "r_organization_social r_organization_admin". Cambialo si la pestaña Auth de tu app lista otros nombres exactos (ej. rw_organization_admin)
APIFY_API_TOKEN=apify_api_...         # Token de Apify (apify.com) para scraping de RRSS. Sin esto, el scraping devuelve SCRAPE_NOT_CONFIGURED
APIFY_API_TOKEN2=apify_api_...        # (opcional) token de respaldo, misma cuenta u otra cuenta de Apify. Si APIFY_API_TOKEN falla (HTTP error o dataset sin crédito), se reintenta con este antes de fallar
APIFY_API_TOKEN3=apify_api_...        # (opcional) 2° token de respaldo, mismo mecanismo, probado después de APIFY_API_TOKEN2
APIFY_API_TOKEN4=apify_api_...        # (opcional) 3° token de respaldo, mismo mecanismo, probado después de APIFY_API_TOKEN3
APIFY_INSTAGRAM_ACTOR=...             # (opcional) actor de Apify para Instagram. FALLBACK del PlatformSetting `apifyInstagramActor` (editable desde SuperAdmin → Configuración, que tiene prioridad). Si ambos vacíos → default oficial apify~instagram-profile-scraper
APIFY_INSTAGRAM_POSTS_LIMIT=60        # (opcional) posts recientes a traer por scrape. FALLBACK del PlatformSetting `apifyInstagramPostsLimit` (>0 tiene prioridad). Default 60 — debe cubrir el mes completo; subir para cuentas muy activas
APIFY_INSTAGRAM_POSTS_ACTOR=...       # (opcional) actor de la 2ª llamada de Instagram (lista completa de posts). FALLBACK del PlatformSetting `apifyInstagramPostsActor` (que tiene prioridad). El actor de perfil (apify~instagram-profile-scraper) trae un `latestPosts` capado (~12) y desordenado → en cuentas activas se pierden posts del mes; con este actor se hace una 2ª llamada que trae la lista completa y ordenada y se fusiona con la del perfil (dedup por id). Vacío en ambos = no hay 2ª llamada (comportamiento anterior). Recomendado `apify~instagram-post-scraper`. Costo Apify ~2x por scrape de IG (incluye competidores). "none"/"off" = desactivar explícito
APIFY_LINKEDIN_ACTOR=...             # actor de Apify para Company Pages de LinkedIn. FALLBACK del PlatformSetting `apifyLinkedinActor` (editable desde SuperAdmin → Configuración, que tiene prioridad). Sin el setting NI la env → SCRAPE_NOT_CONFIGURED. El normalizador tolera varios shapes de actor; si tu actor usa otras claves de input/output, el punto único de ajuste es runApifyLinkedin/normalizeApifyCompany en socialScrape.service.js
APIFY_LINKEDIN_POSTS_LIMIT=30        # (opcional) posts recientes a traer por scrape de LinkedIn. FALLBACK del PlatformSetting `apifyLinkedinPostsLimit` (>0 tiene prioridad). Default 30 — las empresas postean menos que IG
APIFY_FACEBOOK_ACTOR=...             # actor de Apify para Páginas de Facebook. FALLBACK del PlatformSetting `apifyFacebookActor` (editable desde SuperAdmin → Configuración, que tiene prioridad). Sin el setting NI la env → SCRAPE_NOT_CONFIGURED. El punto único de ajuste de claves de input/output es runApifyFacebook/normalizeApifyFacebook en socialScrape.service.js
APIFY_FACEBOOK_POSTS_LIMIT=30        # (opcional) posts recientes a traer por scrape de Facebook. FALLBACK del PlatformSetting `apifyFacebookPostsLimit` (>0 tiene prioridad). Default 30
APIFY_FACEBOOK_POSTS_ACTOR=...       # (opcional) actor de la 2ª llamada de Facebook (los POSTS de la página). FALLBACK del PlatformSetting `apifyFacebookPostsActor` (que tiene prioridad). El actor de Páginas (`apify~facebook-pages-scraper`) devuelve SOLO la ficha — seguidores, categoría, teléfono, horarios — y ningún post, así que sin esto `postsThisMonth`/engagement quedan en 0 por falta de datos. Recomendado `apify~facebook-posts-scraper`. Vacío en ambos = no hay 2ª llamada. Costo Apify ~2x por scrape de FB (los competidores NO la corren, `skipPostsActor`). "none"/"off" = desactivar explícito
R2_ACCOUNT_ID=...                    # (opcional) Cloudflare R2: account id (subdominio del endpoint S3). Las 5 R2_* habilitan object storage para SocialImage; sin ellas, las imágenes se guardan como bytes en la DB (modo legacy). Ver concepto "Object storage de imágenes sociales (Cloudflare R2)"
R2_ACCESS_KEY_ID=...                 # (opcional) credencial S3 del bucket (R2 API Token)
R2_SECRET_ACCESS_KEY=...             # (opcional) secret de la credencial S3
R2_BUCKET=...                        # (opcional) nombre del bucket
R2_PUBLIC_BASE=https://cdn.blisstracker.app  # (opcional) URL pública base del bucket SIN slash final (dominio propio recomendado, o el dominio r2.dev del bucket)
PDF_RENDER_BASE_URL=...                # (opcional) URL base de la SPA que abre Chromium para generar el PDF del informe. Default: https://<slug>.<APP_DOMAIN> en producción, FRONTEND_URL en desarrollo
CHROME_PATH=...                       # (opcional, desarrollo) ruta al Chrome local para el PDF del informe. Default: Google Chrome de macOS/Windows; en Linux se usa el binario de @sparticuz/chromium
MCP_TOKEN=...                          # (legacy, opcional) solo para migrar en caliente el token de la v1 de un solo workspace/usuario — ver concepto "MCP (Grok) — integración". Las altas nuevas van por Preferencias → Agentes IA (self-service) o scripts/mcp-create-token.js, no por env vars
MCP_WORKSPACE_SLUG=...                 # (legacy, opcional) workspace del token legacy de arriba
MCP_USER_EMAIL=...                     # (legacy, opcional) usuario del token legacy de arriba
```

## Frontend (`frontend/.env.development`)

```
VITE_API_URL=http://localhost:3001
VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
```
