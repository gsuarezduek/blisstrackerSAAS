const express             = require('express')
const router              = express.Router()
const prisma              = require('../lib/prisma')
const { getPublicReport } = require('../controllers/monthlyReport.controller')

// Sin auth — endpoint público para informes mensuales de clientes
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
    res.set('Cache-Control', 'public, max-age=3600')
    res.send(Buffer.from(workspace.logoData))
  } catch { res.status(500).end() }
})

/**
 * GET /api/public/banner/:slug
 * Sirve el banner del workspace identificado por su slug. Sin auth.
 */
router.get('/banner/:slug', async (req, res) => {
  try {
    const workspace = await prisma.workspace.findUnique({
      where:  { slug: req.params.slug },
      select: { bannerData: true, bannerMimeType: true },
    })
    if (!workspace?.bannerData) return res.status(404).end()

    res.set('Content-Type', workspace.bannerMimeType)
    res.set('Cache-Control', 'public, max-age=3600')
    res.send(Buffer.from(workspace.bannerData))
  } catch { res.status(500).end() }
})

module.exports = router
