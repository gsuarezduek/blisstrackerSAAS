const prisma = require('../lib/prisma')
const { validateImageUpload } = require('../lib/imageType')

const CONTENT_ID = 1 // fila única

// ─── Defaults (copy original) ────────────────────────────────────────────────
// Viven acá, no en el schema: así el DEFAULT de columna puede ser trivial
// ('' / '[]') y no hace falta escribir JSON largo a mano en una migración SQL.
// getContent() mergea la fila (posiblemente parcial/vacía) sobre esto, campo
// por campo, para que la landing nunca muestre una sección en blanco.
const CONTENT_DEFAULTS = {
  heroBadge:            'Hecho para agencias de marketing · Gratis hasta 3 usuarios',
  heroTitle:            'El sistema operativo',
  heroTitleAccentWords: ['agencia', 'negocio', 'equipo', 'empresa'],
  heroSubtitle:         'Tareas con foco real, visibilidad de tu equipo en vivo, e informes automáticos — más los módulos que tu agencia necesite: marketing, EOS, ventas.',
  demoVideoUrl:         null,

  problemTitle:    'Tu agencia merece dejar de hacer esto.',
  problemSubtitle: 'Cuando reportar a un cliente se vuelve más caro que ejecutar para él, algo está roto.',
  problemCards: [
    { emoji: '🪟', title: '7 pestañas para reportar un mes', desc: 'GA4, Search Console, Ads, Meta, TikTok, Excel, PowerPoint. Tu PM pierde 4 horas armando lo que el cliente lee en 4 minutos.' },
    { emoji: '🤷', title: '¿En qué está cada cuenta?', desc: 'Sin reunión de status, nadie sabe el avance. Con reunión, perdés 30 min × persona × semana. Y tampoco quedan respuestas.' },
    { emoji: '🔥', title: 'Lo urgente del cliente come tu roadmap', desc: 'Cada cliente cree que es prioritario. Sin foco explícito, el equipo apaga incendios y el trabajo planificado queda para "después".' },
  ],

  solutionTitle:      'No es otro gestor de tareas.',
  solutionParagraph1: 'Es una herramienta de ejecución. Diseñada para que tu equipo sepa exactamente en qué trabajar, en qué orden, y por qué.',
  solutionParagraph2: 'Sin infinitas configuraciones. Sin flujos que nadie respeta. Con un coach de IA que conoce el contexto real de cada persona en tu equipo.',

  featuresTitle: 'Todo lo que necesitás.\nNada que no necesitás.',
  featureCards: [
    { icon: '🎯', title: 'Una tarea activa a la vez', desc: 'El sistema te obliga a comprometerte con una tarea por persona. Sin multitasking disfrazado de productividad.' },
    { icon: '🤖', title: 'Coach de IA integrado', desc: 'Cada mañana, tu IA analiza tus pendientes, historial y rol para decirte exactamente en qué deberías enfocarte primero.' },
    { icon: '📊', title: 'Visibilidad real del equipo', desc: 'Ves en tiempo real qué está haciendo cada persona, en qué proyecto, y cuánto llevan. Sin reuniones de estado.' },
    { icon: '📬', title: 'Resúmenes semanales automáticos', desc: 'Cada viernes, tu equipo recibe un análisis de su semana: logros, tiempo perdido y qué mejorar la próxima.' },
    { icon: '⭐', title: 'Foco del día con tareas destacadas', desc: 'Marcá hasta 3 tareas como prioridad del día. Las que sí o sí tienen que avanzar, sin importar el resto.' },
    { icon: '📁', title: 'Proyectos y clientes separados', desc: 'Cada proyecto tiene su equipo, sus tareas y su historial. Sin mezclas entre clientes, sin confusión.' },
  ],

  stepsTitle: 'De cero a equipo enfocado en minutos',
  steps: [
    { title: 'Creás tu workspace', desc: 'Registrá tu equipo en segundos. Tu espacio propio en tuempresa.blisstracker.app, listo para usar.' },
    { title: 'Elegís tus módulos', desc: 'Marketing, EOS, ventas — activás lo que tu agencia usa. Lo cambiás cuando quieras desde Preferencias.' },
    { title: 'Invitás a tu equipo', desc: 'Mandás invitaciones por email. Cada persona acepta y empieza a trabajar. Sin onboarding eterno.' },
    { title: 'Ejecutan con foco', desc: 'El coach de IA guía las prioridades de cada uno. Vos ves el avance en tiempo real.' },
  ],

  benefitsTitle:    'El resultado no es "más productividad".',
  benefitsSubtitle: 'Son proyectos que avanzan, equipos que saben qué hacer, y tiempo del negocio bien usado.',
  benefitCards: [
    { label: 'Más foco',        desc: 'Menos tareas abiertas, más completadas' },
    { label: 'Menos caos',      desc: 'Todo el equipo en la misma página' },
    { label: 'Más control',     desc: 'Visibilidad sin reuniones de estado' },
    { label: 'Mejor resultado', desc: 'El tiempo del equipo bien usado' },
  ],

  faqGroups: [
    {
      group: 'Producto',
      items: [
        { q: '¿Cómo se compara con Asana, Notion o SEMrush?',
          a: 'Asana y Notion organizan tareas; SEMrush es SEO suelto. BlissTracker integra la ejecución del equipo (foco, coach IA, visibilidad) con los módulos que actives (marketing, EOS, ventas) y reportes con URL pública para clientes. Es un reemplazo para agencias, no un complemento.' },
        { q: '¿Cómo funciona el coach de IA?',
          a: 'Cada mañana, Claude Haiku analiza tus tareas pendientes, historial reciente y expectativas de rol para sugerirte prioridades. No es un chat genérico: aprende tus patrones semanales y los aplica al contexto del día.' },
        { q: '¿Qué pasa si no hago SEO/Ads para mis clientes?',
          a: 'Nada — ese módulo queda apagado y usás el core: tareas con foco, coach de IA, visibilidad de equipo e informes. Lo activás el día que lo necesites, sin migrar de sistema ni pagar de más.' },
        { q: '¿Qué incluye el módulo de Marketing?',
          a: 'GEO/SEO (Search Console, keyword tracking), Meta Ads + Google Ads, Instagram/TikTok/LinkedIn/Facebook, y reportes mensuales con URL pública para el cliente. Es opcional — no hace falta activarlo para aprovechar el resto del sistema.' },
        { q: '¿Qué es el módulo EOS?',
          a: 'Los 7 componentes del sistema Traction (Gino Wickman) integrados al mismo task tracker: Visión, Personas, Datos (Scorecard), Asuntos, Procesos, Tracción (Rocks + reunión L10) y Evaluación organizacional con IA.' },
        { q: '¿Para qué sirve el módulo de Ventas (CRM)?',
          a: 'Pipeline de leads y empresas, próximas acciones con recordatorio automático, investigación de empresas con IA y un generador de propuestas — para agencias que gestionan su propio proceso comercial.' },
        { q: '¿Puedo manejar múltiples clientes y proyectos?',
          a: 'Sí, ilimitados. Cada proyecto tiene su equipo, sus integraciones (GA4, Search Console, Ads) y sus informes. Las URL públicas de cliente son por proyecto.' },
      ],
    },
    {
      group: 'Pricing y trial',
      items: [
        { q: '¿Es gratis para siempre hasta 3 usuarios?',
          a: 'Sí. Hasta 3 usuarios, sin límite de tiempo y sin tarjeta de crédito. Acceso al core del producto: tareas, coach IA, resúmenes semanales.' },
        { q: '¿Qué pasa cuando termina el trial de 14 días?',
          a: 'Si tenés hasta 3 usuarios, seguís en Gratis. Si tenés más, podés activar Pro ($3/seat/mes) o quedarte en past_due hasta que actives la suscripción. Los datos se mantienen siempre.' },
        { q: '¿Hay descuento anual?',
          a: 'Sí, ~15% (los meses 11 y 12 gratis). Se selecciona al activar el plan desde Stripe Checkout.' },
      ],
    },
    {
      group: 'Setup y datos',
      items: [
        { q: '¿Cuánto tarda el setup?',
          a: 'Crear el workspace toma menos de 60 segundos. Conectar Google Analytics y Search Console son ~3 minutos. Tu primer informe a cliente está listo en ~10 minutos.' },
        { q: '¿Mis datos son míos?',
          a: 'Sí. Exportás todo en JSON desde Preferencias en cualquier momento. Si cancelás, programás eliminación con 48h de gracia (cancelable). Sin lock-in.' },
        { q: '¿Cómo manejan los tokens OAuth de mis clientes?',
          a: 'Cifrados con AES-256-GCM en la base. Cada integración (GA4, Ads, Meta, TikTok) tiene auto-refresh y status visible. Si un token expira, te avisamos para reconectar.' },
      ],
    },
    {
      group: 'Equipo y permisos',
      items: [
        { q: '¿Cómo invito a mi equipo?',
          a: 'Desde Admin → Equipo enviás invitaciones por email. Cada persona acepta y empieza a trabajar. Sin alta manual, sin gestión de contraseñas.' },
        { q: '¿Hay roles y permisos granulares?',
          a: 'Sí. Tres roles a nivel workspace (owner, admin, member) más un teamRole operativo libre (ej: DESIGNER, PM). Los miembros solo ven proyectos donde están asignados.' },
      ],
    },
  ],
}

