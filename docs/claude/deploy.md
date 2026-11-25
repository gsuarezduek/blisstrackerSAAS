# Deploy

> Se movió desde `CLAUDE.md` para que no se cargue en todas las sesiones. Leelo cuando la tarea toque este tema.

- **Backend:** Railway (auto-runs `npm run db:migrate` on deploy; seed must be run manually once). Required env vars: `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_DOMAIN`, `GOOGLE_CLIENT_ID`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `GOOGLE_CLIENT_SECRET`, `ENCRYPTION_KEY`, `BACKEND_URL`, `PAGESPEED_API_KEY`, `META_APP_ID`, `META_APP_SECRET`, `META_ADS_APP_ID`, `META_ADS_APP_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `APIFY_API_TOKEN` (opcional — habilita el scraping de RRSS), `R2_ACCOUNT_ID` + `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` + `R2_BUCKET` + `R2_PUBLIC_BASE` (opcionales — habilitan object storage Cloudflare R2 para las imágenes sociales; sin ellas se guardan como bytes en la DB), `GIPHY_API_KEY` (opcional — habilita el envío de GIFs en el Chat interno; sin ella, el resto del chat funciona igual).
- **PDF de informes (Chromium):** el backend corre `@sparticuz/chromium` (~60 MB) + `puppeteer-core` para `GET .../reports/:month/pdf`. Necesita **Node ≥ 20.11** y memoria libre para Chromium (~300–500 MB por render, uno a la vez). La primera llamada tras un deploy extrae el binario a `/tmp` (unos segundos extra). El contenedor necesita salida a internet (fuentes de Google, emoji de jsDelivr y la propia SPA en Vercel).
- **Scripts de utilidad:** `backend/scripts/` — scripts de uso único para operaciones directas en DB (ej: `insert-meta-ads-token.js`, `create-test-user.js`). Ejecutar con `DATABASE_URL=... ENCRYPTION_KEY=... node scripts/<nombre>.js`.
- **Frontend: DOS proyectos de Vercel sobre el mismo repo**, con *Root Directory* distinto. Detalle de cada uno en `web/VERCEL.md` y `frontend/VERCEL.md`; el por qué de la separación, en `sitio-publico.md`.

  | Proyecto | Root | Dominios | Qué sirve |
  |---|---|---|---|
  | sitio público | `/web` | `blisstracker.app` (canónico) + `www.blisstracker.app` | Landing, precios, soluciones, blog, legales. Next.js App Router con SSR/ISR. |
  | app | `/frontend` | `app.blisstracker.app` + `*.blisstracker.app` | Login central, registro y los workspaces de las agencias (incluido `/superadmin`). SPA. |

  **`www` y `app` se asignan explícitamente**, aunque el wildcard del proyecto de la app
  los matchearía: en Vercel un dominio exacto le gana al wildcard, también entre
  proyectos distintos. Verificar esa asignación **antes** de mover el DNS.

  El `vercel.json` de la app mantiene el rewrite `/report/:token` → `api/report-og.js`
  (Open Graph dinámico por informe) y agrega `X-Robots-Tag: noindex` para todo más los
  301 de las URLs públicas viejas. El del sitio público no existe: las dos redirecciones
  las hace `web/proxy.js` para poder emitir **301** (Vercel y `redirects()` de Next
  emiten 308).

  Env vars de la app: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`. `VITE_API_URL` debe estar
  disponible también en **runtime de Functions** (no solo en build) porque
  `api/report-og.js` la usa para pegarle al backend — en Vercel las env vars aplican a
  Build + Functions salvo que se restrinja el scope; verificar que no esté limitada solo
  a Build. Env vars del sitio público: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`,
  `NEXT_PUBLIC_APP_URL` y `REVALIDATE_SECRET` (ver `env-vars.md`).
- **DNS (Cloudflare):** `A blisstracker.app → Vercel` + `A *.blisstracker.app → Vercel` (wildcard requires Vercel Pro). `www` y `app` entran por el wildcard; lo que decide a qué proyecto va cada uno es la asignación en Vercel, no el DNS.
- **Orden del cutover:** (1) verificar `app.blisstracker.app` en el proyecto de la app; (2) desplegar el sitio público y revisarlo en su URL de Vercel; (3) asignarle `blisstracker.app` y `www`, **quitando** el redirect apex→www que hoy devuelve 307; (4) desplegar la app y el backend con las env nuevas; (5) reenviar el sitemap en Search Console.
- **Backend CORS:** `app.js` allows `*.blisstracker.app` via regex — do not hardcode a single origin.
- **Stripe webhook:** must point to `https://<railway-backend-url>/api/billing/webhook`. Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`. Accepts all events — unhandled ones are silently ignored.
- **`bliss` workspace:** permanently exempt from billing. Set `status = 'active'` via SuperAdmin → Workspaces. No Stripe subscription ever created; cron and webhooks never affect it.
