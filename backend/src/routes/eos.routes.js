const router = require('express').Router()
const { getEOS, updateEOS } = require('../controllers/eos.controller')
const {
  getPersonas, upsertRating,
  addStrike, removeStrike,
  createNode, updateNode, deleteNode,
} = require('../controllers/eosPeople.controller')
const {
  getScorecard, createMetric, updateMetric, deleteMetric, upsertEntry,
} = require('../controllers/eosScorecard.controller')
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')

router.use(auth)
router.use(resolveWorkspace)
router.use(workspaceAdminOnly)

// Visión
router.get('/',   getEOS)
router.patch('/', updateEOS)

// Personas — Analizador
router.get('/personas',           getPersonas)
router.patch('/people-analyzer',  upsertRating)

// Personas — 3 Faltas
router.post('/strikes',        addStrike)
router.delete('/strikes/:id',  removeStrike)

// Personas — Organigrama
router.post('/accountability',        createNode)
router.patch('/accountability/:id',   updateNode)
router.delete('/accountability/:id',  deleteNode)

// Datos — Scorecard
router.get('/scorecard',                         getScorecard)
router.post('/scorecard',                        createMetric)
router.patch('/scorecard/:id',                   updateMetric)
router.delete('/scorecard/:id',                  deleteMetric)
router.put('/scorecard/:id/entries/:period',     upsertEntry)

module.exports = router