const isEmptyValue = v =>
  v == null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)

function mergeWithDefaults(row) {
  const merged = { ...CONTENT_DEFAULTS }
  if (!row) return merged
  for (const key of Object.keys(CONTENT_DEFAULTS)) {
    if (key === 'demoVideoUrl') { merged.demoVideoUrl = row.demoVideoUrl ?? null; continue }
    if (!isEmptyValue(row[key])) merged[key] = row[key]
  }
  merged.updatedAt = row.updatedAt
  return merged
}

// ─── Validación de campos editables ──────────────────────────────────────────

const MAX_ACCENT_WORDS = 12
const MAX_ACCENT_WORD_LEN = 40

// Sanea la lista de palabras del typewriter del hero: strings no vacías, trim,
// dedup, con tope de cantidad y largo (mismo criterio que blockedWords/examples
// del bot de WhatsApp) para no dejar animar frases larguísimas o listas gigantes.
function sanitizeAccentWords(input) {
  if (!Array.isArray(input)) return null
  const seen = new Set()
  const words = []
  for (const raw of input) {
    const w = String(raw ?? '').trim().slice(0, MAX_ACCENT_WORD_LEN)
    if (!w || seen.has(w)) continue
    seen.add(w)
    words.push(w)
    if (words.length >= MAX_ACCENT_WORDS) break
  }
  return words
}

