const router = require('express').Router()
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')
const { requireFeatureFlag } = require('../lib/featureFlags')
const { moduleAccessGuard } = require('../lib/moduleAccess')

const accounts   = require('../controllers/finanzas/accounts.controller')
const categories = require('../controllers/finanzas/categories.controller')
const items      = require('../controllers/finanzas/items.controller')
const taxes      = require('../controllers/finanzas/taxes.controller')
const movements  = require('../controllers/finanzas/movements.controller')
const transfers  = require('../controllers/finanzas/transfers.controller')
const audit      = require('../controllers/finanzas/audit.controller')
const checks        = require('../controllers/finanzas/checks.controller')
const fundValuations = require('../controllers/finanzas/fundValuations.controller')
const balances       = require('../controllers/finanzas/balances.controller')
const summary        = require('../controllers/finanzas/summary.controller')
const customers      = require('../controllers/finanzas/customers.controller')
const invoices       = require('../controllers/finanzas/invoices.controller')
const nextActions    = require('../controllers/finanzas/nextActions.controller')
const extras         = require('../controllers/finanzas/extras.controller')
const tasks          = require('../controllers/finanzas/tasks.controller')
const workspaceNote  = require('../controllers/finanzas/workspaceNote.controller')
const aiSummary      = require('../controllers/finanzas/aiSummary.controller')

// Todo el módulo Finanzas requiere: autenticación + workspace + acceso al
// módulo (admin/owner o rol configurable, ver moduleAccess.js) + que el
// feature flag 'finanzas' esté habilitado para el workspace.
router.use(auth)
router.use(resolveWorkspace)
router.use(requireFeatureFlag('finanzas'))
router.use(moduleAccessGuard('finanzas'))

// Configuración (cuentas/categorías/catálogo de impuestos): la "plumbing"
// financiera del workspace — cualquiera con acceso al módulo puede LEER (la
// necesita el modal "+ Cargar"), pero solo admin/owner puede escribir.
router.get('/accounts',          accounts.listAccounts)
router.get('/accounts/:id',      accounts.getAccount)
router.post('/accounts',         workspaceAdminOnly, accounts.createAccount)
router.patch('/accounts/:id',    workspaceAdminOnly, accounts.updateAccount)
router.delete('/accounts/:id',   workspaceAdminOnly, accounts.deleteAccount)
router.put('/accounts/:id/taxes', workspaceAdminOnly, accounts.syncAccountTaxes)

router.get('/categories',        categories.listCategories)
router.post('/categories',       workspaceAdminOnly, categories.createCategory)
router.patch('/categories/:id',  workspaceAdminOnly, categories.updateCategory)
router.delete('/categories/:id', workspaceAdminOnly, categories.deleteCategory)

router.get('/taxes',             taxes.listTaxes)
router.post('/taxes',            workspaceAdminOnly, taxes.createTax)
router.patch('/taxes/:id',       workspaceAdminOnly, taxes.updateTax)
router.delete('/taxes/:id',      workspaceAdminOnly, taxes.deleteTax)

// Items: a diferencia de Cuentas/Categorías/Impuestos, NO son exclusivamente
// "Configuración" — el modal "+ Cargar" permite crear un item nuevo al vuelo
// (sección 4.7 del spec) y los datos de contacto de un cliente se editan desde
// su ficha en la pestaña Clientes (sección 4.5), ambos abiertos a cualquiera
// con acceso al módulo. Solo el borrado queda admin-only (acción destructiva
// poco frecuente, no prevista en ninguna pantalla operativa).
router.get('/items',             items.listItems)
router.get('/items/:id',         items.getItem)
router.post('/items',            items.createItem)
router.patch('/items/:id',       items.updateItem)
router.delete('/items/:id',      workspaceAdminOnly, items.deleteItem)

