const express             = require('express')
const router              = express.Router()
const prisma              = require('../lib/prisma')
const { getPublicReport, getPublicReportMeta } = require('../controllers/monthlyReport.controller')

// Sin auth — endpoint público para informes mensuales de clientes
router.get('/report/:token/meta', getPublicReportMeta)   // metadata liviana para Open Graph (Vercel)
router.get('/report/:token', getPublicReport)

/**
 * GET /api/public/logo/:slug
 * Sirve el logo del workspace identificado por su slug. Sin auth.
 */
router.get('/logo/:slug', async (req, res) => {
  try {
    const workspace = await prisma.workspace.findUnique({
      where:  { slug: req.params.slug },
      select: { logoData: true, logoMimeType: true },
    })
    if (!workspace?.logoData) return res.status(404).end()

    res.set('Content-Type', workspace.logoMimeType)
    res.set('X-Content-Type-Options', 'nosniff')
    // Defensa contra logos SVG legacy (ya no se aceptan en la subida): forzar descarga
    // para que el navegador no los renderice inline y ejecute scripts embebidos.
    if (workspace.logoMimeType === 'image/svg+xml') res.set('Content-Disposition', 'attachment')
    res.set('Cache-Control', 'public, max-age=86400') // 24h
    res.send(Buffer.from(workspace.logoData))
  } catch { res.status(500).end() }
})

/**
 * GET /api/public/report-banner/:token
 * Sirve la imagen de portada de un informe mensual identificado por su token. Sin auth.
 */
router.get('/report-banner/:token', async (req, res) => {
  try {
    const report = await prisma.monthlyReport.findUnique({
      where:  { token: req.params.token },
      select: { bannerData: true, bannerMimeType: true },
    })
    if (!report?.bannerData) return res.status(404).end()

    res.set('Content-Type', report.bannerMimeType)
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Cache-Control', 'public, max-age=86400') // 24h
    res.send(Buffer.from(report.bannerData))
  } catch { res.status(500).end() }
})

module.exports = router
