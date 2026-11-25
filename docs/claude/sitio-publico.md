# Sitio público (`web/`)

> Se separó de la app en noviembre de 2026. Leelo cuando la tarea toque la landing, las
> páginas de producto, los precios, los legales, el blog o los dominios.

## Por qué existe

La landing, las páginas de producto, los legales y el blog vivían dentro de la SPA
(`frontend/`). El HTML que servía Vercel era `frontend/index.html`: un `<div id="root">`
vacío con un `<title>`, una meta description y un `<link rel="canonical">` **iguales para
todas las rutas**. Consecuencias concretas:

- Google recibía ~5 palabras por página; el contenido aparecía recién al ejecutar JS.
- El canonical de la home se repetía en cada URL, así que ninguna otra podía rankear.
- `<Route path="*" element={<Navigate to="/" />}` hacía que **toda** URL inexistente
  respondiera 200 con la landing (soft 404).
- Para ver el hero había que descargar el bundle de toda la app: LCP 5,0 s en móvil.

Un sitio público y una app de trabajo piden cosas opuestas (primera visita instantánea y
legible sin JS vs. navegación sin recargas una vez dentro). Separarlas no agrega
complejidad: deja de pedirle a cada parte algo que no le corresponde.

## Qué sirve cada host

| Host | Proyecto Vercel | Qué sirve |
|---|---|---|
| `blisstracker.app` | `web/` (Next) | Sitio público, SSR/ISR. **Dominio canónico.** |
| `www.blisstracker.app` | `web/` (Next) | 301 al apex (`web/proxy.js`). |
| `app.blisstracker.app` | `frontend/` (SPA) | Login central, registro, selector de workspace. |
| `*.blisstracker.app` | `frontend/` (SPA) | Workspaces de agencias + `/superadmin`, igual que antes. |

En Vercel **un dominio exacto le gana al wildcard**, también entre proyectos distintos:
por eso `www` y `app` se asignan explícitamente y el `*.blisstracker.app` sigue en el
proyecto de la SPA. Detalle de deploy: `deploy.md`. Cada proyecto tiene su nota al lado
del código: `web/VERCEL.md` y `frontend/VERCEL.md`.

El apex **no** cambió a `www` a propósito: ahí ya estaban el sitemap, el llms.txt, los OG,
los mails y —lo que más pesa— las URLs de privacidad y condiciones que Google verificó
para el OAuth. Mover el canónico habría obligado a re-verificar todo eso.

## Estructura

```
web/
  app/
    layout.jsx            <html lang="es">, favicons, GA con next/script, links rel=privacy-policy
    page.jsx              /                     landing
    pricing/              /pricing
    contacto/             /contacto
    soluciones/{marketing,eos,ventas}/
    blog/                 /blog
    blog/pagina/[n]/      /blog/pagina/2…       (la 1 vive en /blog; /blog/pagina/1 da 404)
    blog/[slug]/          /blog/:slug
    condiciones/ privacidad/ eliminar-datos/
    not-found.jsx         404 real
    sitemap.js robots.js llms.txt/route.js
    api/revalidate/       webhook de revalidación on-demand
  components/             landing/, blog/, legal/, pricing/, contacto/, BlissLogo, JsonLd
  lib/                    api, urls, seo, pageMeta, blog, landingDefaults, pricingData,
                          solutionsData, moduleCatalog, appRoutes, analytics
  proxy.js                las dos redirecciones 301
  tests/                  metadata, appRoutes, seo, blog
```

## De dónde sale el contenido

**Nada del copy vive en el código del sitio.** Todo se edita desde SuperAdmin y el sitio
lo lee en el server con ISR:

| Página | Endpoint | Modelo |
|---|---|---|
| `/` | `/api/landing/content`, `/api/landing/trusted-companies`, `/api/landing/testimonials` | `LandingContent` + logos/testimonios |
| `/`, `/pricing` | `/api/public/pricing` | `PlatformSetting` |
| `/condiciones`, `/privacidad` | `/api/legal/:docKey` | `LegalDocument` |
| `/blog`, `/blog/:slug` | `/api/public/blog` | `BlogPost` |

`lib/landingDefaults.js` guarda el copy de respaldo si la API no contesta durante el
build — es copia del `CONTENT_DEFAULTS` de la SPA, que a su vez refleja el del backend
(`landing.controller.js`). **Si cambia un default, cambia en los dos lados.**

El blog **no es Markdown ni MDX**: son filas de `BlogPost` con `contentHtml` de Tiptap,
portada en bytes y contador de vistas, editadas en SuperAdmin → Landing → Blog. El
artículo de ejemplo se carga con `backend/scripts/seed-blog-example.js`.

### Revalidación

`export const revalidate` por página (5 min el blog, 10 min landing y precios, 1 h los
legales) **más** aviso on-demand: `backend/src/services/revalidateSite.service.js` pega a
`POST <sitio>/api/revalidate` con `REVALIDATE_SECRET` después de cada escritura exitosa
en SuperAdmin. No se llama desde cada controlador: se monta como middleware
(`revalidateAfter`) sobre los cuatro grupos de rutas en `routes/superadmin.routes.js`, así
un endpoint nuevo no se olvida de avisar. Es best-effort: si falla, el ISR actualiza igual
más tarde.

## SEO: dónde está cada cosa

- **`lib/pageMeta.js`** — title y description de cada página pública, en un solo lugar.
  La description va de **150 a 160 caracteres** y `tests/metadata.test.js` lo verifica,
  igual que que no haya dos rutas con el mismo title.