// Sanea un array de "tarjetas" (objetos planos de strings, ej. { icon, title, desc }):
// recorta cada campo a su tope de largo, descarta el item si falta algún campo
// requerido, y cappea la cantidad total de items.
function sanitizeCardArray(input, fieldMax, maxItems) {
  if (!Array.isArray(input)) return null
  const keys = Object.keys(fieldMax)
  const items = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const item = {}
    let ok = true
    for (const k of keys) {
      const v = String(raw[k] ?? '').trim().slice(0, fieldMax[k])
      if (!v) { ok = false; break }
      item[k] = v
    }
    if (ok) items.push(item)
    if (items.length >= maxItems) break
  }
  return items
}

const MAX_FAQ_GROUPS = 10
const MAX_FAQ_ITEMS_PER_GROUP = 20
const MAX_FAQ_GROUP_LEN = 60
const MAX_FAQ_Q_LEN = 200
const MAX_FAQ_A_LEN = 2000

function sanitizeFaqGroups(input) {
  if (!Array.isArray(input)) return null
  const groups = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const group = String(raw.group ?? '').trim().slice(0, MAX_FAQ_GROUP_LEN)
    if (!group) continue
    const items = []
    if (Array.isArray(raw.items)) {
      for (const rawItem of raw.items) {
        const q = String(rawItem?.q ?? '').trim().slice(0, MAX_FAQ_Q_LEN)
        const a = String(rawItem?.a ?? '').trim().slice(0, MAX_FAQ_A_LEN)
        if (!q || !a) continue
        items.push({ q, a })
        if (items.length >= MAX_FAQ_ITEMS_PER_GROUP) break
      }
    }
    if (items.length === 0) continue
    groups.push({ group, items })
    if (groups.length >= MAX_FAQ_GROUPS) break
  }
  return groups
}

