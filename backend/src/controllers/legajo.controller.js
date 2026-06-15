const prisma = require('../lib/prisma')
const { resolveLegajoFields, sanitizeLegajoFieldsInput } = require('../lib/legajoCatalog')

/**
 * GET /api/legajo/fields
 * Config del formulario de legajo del workspace. Lo lee cualquier miembro
 * (MyProfile y RRHH lo necesitan para renderizar). Devuelve la config efectiva.
 */
async function getFields(req, res, next) {
  try {
    const ws = req.workspace
    res.json({
      fields: resolveLegajoFields(ws.legajoFields),
      legajoEnabled: ws.legajoEnabled !== false,
    })
  } catch (err) { next(err) }
}

/**
 * PUT /api/legajo/fields
 * Reemplaza la config de campos del legajo (admin/owner). Body: { fields, legajoEnabled? }.
 */
async function saveFields(req, res, next) {
  try {
    const data = {}
    if ('fields' in req.body) {
      data.legajoFields = sanitizeLegajoFieldsInput(req.body.fields)
    }
    if ('legajoEnabled' in req.body) {
      data.legajoEnabled = Boolean(req.body.legajoEnabled)
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nada para actualizar' })
    }

    const ws = await prisma.workspace.update({
      where: { id: req.workspace.id },
      data,
      select: { legajoFields: true, legajoEnabled: true },
    })
    res.json({
      fields: resolveLegajoFields(ws.legajoFields),
      legajoEnabled: ws.legajoEnabled !== false,
    })
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message })
    next(err)
  }
}

module.exports = { getFields, saveFields }
