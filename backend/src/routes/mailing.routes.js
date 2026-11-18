// Rutas de Mailing bajo /api/marketing/projects/:id/mailing. Se montan desde
// marketing.routes.js DESPUÉS de requireProjectModulePrefix('marketing'), así
// heredan auth, flag de Marketing, acceso al módulo, privacidad del proyecto y
// el gate de "Marketing apagado en este proyecto" (req.project ya resuelto).
const express = require('express')
const router = express.Router({ mergeParams: true })
const config = require('../controllers/mailing/config.controller')
const contacts = require('../controllers/mailing/contacts.controller')
const campaigns = require('../controllers/mailing/campaigns.controller')
const images = require('../controllers/mailing/images.controller')
const crm = require('../controllers/mailing/crm.controller')
const multer = require('multer')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: images.MAX_MB * 1024 * 1024 } })

router.get('/config', config.getConfig)
router.put('/config', config.saveConfig)
router.post('/config/verify', config.verifyConfig)
router.put('/config/webhook-secret', config.saveWebhookSecret)

router.get('/lists', contacts.listLists)
router.post('/lists', contacts.createList)
router.patch('/lists/:listId', contacts.updateList)
router.delete('/lists/:listId', contacts.deleteList)
router.post('/lists/:listId/form', contacts.setListForm)
router.post('/lists/:listId/crm-sync', crm.crmSync)

router.get('/crm/options', crm.crmOptions)
router.post('/crm/import', crm.crmImport)

router.get('/contacts', contacts.listContacts)
router.post('/contacts', contacts.createContact)
router.post('/contacts/bulk', contacts.bulkContacts)
router.post('/contacts/import', contacts.importContacts)
router.patch('/contacts/:contactId', contacts.updateContact)
router.delete('/contacts/:contactId', contacts.deleteContact)

router.post('/images', upload.single('file'), images.uploadImage)

router.post('/audience', campaigns.audiencePreview)
router.get('/campaigns', campaigns.listCampaigns)
router.post('/campaigns', campaigns.createCampaign)
router.get('/campaigns/:campaignId', campaigns.getCampaign)
router.patch('/campaigns/:campaignId', campaigns.updateCampaign)
router.delete('/campaigns/:campaignId', campaigns.deleteCampaign)
router.post('/campaigns/:campaignId/duplicate', campaigns.duplicateCampaign)
router.post('/campaigns/:campaignId/preview', campaigns.previewCampaign)
router.post('/campaigns/:campaignId/test', campaigns.sendTestCampaign)
router.post('/campaigns/:campaignId/launch', campaigns.launch)
router.post('/campaigns/:campaignId/pause', campaigns.pause)
router.post('/campaigns/:campaignId/resume', campaigns.resume)
router.post('/campaigns/:campaignId/cancel', campaigns.cancel)
router.post('/campaigns/:campaignId/unschedule', campaigns.unschedule)
router.get('/campaigns/:campaignId/stats', campaigns.stats)
router.get('/campaigns/:campaignId/recipients', campaigns.recipients)

module.exports = router