// ─── Hero / secciones / video (LandingContent) ───────────────────────────────

/**
 * GET /api/landing/content
 * Contenido editable de la landing pública (hero + secciones intermedias + FAQ).
 * Ruta pública (sin auth). Cada campo vacío/ausente en la fila cae al copy
 * original (CONTENT_DEFAULTS) para que la landing nunca muestre algo en blanco.
 */
async function getContent(req, res, next) {
  try {
    const content = await prisma.landingContent.findUnique({ where: { id: CONTENT_ID } })
    res.json(mergeWithDefaults(content))
  } catch (err) { next(err) }
}

/**
 * PUT /api/superadmin/landing/content
 * Body: subconjunto de los campos de LandingContent (todos opcionales).
 */
async function updateContent(req, res, next) {
  try {
    const {
      heroBadge, heroTitle, heroTitleAccentWords, heroSubtitle, demoVideoUrl,
      problemTitle, problemSubtitle, problemCards,
      solutionTitle, solutionParagraph1, solutionParagraph2,
      featuresTitle, featureCards,
      stepsTitle, steps,
      benefitsTitle, benefitsSubtitle, benefitCards,
      faqGroups,
    } = req.body
    const data = {}

    if (heroBadge         !== undefined) data.heroBadge         = String(heroBadge).trim()
    if (heroTitle         !== undefined) data.heroTitle         = String(heroTitle).trim()
    if (heroSubtitle      !== undefined) data.heroSubtitle      = String(heroSubtitle).trim()
    if (demoVideoUrl      !== undefined) data.demoVideoUrl      = demoVideoUrl?.trim() || null
    if (problemTitle      !== undefined) data.problemTitle      = String(problemTitle).trim()
    if (problemSubtitle   !== undefined) data.problemSubtitle   = String(problemSubtitle).trim()
    if (solutionTitle     !== undefined) data.solutionTitle     = String(solutionTitle).trim()
    if (solutionParagraph1 !== undefined) data.solutionParagraph1 = String(solutionParagraph1).trim()
    if (solutionParagraph2 !== undefined) data.solutionParagraph2 = String(solutionParagraph2).trim()
    if (featuresTitle     !== undefined) data.featuresTitle     = String(featuresTitle).trim()
    if (stepsTitle        !== undefined) data.stepsTitle        = String(stepsTitle).trim()
    if (benefitsTitle     !== undefined) data.benefitsTitle     = String(benefitsTitle).trim()
    if (benefitsSubtitle  !== undefined) data.benefitsSubtitle  = String(benefitsSubtitle).trim()

    if (heroTitleAccentWords !== undefined) {
      const words = sanitizeAccentWords(heroTitleAccentWords)
      if (!words?.length) return res.status(400).json({ error: 'heroTitleAccentWords debe ser una lista con al menos una palabra' })
      data.heroTitleAccentWords = words
    }
    if (problemCards !== undefined) {
      const cards = sanitizeCardArray(problemCards, { emoji: 8, title: 100, desc: 400 }, 6)
      if (!cards) return res.status(400).json({ error: 'problemCards debe ser un array' })
      data.problemCards = cards
    }
    if (featureCards !== undefined) {
      const cards = sanitizeCardArray(featureCards, { icon: 8, title: 100, desc: 400 }, 12)
      if (!cards) return res.status(400).json({ error: 'featureCards debe ser un array' })
      data.featureCards = cards
    }
    if (steps !== undefined) {
      const items = sanitizeCardArray(steps, { title: 100, desc: 400 }, 8)
      if (!items) return res.status(400).json({ error: 'steps debe ser un array' })
      data.steps = items
    }
    if (benefitCards !== undefined) {
      const cards = sanitizeCardArray(benefitCards, { label: 60, desc: 200 }, 8)
      if (!cards) return res.status(400).json({ error: 'benefitCards debe ser un array' })
      data.benefitCards = cards
    }
    if (faqGroups !== undefined) {
      const groups = sanitizeFaqGroups(faqGroups)
      if (!groups) return res.status(400).json({ error: 'faqGroups debe ser un array' })
      data.faqGroups = groups
    }

    const content = await prisma.landingContent.upsert({
      where:  { id: CONTENT_ID },
      update: data,
      create: { id: CONTENT_ID, ...data },
    })
    res.json(mergeWithDefaults(content))
  } catch (err) { next(err) }
}

