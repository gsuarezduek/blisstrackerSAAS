const prisma     = require('../lib/prisma')
const { runGeoAnalysis } = require('../services/geoAudit.service')

const { anthropic, assertTokenBudget } = require('../lib/claude')
const { logTokens } = require('../lib/logTokens')

/**
 * POST /api/marketing/geo/audit
 * Body: { projectId }
 * Crea un GeoAudit en estado "running" y dispara el análisis de forma async.
 */
async function runAudit(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId      = req.user.userId
    const { projectId } = req.body

    if (!projectId) return res.status(400).json({ error: 'projectId es requerido' })

    // Verificar que el proyecto pertenece al workspace y tiene URL
    const project = await prisma.project.findFirst({
      where: { id: Number(projectId), workspaceId },
      select: { id: true, name: true, websiteUrl: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!project.websiteUrl) return res.status(400).json({ error: 'El proyecto no tiene una URL configurada' })

    // Validar URL — agregar https:// si no tiene protocolo
    let url
    try {
      const raw = /^https?:\/\//i.test(project.websiteUrl)
        ? project.websiteUrl
        : 'https://' + project.websiteUrl
      url = new URL(raw).href
    } catch { return res.status(400).json({ error: 'La URL del proyecto no es válida' }) }

    // Crear el registro de audit
    const audit = await prisma.geoAudit.create({
      data: { workspaceId, projectId: project.id, url, status: 'pending' },
    })

    // Correr el análisis de forma async (no bloquea el response)
    setImmediate(() => runGeoAnalysis(audit.id, workspaceId, project.id, url, userId))

    res.status(201).json({ auditId: audit.id, ...audit })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/geo/audits
 * Query: ?projectId=N&limit=10&summary=true
 * Sin projectId → devuelve el audit más reciente de cada proyecto (benchmark).
 */
async function listAudits(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId   = req.query.projectId ? Number(req.query.projectId) : undefined
    const limit       = Math.min(Number(req.query.limit) || 10, 50)
    const summary     = req.query.summary === 'true'

    if (!projectId && summary) {
      // Benchmark: último audit completado de cada proyecto ACTIVO del workspace
      const projects = await prisma.project.findMany({
        where: { workspaceId, active: true },
        select: { id: true, name: true },
      })
      const results = await Promise.all(
        projects.map(async p => {
          const audit = await prisma.geoAudit.findFirst({
            where:   { projectId: p.id, workspaceId, status: 'completed' },
            orderBy: { createdAt: 'desc' },
            select:  { id: true, score: true, createdAt: true },
          })
          if (!audit) return null
          const band = audit.score >= 86 ? 'Excelente'
            : audit.score >= 68 ? 'Bueno'
            : audit.score >= 36 ? 'Base'
            : 'Crítico'
          return { projectId: p.id, projectName: p.name, score: audit.score, band, createdAt: audit.createdAt }
        })
      )
      return res.json(results.filter(Boolean))
    }

    const where = { workspaceId, ...(projectId ? { projectId } : {}) }

    const audits = await prisma.geoAudit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:    limit,
      select: {
        id: true, projectId: true, url: true, status: true,
        score: true, errorMsg: true, createdAt: true, updatedAt: true,
        project: { select: { name: true } },
      },
    })

    res.json(audits)
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/geo/audits/:id
 */
async function getAudit(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id          = Number(req.params.id)

    const audit = await prisma.geoAudit.findFirst({
      where: { id, workspaceId },
      include: { project: { select: { name: true, websiteUrl: true } } },
    })
    if (!audit) return res.status(404).json({ error: 'Audit no encontrado' })

    res.json({
      ...audit,
      findings:       JSON.parse(audit.findings),
      recommendations: JSON.parse(audit.recommendations),
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/geo/audits/:id/llms-txt
 */
async function generateLlmsTxt(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id          = Number(req.params.id)

    const audit = await prisma.geoAudit.findFirst({
      where:  { id, workspaceId, status: 'completed' },
      select: { rawData: true, url: true },
    })
    if (!audit) return res.status(404).json({ error: 'Audit no encontrado o no completado' })

    let raw = {}
    try { raw = JSON.parse(audit.rawData || '{}') } catch { /* ignore */ }

    const title       = raw.meta?.title       || ''
    const description = raw.meta?.description || ''
    const h2s         = (raw.meta?.h2 || []).slice(0, 5).join('\n- ')
    const url         = audit.url

    await assertTokenBudget(workspaceId) // 429 si el workspace agotó su presupuesto mensual de IA
    const message = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Generá un archivo llms.txt estándar para el sitio web con esta información:
URL: ${url}
Título: ${title}
Descripción: ${description}
Secciones principales: ${h2s || 'No disponibles'}

El formato estándar de llms.txt es:
# [Título del sitio]
> [Descripción breve en una oración]

## About
[Párrafo sobre el sitio]

## Topics
- [tema 1]
- [tema 2]
...

## Links
- [URL relevante]: [descripción]

Respondé SOLO con el contenido del archivo llms.txt, sin explicaciones adicionales.`,
      }],
    })
    logTokens('geoLlmsTxt', req.user.userId, message.usage, workspaceId).catch(() => {})

    const content = message.content[0].text.trim()
    res.json({ content })
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/geo/audits/:id/schema
 */
async function generateSchemaOrg(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id          = Number(req.params.id)

    const audit = await prisma.geoAudit.findFirst({
      where:  { id, workspaceId, status: 'completed' },
      select: { id: true, rawData: true, url: true },
    })
    if (!audit) return res.status(404).json({ error: 'Audit no encontrado o no completado' })

    let raw = {}
    try { raw = JSON.parse(audit.rawData || '{}') } catch { /* ignore */ }

    // Return cached schemas if already generated
    if (raw.generatedSchemas) {
      return res.json({ schemas: raw.generatedSchemas })
    }

    const schemasMissing = raw.schemasMissing || []
    const schemasPresent = raw.schemasPresent || []
    const title          = raw.meta?.title       || ''
    const description    = raw.meta?.description || ''
    const url            = audit.url

    if (!schemasMissing.length) {
      return res.json({ schemas: [] })
    }

    await assertTokenBudget(workspaceId) // 429 si el workspace agotó su presupuesto mensual de IA
    const message = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `Generá JSON-LD Schema.org para los tipos faltantes en este sitio web.

URL: ${url}
Título: ${title}
Descripción: ${description}
Schemas ya presentes: ${schemasPresent.join(', ') || 'ninguno'}
Schemas faltantes a generar: ${schemasMissing.join(', ')}

Respondé SOLO con un JSON array válido y completo. Cada elemento tiene esta estructura:
[
  {
    "type": "Organization",
    "jsonLd": "<script type=\\"application/ld+json\\">{ ...JSON-LD minificado en una sola línea... }</script>"
  }
]

IMPORTANTE: El JSON-LD dentro de "jsonLd" debe estar en UNA SOLA LÍNEA (sin saltos de línea) para evitar errores de parseo. Usá datos reales del sitio donde sea posible. Para campos desconocidos usá valores de ejemplo realistas.`,
      }],
    })
    logTokens('geoSchema', req.user.userId, message.usage, workspaceId).catch(() => {})

    let schemas = []
    try {
      const raw2 = message.content[0].text.trim()
      const match = raw2.match(/\[[\s\S]*\]/)
      if (match) schemas = JSON.parse(match[0])
    } catch (err) {
      console.error('[GEO] Error parseando schemas:', err.message)
    }

    // Cache generated schemas in rawData to avoid re-calling Claude
    if (schemas.length > 0) {
      try {
        const updatedRaw = JSON.stringify({ ...raw, generatedSchemas: schemas })
        await prisma.geoAudit.update({
          where: { id: audit.id },
          data:  { rawData: updatedRaw },
        })
      } catch (err) {
        console.error('[GEO] Error cacheando schemas:', err.message)
      }
    }

    res.json({ schemas })
  } catch (err) { next(err) }
}

// ─── DELETE /geo/audits/:id ───────────────────────────────────────────────────

async function deleteAudit(req, res, next) {
  try {
    const id          = Number(req.params.id)
    const workspaceId = req.workspace.id

    const audit = await prisma.geoAudit.findFirst({ where: { id, workspaceId } })
    if (!audit) return res.status(404).json({ error: 'Auditoría no encontrada' })

    await prisma.geoAudit.delete({ where: { id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { runAudit, listAudits, getAudit, generateLlmsTxt, generateSchemaOrg, deleteAudit }
