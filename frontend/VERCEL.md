# Proyecto Vercel: la app (SPA)

Este directorio es el **Root Directory** del proyecto de Vercel que sirve la app.

## Dominios

| Host | Qué sirve |
|---|---|
| `app.blisstracker.app` | Login central, registro, selector de workspace. Asignación **explícita**. |
| `*.blisstracker.app` | Los workspaces de las agencias (`blissmkt.blisstracker.app`) y su `/superadmin`. |

`blisstracker.app` y `www.blisstracker.app` **no** son de este proyecto: los sirve el
proyecto del sitio público (carpeta `web/`). En Vercel un dominio exacto le gana al
wildcard, también entre proyectos distintos, así que `www` asignado a `web/` convive con
el `*.blisstracker.app` de acá.

## Qué hace el vercel.json

- **rewrites** — `/report/:token` pasa por la función `api/report-og.js`, que inyecta el
  Open Graph del informe para los scrapers (WhatsApp y compañía no ejecutan JS). El
  resto va a `index.html`, que es como se sirve una SPA. El rewrite del blog se fue
  junto con el blog.
- **redirects** — las URLs públicas que **antes** respondía esta SPA ahora viven en el
  sitio público: se devuelven con 301 al apex. Van condicionados por `host` a
  `app.blisstracker.app` a propósito: sin esa condición, `/` matchearía también en los
  subdominios de workspace y mandaría a la landing a gente que quiere su Dashboard.
- **headers** — `X-Robots-Tag: noindex` para todo. Es la contraparte del `Disallow: /`
  de `public/robots.txt`, y es la que vale cuando un crawler llega a una URL directo.

## Variables de entorno

`VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_APP_DOMAIN` (opcional) y `VITE_APP_HOST`.
`VITE_API_URL` tiene que estar disponible también en **runtime de Functions**, no sólo
en build: `api/report-og.js` la usa para pegarle al backend.