// ─── Empresas que confían (TrustedCompany) — público / usuarios ─────────────

/**
 * GET /api/landing/trusted-companies
 * Solo activas, ordenadas. Ruta pública (sin auth). No incluye imageData.
 */
async function listTrustedCompanies(req, res, next) {
  try {
    const companies = await prisma.trustedCompany.findMany({
      where:   { active: true },
      orderBy: { order: 'asc' },
      select:  { id: true, name: true, websiteUrl: true },
    })
    res.json(companies.map(c => ({ ...c, imageUrl: `/api/landing/trusted-companies/${c.id}/image` })))
  } catch (err) { next(err) }
}

/**
 * GET /api/landing/trusted-companies/:id/image
 * Sirve el logo directamente desde la DB. Ruta pública (sin auth).
 */
async function serveTrustedCompanyImage(req, res, next) {
  try {
    const id = Number(req.params.id)
    const company = await prisma.trustedCompany.findUnique({
      where:  { id },
      select: { imageData: true, mimeType: true },
    })
    if (!company) return res.status(404).json({ error: 'Imagen no encontrada' })

    res.set('Content-Type', company.mimeType)
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Cache-Control', 'public, max-age=86400') // 24h cache
    res.send(Buffer.from(company.imageData))
  } catch (err) { next(err) }
}

// ─── Empresas que confían — superadmin ───────────────────────────────────────

/**
 * GET /api/superadmin/landing/trusted-companies
 * Lista completa (activas + inactivas) para el panel.
 */
async function listAllTrustedCompanies(req, res, next) {
  try {
    const companies = await prisma.trustedCompany.findMany({
      orderBy: { order: 'asc' },
      select:  { id: true, name: true, websiteUrl: true, order: true, active: true, createdAt: true },
    })
    res.json(companies)
  } catch (err) { next(err) }
}

/**
 * POST /api/superadmin/landing/trusted-companies
 * Multipart/form-data: campo "image" + "name" + "websiteUrl" (opcional).
 */
async function createTrustedCompany(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' })

    const { name, websiteUrl } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'El nombre es requerido' })

    const check = validateImageUpload(req.file.buffer, ['image/png', 'image/jpeg', 'image/webp'])
    if (!check.ok) return res.status(400).json({ error: 'Formato no soportado. Usar PNG, JPG o WEBP.' })

    const maxOrder = await prisma.trustedCompany.aggregate({ _max: { order: true } })
    const nextOrder = (maxOrder._max.order ?? 0) + 1

    const company = await prisma.trustedCompany.create({
      data: {
        name:       name.trim(),
        websiteUrl: websiteUrl?.trim() || null,
        order:      nextOrder,
        active:     true,
        imageData:  req.file.buffer,
        mimeType:   check.mimeType,
      },
      select: { id: true, name: true, websiteUrl: true, order: true, active: true },
    })
    res.status(201).json(company)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/landing/trusted-companies/:id
 * Actualiza name/websiteUrl/order.
 */
