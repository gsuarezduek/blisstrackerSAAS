# Proyecto Vercel: el sitio público

Este directorio es el **Root Directory** del proyecto de Vercel que sirve el sitio
público. Framework: Next.js (App Router), detectado automáticamente.

## Dominios

| Host | Qué sirve |
|---|---|
| `blisstracker.app` | El sitio público. **Dominio canónico.** |
| `www.blisstracker.app` | Asignado acá, pero `proxy.js` lo manda con 301 al apex. |

Los dos se asignan a este proyecto de forma **explícita**. `app.blisstracker.app` y
`*.blisstracker.app` son del proyecto de la app (`frontend/`): en Vercel un dominio
exacto le gana al wildcard, también entre proyectos distintos, así que `www` acá convive
con el `*.blisstracker.app` de allá.

**Importante al asignar el apex:** agregarlo como dominio normal, **sin** marcar
"Redirect to www". El 301 lo emite `proxy.js`, porque la config de dominios de Vercel y
`redirects()` de Next devuelven 308 y el requisito es 301.

## Variables de entorno

Las tres primeras son obligatorias en producción (ver `docs/claude/env-vars.md`):

- `NEXT_PUBLIC_API_URL` — el backend en Railway. De ahí sale **todo** el contenido
  (landing, precios, legales, blog). Si falta, el sitio compila con el copy de respaldo
  de `lib/landingDefaults.js` y el blog queda vacío.
- `NEXT_PUBLIC_SITE_URL` — `https://blisstracker.app`. Define los canonicals, los OG, el
  sitemap y el llms.txt.
- `NEXT_PUBLIC_APP_URL` — `https://app.blisstracker.app`. A dónde apuntan "Ingresar" y
  "Probar gratis", y el destino de los 301 de rutas de app.
- `REVALIDATE_SECRET` — el mismo valor que en el backend. Sin ella `/api/revalidate`
  responde 503 y el sitio sólo se actualiza por ISR.
- `NEXT_PUBLIC_GA_ID` — opcional; si falta usa la propiedad actual.

## Cosas a tener en cuenta

- El build **lee la API**: `generateStaticParams` del blog y el sitemap piden los posts
  publicados. Si el backend está caído durante el build, el sitio sale igual pero sin
  artículos — se completan solos en la primera revalidación.
- Next cachea los fetch en `.next/cache` **entre builds**. Un build hecho dentro de la
  ventana de ISR puede reusar una respuesta vieja: si hace falta forzar contenido fresco,
  "Redeploy" sin caché, o pegarle a `/api/revalidate`.
- `images.remotePatterns` se arma desde `NEXT_PUBLIC_API_URL` (`next.config.mjs`): las
  portadas del blog se sirven desde el backend. Si cambia el host del backend, no hay
  nada que tocar a mano.