- **`lib/seo.js`** — `buildMetadata()` (canonical absoluto propio, OG, Twitter Card) y los
  JSON-LD: `Organization`, `SoftwareApplication`, `BlogPosting`, `BreadcrumbList`.
  `FAQPage` lo arman las páginas que tienen FAQ.
- **`components/JsonLd.jsx`** — inyecta los schemas. Está en components y no en lib para
  que `lib/seo.js` quede sin JSX y lo pueda importar un test.
- **Los FAQ usan `<details>` nativo**, no un acordeón con `useState`. No es estilo: en la
  SPA la respuesta de un item cerrado no se renderizaba, así que el texto de las 15
  respuestas **no existía en el HTML**. Con `<details>` están siempre, sin JS, y se gana
  teclado y "buscar en la página".
- **Un solo `<h1>` por página**, y el `<html lang="es">` lo pone el layout.

## Performance

- Server components por defecto; `'use client'` sólo en lo que necesita interacción: menú
  de mobile, typewriter del hero, play del video, carruseles, calculadora de precios,
  formulario de contacto y los wrappers de analítica (`TrackedLink`, `TrackPageView`).
- **Sin fuentes web.** No se trae el `@import` de seis familias manuscritas de Google
  Fonts que tiene `frontend/src/index.css` (son del Wiki y los Docs de la app). Si alguna
  vez hace falta una, va con `next/font`, que ya aplica `font-display: swap`.
- El video de demo es una **miniatura con botón de play**; el iframe de YouTube (~1 MB de
  JS) se carga al click.
- Las portadas del blog pasan por `next/image` (WebP + tamaño por viewport). Los logos
  SVG van como `<img>` con width/height: ya pesan lo mínimo y `next/image` no los
  optimiza, pero las dimensiones evitan que se mueva el layout.

## Redirecciones (`web/proxy.js`)

Dos, las dos con **301** (`NextResponse.redirect(url, 301)`; `redirects()` de Next y la
config de dominios de Vercel emiten 308):

1. **Rutas de la app → `app.blisstracker.app`.** La lista está en `lib/appRoutes.js` y es
   **explícita, no un catch-all**: si cualquier URL desconocida redirigiera, se volvería
   al soft 404 que esto vino a arreglar. Lo que no está en la lista y no es una página
   pública, es un 404 de verdad.
2. **`www` → apex.**

El orden importa: una ruta de la app pedida en `www` sale derecho a la app, en un solo
salto.

`lib/appRoutes.js` tiene tres grupos y el por qué de cada uno: autenticación y alta
(el login central y el `/join` de las invitaciones estaban armados sobre el dominio raíz
y esos links ya están en casillas de gente), páginas públicas con token que el backend
arma sobre el raíz (la **baja de mailing** viaja en cada campaña enviada) y rutas privadas
(marcadores viejos).

## Qué cambió en la app y en el backend

**`frontend/` (la SPA)** — se fueron `Landing`, `Pricing`, `Blog`, `BlogPost`,
`Solution{Marketing,Eos,Ventas}`, `Contact`, `TermsPage`, `DataDeletion`,
`components/landing/`, `hooks/{useTypewriter,usePublicPricing}` y `api/blog-og.js`.
Además:
- `RootPage` ya no muestra la landing cuando el host no es un workspace: va al login
  central. El `"*"` muestra `NotFoundScreen` en vez de redirigir a `/`.
- `index.html` lleva `robots: noindex`, title neutro y los links legales absolutos al
  sitio público. Sin GA (vive en el sitio público) y sin el footer-fallback para crawlers.
- `public/robots.txt` es `Disallow: /`, y `vercel.json` manda `X-Robots-Tag: noindex`
  para todo + los 301 de las URLs públicas viejas (condicionados por `host`, para no
  tocar la raíz de los subdominios de workspace, que es el Dashboard).
- `utils/domain.js` expone **`appHost()`**: el host de la app, usado por el rebote al
  login central (`Login2.jsx`) y por el popup de OAuth de `MyProfile.jsx`.
  `RESERVED_SLUGS` ya incluía `www` y `app`, así que `app.blisstracker.app` nunca se
  interpretó como un workspace.

**`backend/`** — nuevo **`src/lib/publicUrls.js`**, criterio único de las tres bases:
`siteUrl()` (sitio público), `appUrl()` (la app) y `workspaceUrl(slug)` (el subdominio de
la agencia), más `oauthReturnBase(slug)` para los retornos de OAuth. Reemplazó las URLs
armadas a mano sobre el dominio raíz en las invitaciones, el mailing, los mails de
verificación y reset, y los `/oauth-result` de las integraciones. Env nuevas: `APP_URL`,
`SITE_URL` y `REVALIDATE_SECRET` (las tres opcionales, con respaldo) — ver `env-vars.md`.
El **CORS no se tocó**: `lib/corsOrigins.js` ya aceptaba cualquier subdominio de
`APP_DOMAIN` más el apex.

## Correr el sitio en local

```bash
cd web && npm install
NEXT_PUBLIC_API_URL=http://localhost:3001 npm run dev    # puerto 3000
npm run test:run                                          # Vitest
```

La SPA sigue en `localhost:5173` y los workspaces en `<slug>.localhost:5173`. En local el
login central sigue siendo `localhost` pelado, no `app.localhost`.