async function updateTrustedCompany(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { name, websiteUrl, order } = req.body

    const existing = await prisma.trustedCompany.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Empresa no encontrada' })

    const data = {}
    if (name       !== undefined) data.name       = name.trim()
    if (websiteUrl !== undefined) data.websiteUrl = websiteUrl?.trim() || null
    if (order      !== undefined) data.order      = Number(order)

    const company = await prisma.trustedCompany.update({
      where:  { id },
      data,
      select: { id: true, name: true, websiteUrl: true, order: true, active: true },
    })
    res.json(company)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/landing/trusted-companies/reorder
 * Body: { items: [{ id, order }] }
 */
async function reorderTrustedCompanies(req, res, next) {
  try {
    const { items } = req.body
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items debe ser un array' })
    }

    await prisma.$transaction(
      items.map(({ id, order }) =>
        prisma.trustedCompany.update({
          where: { id: Number(id) },
          data:  { order: Number(order) },
        })
      )
    )

    const companies = await prisma.trustedCompany.findMany({
      orderBy: { order: 'asc' },
      select:  { id: true, name: true, websiteUrl: true, order: true, active: true },
    })
    res.json(companies)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/landing/trusted-companies/:id/toggle
 */
async function toggleTrustedCompany(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.trustedCompany.findUnique({ where: { id }, select: { active: true } })
    if (!existing) return res.status(404).json({ error: 'Empresa no encontrada' })

    const company = await prisma.trustedCompany.update({
      where:  { id },
      data:   { active: !existing.active },
      select: { id: true, name: true, websiteUrl: true, order: true, active: true },
    })
    res.json(company)
  } catch (err) { next(err) }
}

/**
 * DELETE /api/superadmin/landing/trusted-companies/:id
 */
async function deleteTrustedCompany(req, res, next) {
  try {
    await prisma.trustedCompany.delete({ where: { id: Number(req.params.id) } })
    res.json({ ok: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Empresa no encontrada' })
    next(err)
  }
}

// ─── Testimonios (LandingTestimonial) — público ──────────────────────────────

const TESTIMONIAL_FIELDS = { id: true, name: true, role: true, company: true, quote: true, metric: true, order: true, active: true }

/**
 * GET /api/landing/testimonials
 * Solo activos, ordenados. Ruta pública (sin auth). No incluye photoData.
 * Si no hay ninguno cargado todavía, devuelve [] — la sección se oculta en vez
 * de mostrar testimonios de relleno.
 */
async function listTestimonials(req, res, next) {
  try {
    const testimonials = await prisma.landingTestimonial.findMany({
      where:   { active: true },
      orderBy: { order: 'asc' },
      select:  { id: true, name: true, role: true, company: true, quote: true, metric: true, mimeType: true },
    })
    res.json(testimonials.map(t => ({
      ...t,
      photoUrl: t.mimeType ? `/api/landing/testimonials/${t.id}/image` : null,
      mimeType: undefined,
    })))
  } catch (err) { next(err) }
}

/**
 * GET /api/landing/testimonials/:id/image
 * Ruta pública (sin auth).
 */
async function serveTestimonialImage(req, res, next) {
  try {
    const id = Number(req.params.id)
    const t = await prisma.landingTestimonial.findUnique({ where: { id }, select: { photoData: true, mimeType: true } })
    if (!t?.photoData) return res.status(404).json({ error: 'Imagen no encontrada' })

    res.set('Content-Type', t.mimeType)
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Cache-Control', 'public, max-age=86400')
    res.send(Buffer.from(t.photoData))
  } catch (err) { next(err) }
}

// ─── Testimonios — superadmin ─────────────────────────────────────────────────

async function listAllTestimonials(req, res, next) {
  try {
    const testimonials = await prisma.landingTestimonial.findMany({
      orderBy: { order: 'asc' },
      select:  { ...TESTIMONIAL_FIELDS, mimeType: true, createdAt: true },
    })
    res.json(testimonials.map(t => ({ ...t, hasPhoto: !!t.mimeType, mimeType: undefined })))
  } catch (err) { next(err) }
}

/**
 * POST /api/superadmin/landing/testimonials
 * Multipart/form-data: name, quote requeridos; role/company/metric opcionales;
 * campo "image" opcional (sin foto, TestimonialCard cae a iniciales).
 */
async function createTestimonial(req, res, next) {
  try {
    const { name, role, company, quote, metric } = req.body
    if (!name?.trim())  return res.status(400).json({ error: 'El nombre es requerido' })
    if (!quote?.trim()) return res.status(400).json({ error: 'El testimonio (quote) es requerido' })

    let photoData = null, mimeType = null
    if (req.file) {
      const check = validateImageUpload(req.file.buffer, ['image/png', 'image/jpeg', 'image/webp'])
      if (!check.ok) return res.status(400).json({ error: 'Formato no soportado. Usar PNG, JPG o WEBP.' })
      photoData = req.file.buffer
      mimeType  = check.mimeType
    }

    const maxOrder = await prisma.landingTestimonial.aggregate({ _max: { order: true } })
    const nextOrder = (maxOrder._max.order ?? 0) + 1

    const t = await prisma.landingTestimonial.create({
      data: {
        name:    name.trim().slice(0, 80),
        role:    role?.trim().slice(0, 80) || '',
        company: company?.trim().slice(0, 80) || '',
        quote:   quote.trim().slice(0, 600),
        metric:  metric?.trim().slice(0, 60) || null,
        order:   nextOrder,
        active:  true,
        photoData, mimeType,
      },
      select: { ...TESTIMONIAL_FIELDS, mimeType: true },
    })
    res.status(201).json({ ...t, hasPhoto: !!t.mimeType, mimeType: undefined })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/landing/testimonials/:id
 * Body JSON (todos opcionales): name, role, company, quote, metric, order.
 * No reemplaza la foto — para eso, borrar y recrear el testimonio (mismo
 * criterio que trusted-companies).
 */
async function updateTestimonial(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.landingTestimonial.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Testimonio no encontrado' })

    const { name, role, company, quote, metric, order } = req.body
    const data = {}
    if (name    !== undefined) data.name    = String(name).trim().slice(0, 80)
    if (role    !== undefined) data.role    = String(role).trim().slice(0, 80)
    if (company !== undefined) data.company = String(company).trim().slice(0, 80)
    if (quote   !== undefined) data.quote   = String(quote).trim().slice(0, 600)
    if (metric  !== undefined) data.metric  = String(metric).trim().slice(0, 60) || null
    if (order   !== undefined) data.order   = Number(order)

    const t = await prisma.landingTestimonial.update({
      where: { id }, data, select: { ...TESTIMONIAL_FIELDS, mimeType: true },
    })
    res.json({ ...t, hasPhoto: !!t.mimeType, mimeType: undefined })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/landing/testimonials/reorder
 * Body: { items: [{ id, order }] }
 */
async function reorderTestimonials(req, res, next) {
  try {
    const { items } = req.body
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items debe ser un array' })
    }

    await prisma.$transaction(
      items.map(({ id, order }) =>
        prisma.landingTestimonial.update({ where: { id: Number(id) }, data: { order: Number(order) } })
      )
    )

    const testimonials = await prisma.landingTestimonial.findMany({
      orderBy: { order: 'asc' },
      select:  { ...TESTIMONIAL_FIELDS, mimeType: true },
    })
    res.json(testimonials.map(t => ({ ...t, hasPhoto: !!t.mimeType, mimeType: undefined })))
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/landing/testimonials/:id/toggle
 */
async function toggleTestimonial(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.landingTestimonial.findUnique({ where: { id }, select: { active: true } })
    if (!existing) return res.status(404).json({ error: 'Testimonio no encontrado' })

    const t = await prisma.landingTestimonial.update({
      where: { id }, data: { active: !existing.active }, select: { ...TESTIMONIAL_FIELDS, mimeType: true },
    })
    res.json({ ...t, hasPhoto: !!t.mimeType, mimeType: undefined })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/superadmin/landing/testimonials/:id
 */
async function deleteTestimonial(req, res, next) {
  try {
    await prisma.landingTestimonial.delete({ where: { id: Number(req.params.id) } })
    res.json({ ok: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Testimonio no encontrado' })
    next(err)
  }
}

module.exports = {
  getContent, updateContent,
  listTrustedCompanies, serveTrustedCompanyImage,
  listAllTrustedCompanies, createTrustedCompany, updateTrustedCompany,
  reorderTrustedCompanies, toggleTrustedCompany, deleteTrustedCompany,
  listTestimonials, serveTestimonialImage,
  listAllTestimonials, createTestimonial, updateTestimonial,
  reorderTestimonials, toggleTestimonial, deleteTestimonial,
}
