# LinkedIn Company Page Scraper

Actor de Apify que scrapea **Company Pages públicas de LinkedIn sin login**. Construido para BlissTracker — su output sigue exactamente el shape que espera `normalizeApifyCompany` en el backend (`backend/src/services/socialScrape.service.js`).

## Para qué sirve

- Datos públicos de Company Pages: nombre, descripción, industria, tamaño, headquarters, logo, **followers**.
- Posts recientes (~5 a 10 sin login, hasta `maxPosts`) con texto, **likes / reactions, comments, shares, fecha y URL**.
- Sin login → cero gestión de cuentas baneables.
- Diseñado para encajar como driver del scraping de Company Pages propias y de **competidores** en BlissTracker.

## Lo que NO da

Sin login no es posible obtener: impresiones, clicks, CTR, page views únicos, demographics de followers (industria/seniority/función/región), histórico granular. Para esos datos hace falta la API oficial de LinkedIn (`Marketing Developer Platform`).

## Input

Ver [`INPUT_SCHEMA.json`](INPUT_SCHEMA.json). El actor acepta input tolerante con todas las claves que ya usa el backend de BlissTracker (`identifier`, `companyName`, `company`, `companyUrl`, `urls`, `startUrls`), por lo que **no requiere ningún cambio en `runApifyLinkedin`**.

Ejemplo mínimo:

```json
{
  "identifier": ["microsoft", "bliss-marketing"],
  "maxPosts": 30
}
```

Equivalente con URLs:

```json
{
  "companyUrls": [
    "https://www.linkedin.com/company/microsoft/",
    "https://www.linkedin.com/company/bliss-marketing/"
  ],
  "maxPosts": 30
}
```

## Output

Un item por empresa con shape A (detalle con posts anidados), idéntico al esperado por `normalizeApifyCompany`:

```json
{
  "name": "Microsoft",
  "companyName": "Microsoft",
  "vanityName": "microsoft",
  "universalName": "microsoft",
  "url": "https://www.linkedin.com/company/microsoft/",
  "description": "...",
  "industry": "Software Development",
  "companySize": "10,001+ employees",
  "headquarters": "Redmond, Washington",
  "founded": "1975",
  "websiteUrl": "https://news.microsoft.com",
  "logoUrl": "https://media.licdn.com/.../microsoft-logo",
  "followerCount": 23456789,
  "followersCount": 23456789,
  "postsCount": 12,
  "posts": [
    {
      "urn": "urn:li:activity:7234567890123456789",
      "text": "We're thrilled to announce…",
      "likes": 4321, "comments": 89, "shares": 12,
      "reactionsCount": 4321, "commentsCount": 89, "sharesCount": 12,
      "timestamp": "2026-06-18T15:30:00.000Z",
      "postedAt":  "2026-06-18T15:30:00.000Z",
      "url": "https://www.linkedin.com/feed/update/urn:li:activity:7234.../",
      "image": "https://media.licdn.com/..."
    }
  ]
}
```

Si una empresa falla del todo (404 / bloqueo), el actor pushea `{ error: "...", slug: "..." }`. El backend detecta `item.error` y lo surfacea como `SCRAPE_PROVIDER_ERROR` en lugar de contarlo como "0 datos".

## Costo aproximado (free tier de Apify)

| Volumen | Compute (USD) | Residential proxy | Total |
|---|---|---|---|
| 50 empresas / mes | ~$0.30 | ~$1.50 (≈0.2 GB) | **~$1.80** |
| 200 empresas / mes | ~$1.20 | ~$6 (≈0.8 GB) | **~$7** |

Apify regala $5 USD mensuales de plataforma a free tier. Para volúmenes de competidores típicos entra holgado.

## Deploy paso a paso

### 1. Instalar la Apify CLI

```bash
npm install -g apify-cli
apify --version   # confirmar instalación
```

### 2. Login

```bash
apify login
```

Te va a pedir tu **API token** (lo encontrás en https://console.apify.com/account/integrations).

### 3. Push del actor desde este folder

```bash
cd apify-actors/linkedin-company-scraper/
apify push
```

La primera vez te va a preguntar si querés crear un actor nuevo — decile que **sí**. Una vez creado, los próximos `apify push` actualizan ese mismo actor.

Apify hace el build de la imagen Docker (~3-5 minutos la primera vez). Cuando termine, el actor queda visible en https://console.apify.com/actors con un nombre tipo `tu-usuario/linkedin-company-scraper`.

### 4. Configurar el actor en BlissTracker

Como SuperAdmin, andá a **SuperAdmin → Configuración → Operativo → "Actor de Apify para LinkedIn"** y pegá el ID del actor en formato `tu-usuario/linkedin-company-scraper` (o `tu-usuario~linkedin-company-scraper`, ambos se aceptan).

Opcionalmente subí `apifyLinkedinPostsLimit` si querés más de 30 posts por scrape.

### 5. Probar end-to-end

Andá a un proyecto → **Marketing → RRSS → LinkedIn → "Conectar por scraping"** (o **Competidores → "Agregar LinkedIn"**). Si trae datos, listo. Si vuelve vacío, abrí el "🔍 Diagnóstico" del proyecto — vas a ver el output crudo de Apify y lo normalizado.

## Iterar localmente

Para probar cambios sin pushear:

```bash
cd apify-actors/linkedin-company-scraper/
npm install
apify run -p           # corre con Apify Proxy (necesita login)
```

El output queda en `storage/datasets/default/`. Los logs te muestran qué empresa devolvió qué.

Para iterar sólo sobre la lógica de extracción sin levantar el crawler, podés correr `node src/main.js` con un `INPUT.json` en `storage/key_value_stores/default/INPUT.json`.

## Mantenimiento

LinkedIn cambia los selectors HTML cada **3-6 meses** y el extractor empieza a devolver `followerCount=0` o posts vacíos. Cuando pase:

1. Abrí una Company Page conocida en el browser → inspeccioná los selectors que cambiaron.
2. Editá `src/extract.js` (`extractCompanyProfile` o `extractCompanyPosts`) — los selectors están agrupados al inicio de cada función.
3. `apify push` y listo.

Los selectors están escritos con **múltiples fallbacks** (`a, b, c, d`) para sobrevivir cambios menores. El campo más sensible es `followerCount` (a veces LinkedIn cambia el formato del label "followers" a "members" o agrega `~`).

## Notas de anti-bot

- **Proxies**: forzado a residential. Los datacenter están bloqueados.
- **Concurrency**: capada a 4 simultáneos (default).
- **Delays**: aleatorios entre 1× y 2× `minRequestDelayMs` (default 2s) → ~2-4s entre requests.
- **Fingerprints**: Crawlee rota fingerprints (Chrome desktop en Windows/macOS, locales EN).
- **Login modal**: si aparece, se cierra automáticamente. El contenido visible debajo igualmente es suficiente para extraer los datos.

Si LinkedIn empieza a bloquear (HTTP 999 o redirige a `/uas/login`), subí `minRequestDelayMs` y bajá `maxConcurrency`.
