const router = require('express').Router()
const { auth } = require('../middleware/auth')
const { resolveWorkspace, salesGuard } = require('../middleware/workspace')

const dashboard = require('../controllers/ventas/salesDashboard.controller')
const companies = require('../controllers/ventas/companies.controller')
const contacts  = require('../controllers/ventas/contacts.controller')
const leads     = require('../controllers/ventas/leads.controller')

// Todo el módulo Ventas requiere: autenticación + workspace + pertenecer al equipo
// comercial (o ser admin/owner). El feature flag `ventas` se chequea en el frontend
// (Navbar + página), igual que marketing/eos.
router.use(auth)
router.use(resolveWorkspace)
router.use(salesGuard)

// Dashboard + equipo comercial
router.get('/dashboard', dashboard.getDashboard)
router.get('/team',      dashboard.getTeam)

// Empresas
router.get('/companies',        companies.listCompanies)
router.post('/companies',       companies.createCompany)
router.get('/companies/:id',    companies.getCompany)
router.patch('/companies/:id',  companies.updateCompany)
router.delete('/companies/:id', companies.deleteCompany)

// Contactos
router.get('/contacts',         contacts.listContacts)
router.post('/contacts',        contacts.createContact)
router.patch('/contacts/:id',   contacts.updateContact)
router.delete('/contacts/:id',  contacts.deleteContact)

// Leads / Oportunidades
router.get('/leads',                    leads.listLeads)
router.post('/leads',                   leads.createLead)
router.get('/leads/:id',                leads.getLead)
router.patch('/leads/:id',              leads.updateLead)
router.delete('/leads/:id',             leads.deleteLead)
router.patch('/leads/:id/status',       leads.changeStatus)
router.patch('/leads/:id/owner',        leads.changeOwner)
router.put('/leads/:id/next-action',    leads.setNextAction)
router.post('/leads/:id/notes',         leads.addNote)
router.delete('/leads/:id/notes/:noteId', leads.deleteNote)
router.post('/leads/:id/convert',       leads.convertToProject)

module.exports = router
