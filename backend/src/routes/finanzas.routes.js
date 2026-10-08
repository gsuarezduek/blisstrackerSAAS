const router = require('express').Router()
const { auth } = require('../middleware/auth')
const { resolveWorkspace, workspaceAdminOnly } = require('../middleware/workspace')
const { requireFeatureFlag } = require('../lib/featureFlags')
const { moduleAccessGuard } = require('../lib/moduleAccess')

const accounts   = require('../controllers/finanzas/accounts.controller')
const categories = require('../controllers/finanzas/categories.controller')
const items      = require('../controllers/finanzas/items.controller')
const taxes      = require('../controllers/finanzas/taxes.controller')

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

module.exports = router
