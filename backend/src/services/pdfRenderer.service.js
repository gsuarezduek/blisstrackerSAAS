// Render de una URL a PDF con Chromium sin interfaz (puppeteer-core).
//
// - En Linux (Railway) usa el binario de @sparticuz/chromium: una build de Chromium
//   pensada para contenedores mínimos (trae sus propias libs), así no dependemos de
//   paquetes del sistema.
// - En desarrollo (macOS/Windows) ese binario no corre: se usa el Chrome instalado
//   (o el que indique CHROME_PATH).
//
// Un render a la vez (cola en memoria): Chromium consume cientos de MB y el resto del
// backend comparte el proceso. Cada render abre y cierra su propio navegador.

const puppeteer = require('puppeteer-core')

const RENDER_TIMEOUT_MS = 60_000   // tope total por PDF
const READY_TIMEOUT_MS  = 45_000   // tope para que la página avise "lista para imprimir"

const LOCAL_CHROME_PATHS = {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  win32:  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
}

let queue = Promise.resolve()

class PdfRenderError extends Error {
  constructor(message, code = 'PDF_RENDER_FAILED') {
    super(message)
    this.code   = code
    this.status = 502
  }
}

async function launchBrowser() {
  const localPath = process.env.CHROME_PATH || LOCAL_CHROME_PATHS[process.platform]
  if (localPath) {
    return puppeteer.launch({ executablePath: localPath, headless: true, args: ['--no-sandbox'] })
  }
  // @sparticuz/chromium solo extrae las librerías de sistema que Chromium necesita
  // (nss, etc.) y las agrega a LD_LIBRARY_PATH cuando cree estar en AWS Lambda / AL2023.
  // Railway es un Linux genérico sin esas libs, así que le hacemos creer que sí mientras
  // se importa y extrae el binario. Ese runtime es la variable que menos efectos
  // colaterales tiene (el SDK de AWS no la mira).
  const hadRuntimeFlag = process.env.AWS_LAMBDA_JS_RUNTIME !== undefined
  if (!hadRuntimeFlag) process.env.AWS_LAMBDA_JS_RUNTIME = 'nodejs22.x'
  try {
    // Import dinámico: el paquete es ESM-only en versiones recientes y el backend es CommonJS
    const { default: chromium } = await import('@sparticuz/chromium')
    return await puppeteer.launch({
      executablePath: await chromium.executablePath(),
      args:           chromium.args,
      headless:       'shell',
    })
  } finally {
    if (!hadRuntimeFlag) delete process.env.AWS_LAMBDA_JS_RUNTIME
  }
}

async function renderOnce(url, { readyFlag, holder }) {
  const browser = await launchBrowser()
  holder.browser = browser
  try {
    const page = await browser.newPage()
    await page.emulateMediaType('print')

    // Un error de la página de impresión (token vencido, informe borrado) se propaga
    // como error de render en vez de terminar en un PDF con un cartel de "no disponible".
    await page.goto(url, { waitUntil: 'networkidle0', timeout: READY_TIMEOUT_MS })
    await page.waitForFunction(
      `window.${readyFlag} === true || !!window.${readyFlag}_ERROR`,
      { timeout: READY_TIMEOUT_MS },
    )
    const pageError = await page.evaluate(`window.${readyFlag}_ERROR || null`)
    if (pageError) throw new PdfRenderError(String(pageError), 'PDF_PAGE_ERROR')

    // El tamaño de página y los márgenes los define el CSS de la vista (@page), así el
    // pie con número de página y la portada a sangre salen del propio documento.
    const pdf = await page.pdf({
      preferCSSPageSize: true,
      printBackground:   true,
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close().catch(() => {})
  }
}

/**
 * Renderiza `url` a PDF y devuelve el Buffer.
 * La página debe setear `window.<readyFlag> = true` cuando terminó de cargar datos e
 * imágenes (o `window.<readyFlag>_ERROR = 'mensaje'` si falló).
 */
function renderUrlToPdf(url, { readyFlag = '__PDF_READY__' } = {}) {
  const job = queue.then(() => new Promise((resolve, reject) => {
    const holder = { browser: null }
    // Al vencer el tiempo se cierra el navegador: si no, seguiría vivo ocupando memoria
    // mientras arranca el próximo render de la cola.
    const timer = setTimeout(() => {
      holder.browser?.close().catch(() => {})
      reject(new PdfRenderError('Se agotó el tiempo generando el PDF', 'PDF_TIMEOUT'))
    }, RENDER_TIMEOUT_MS)
    renderOnce(url, { readyFlag, holder })
      .then(resolve, (err) => reject(err instanceof PdfRenderError ? err : new PdfRenderError(err.message)))
      .finally(() => clearTimeout(timer))
  }))
  // La cola sigue aunque este job falle
  queue = job.catch(() => {})
  return job
}

module.exports = { renderUrlToPdf, PdfRenderError }
