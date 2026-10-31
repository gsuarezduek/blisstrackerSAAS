/**
 * Verifica contra R2 REAL los tres supuestos de las URLs firmadas de la Nube
 * (ver "Nube del proyecto — cómo salen los bytes y las miniaturas" en
 * CLAUDE.md). Los tests de la suite mockean objectStorage, así que nada de
 * esto está probado de verdad hasta que este script corra:
 *
 *   1. R2 respeta `ResponseContentDisposition` → la descarga DESCARGA en vez
 *      de navegar la página.
 *   2. R2 respeta `ResponseContentType` → el PDF se MUESTRA, con el mimeType
 *      que validamos por magic bytes y no el que declaró el navegador al subir.
 *   3. R2 sirve `Range` en una URL firmada → el video arranca con los primeros
 *      bytes en vez de bajarse entero (el punto de todo el cambio).
 *
 * Es de solo lectura: no sube, no borra, no modifica nada. Elige archivos ya
 * existentes (el video y el PDF más recientes) y les pide unos KB.
 *
 * Uso (las credenciales son las mismas que usa el backend en Railway):
 *   DATABASE_URL=... R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... \
 *   R2_SECRET_ACCESS_KEY=... R2_BUCKET=... R2_PUBLIC_BASE=... \
 *   node scripts/check-signed-urls.js
 *
 * Con un archivo puntual en vez de la búsqueda automática:
 *   FILE_ID=1234 node scripts/check-signed-urls.js
 */

require('dotenv').config()
const prisma = require('../src/lib/prisma')
const objectStorage = require('../src/services/objectStorage.service')

const SIGNED_INLINE_EXPIRES_IN = 60 * 60
const SIGNED_DOWNLOAD_EXPIRES_IN = 15 * 60

const ok   = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`)
const bad  = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`)
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`)

let failures = 0
function check(cond, okMsg, badMsg) {
  if (cond) return ok(okMsg)
  failures++
  bad(badMsg)
}

/** Pide los primeros `bytes` del objeto y devuelve status + headers. */
async function fetchRange(url, bytes = 1024) {
  const res = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` } })
  const body = res.ok || res.status === 206 ? Buffer.from(await res.arrayBuffer()) : null
  return { status: res.status, headers: res.headers, body }
}

async function probe(file, { inline }) {
  const label = inline ? 'inline (preview)' : 'attachment (descarga)'
  console.log(`\n── ${label} · ${file.name} (${file.mimeType}) ──`)

  const url = await objectStorage.presignGet(file.objectKey, {
    expiresIn: inline ? SIGNED_INLINE_EXPIRES_IN : SIGNED_DOWNLOAD_EXPIRES_IN,
    filename: file.name,
    disposition: inline ? 'inline' : 'attachment',
    contentType: file.mimeType || undefined,
  })

  const { status, headers, body } = await fetchRange(url)

  // (3) Range. 206 = R2 devolvió solo el trozo pedido; 200 = mandó todo el
  // archivo, que es exactamente lo que estábamos tratando de evitar.
  check(status === 206, `Range respetado (HTTP 206, ${body?.length ?? 0} bytes)`,
    `Range NO respetado (HTTP ${status}) — el video se bajaría entero antes de reproducirse`)
  const contentRange = headers.get('content-range')
  check(Boolean(contentRange), `Content-Range: ${contentRange}`,
    'Sin Content-Range — el navegador no podría hacer seek')

  // (1) Content-Disposition.
  const cd = headers.get('content-disposition') || ''
  check(cd.startsWith(inline ? 'inline' : 'attachment'),
    `Content-Disposition: ${cd}`,
    `Content-Disposition esperaba "${inline ? 'inline' : 'attachment'}" y vino "${cd || '(vacío)'}" — ` +
    (inline ? 'el preview forzaría una descarga' : 'la descarga navegaría la página en vez de guardar el archivo'))
  if (!inline) {
    check(cd.includes(file.name) || /filename\*?=/.test(cd),
      'El nombre del archivo viaja en el header',
      'El nombre no viaja — el archivo se guardaría con un nombre random')
  }

  // (2) Content-Type: tiene que ser el nuestro (magic bytes), no el que R2
  // tenga guardado del PUT.
  const ct = headers.get('content-type')
  check(ct === file.mimeType, `Content-Type: ${ct}`,
    `Content-Type vino "${ct}" y esperábamos "${file.mimeType}" — ` +
    'el <iframe> del PDF o el <video> podrían no renderizar')

  return url
}

async function main() {
  if (!objectStorage.isConfigured()) {
    console.error('\nR2 no está configurado. Faltan env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ' +
      'R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE.\n')
    process.exit(1)
  }

  const base = { type: 'file', status: 'ready', deletedAt: null, objectKey: { not: null } }
  const pick = (where) => prisma.projectFile.findFirst({
    where: { ...base, ...where },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, mimeType: true, objectKey: true, posterKey: true, sizeBytes: true },
  })

  let targets
  if (process.env.FILE_ID) {
    const one = await pick({ id: Number(process.env.FILE_ID) })
    if (!one) { console.error(`\nNo encontré un archivo ready con id ${process.env.FILE_ID}.\n`); process.exit(1) }
    targets = [one]
  } else {
    targets = [
      await pick({ mimeType: { startsWith: 'video/' } }),
      await pick({ mimeType: 'application/pdf' }),
    ].filter(Boolean)
  }

  if (targets.length === 0) {
    console.error('\nNo hay videos ni PDFs en la Nube para probar. Subí uno, o pasá FILE_ID=<id>.\n')
    process.exit(1)
  }

  console.log(`\nBucket: ${process.env.R2_BUCKET} · ${targets.length} archivo(s) a probar`)

  const lastUrls = []
  for (const file of targets) {
    lastUrls.push({ file, url: await probe(file, { inline: false }) })
    await probe(file, { inline: true })

    // Miniatura: no es parte de los tres supuestos, pero si el archivo es
    // posterior al cambio debería tenerla, y se sirve por URL pública.
    if (file.posterKey) {
      const res = await fetch(objectStorage.publicUrl(file.posterKey))
      check(res.ok, `Miniatura accesible (${res.headers.get('content-type')})`,
        `La miniatura existe en la fila pero no se puede leer (HTTP ${res.status})`)
    } else {
      warn('Sin miniatura — se subió antes del cambio, o el browser no pudo generarla')
    }
  }

  console.log('\n' + '─'.repeat(60))
  if (failures === 0) {
    console.log('\x1b[32mLos tres supuestos se cumplen.\x1b[0m Queda probar en el navegador lo que esto no ve:')
  } else {
    console.log(`\x1b[31m${failures} chequeo(s) fallaron.\x1b[0m Mirá arriba qué rompería cada uno. Igual conviene probar en el navegador:`)
  }
  console.log('  · que el botón Descargar abra el diálogo de guardado y NO navegue la página')
  console.log('  · que un video arranque en 1-2s y que el seek salte sin recargar')
  console.log('  · que al subir un video aparezca su miniatura (probá también en Safari/iOS)')
  console.log('\nPara abrir una descarga a mano en el navegador (vence en 15 min):')
  for (const { file, url } of lastUrls) console.log(`\n  ${file.name}:\n  ${url}`)
  console.log()
}

main()
  .catch(err => { console.error('\nError inesperado:', err.message, '\n'); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