// Carga de movimientos y transferencias (modal "+ Cargar", sección 4.7) +
// Ingresos/Egresos con filtros + Editar movimiento (4.1/4.9): abierto a
// cualquiera con acceso al módulo — es la operación del día a día, no
// "Configuración". Los movimientos generados automáticamente por un impuesto
// (sourceMovementId != null) no son editables/eliminables directo, eso lo
// valida el controller (409), no el router.
router.get('/movements',             movements.listMovements)
router.get('/movements/:id',         movements.getMovement)
router.post('/movements',            movements.createMovement)
router.patch('/movements/:id',       movements.updateMovement)
router.delete('/movements/:id',      movements.deleteMovement)
router.post('/movements/:id/restore', movements.restoreMovement)

router.get('/transfers',         transfers.listTransfers)
router.post('/transfers',        transfers.createTransfer)

// Historial genérico (sección 4.9) — cualquiera con acceso al módulo.
router.get('/audit',             audit.listAudit)

// Saldos (4.2) + acreditación/rechazo de cheques (3.4, 4.8) + valuación de
// fondos (4.8) — operación del día a día, abierto a cualquiera con acceso.
router.get('/balances',              balances.getBalances)
router.get('/checks',                checks.listChecks)
router.patch('/checks/:id/credit',   checks.creditCheck)
router.patch('/checks/:id/reject',   checks.rejectCheck)
router.get('/fund-valuations',       fundValuations.listValuations)
router.post('/fund-valuations',      fundValuations.createValuation)

// Resumen (4.3): breakdown por categoría del mes + gráfico mensual.
router.get('/summary/breakdown',     summary.getBreakdown)
router.get('/summary/chart',         summary.getChart)

// Clientes (4.4/4.5) — abierto a cualquiera con acceso al módulo.
router.get('/customers',             customers.listCustomers)
router.get('/customers/:id',         customers.getCustomer)
router.get('/customers/:id/ledger',  customers.getLedger)

// Facturas (4.5b, 4.8) + adjuntos — rutas estáticas antes que las `:id` por claridad.
router.post('/invoices/download-zip', invoices.downloadZip)
router.post('/invoices/send-email',   invoices.sendEmail)
router.get('/invoices',               invoices.listInvoices)
router.post('/invoices',              invoices.createInvoice)
router.patch('/invoices/:id',         invoices.updateInvoice)
router.delete('/invoices/:id',        invoices.deleteInvoice)
router.post('/invoices/:id/restore',  invoices.restoreInvoice)
router.post('/invoices/:id/attachments/presign',         invoices.presignAttachment)
router.post('/invoices/:id/attachments/:attId/confirm',  invoices.confirmAttachment)
router.get('/invoices/:id/attachments/:attId/download',  invoices.downloadAttachment)
router.delete('/invoices/:id/attachments/:attId',        invoices.deleteAttachment)

// Próximas acciones (4.5, columna lateral).
router.get('/next-actions',          nextActions.listNextActions)
router.post('/next-actions',         nextActions.createNextAction)
router.patch('/next-actions/:id',    nextActions.updateNextAction)
router.delete('/next-actions/:id',   nextActions.deleteNextAction)

// Extras (4.6) — abierto a cualquiera con acceso al módulo.
router.get('/extras',                extras.listExtras)
router.post('/extras',               extras.createExtra)
router.patch('/extras/:id',          extras.updateExtra)
router.delete('/extras/:id',         extras.deleteExtra)

// Pendientes (4.6): tareas por reglas (motor on-demand) + nota del workspace + resumen IA.
router.get('/tasks',                 tasks.listTasks)
router.post('/tasks',                tasks.createTask)
router.patch('/tasks/:id',           tasks.updateTask)
router.delete('/tasks/:id',          tasks.deleteTask)

router.get('/workspace-note',        workspaceNote.getNote)
router.patch('/workspace-note',      workspaceNote.updateNote)

router.get('/ai-summary',            aiSummary.getSummary)
router.post('/ai-summary/refresh',   aiSummary.refreshSummary)

module.exports = router
