/**
 * Seed de categorías default del módulo Finanzas.
 *
 * Igual criterio que `seedDefaults` de workspaceSeed.service.js (Service/UserRole
 * base): sin huella visible mientras el workspace no tenga el flag `finanzas`
 * habilitado (son filas de catálogo, invisibles hasta abrir el módulo), así que
 * se siembra SIEMPRE al registrar un workspace, sin importar si Finanzas termina
 * habilitado o no.
 *
 * Idempotente (findFirst + create condicional, nunca upsert — ver el comentario
 * en seedDefaults sobre por qué un upsert que choca contra un constraint aborta
 * toda la transacción en Postgres). Se expone aparte para poder correrla también
 * contra workspaces YA EXISTENTES que recién activan el flag (ver
 * backend/scripts/seed-finance-categories.js).
 */
const prisma = require('../lib/prisma')

const INCOME_CATEGORIES = ['Fee mensual', 'Proyectos', 'Reintegro de pauta', 'Tercerizados', 'Aporte socios']
const EXPENSE_CATEGORIES = ['Sueldos', 'Gastos casa', 'Servicios', 'Software y licencias', 'Impuestos', 'Impuestos bancarios', 'Pauta de clientes', 'Tercerizados', 'Retiro socios']

async function seedFinanceCategories(workspaceId, tx = prisma) {
  const toSeed = [
    ...INCOME_CATEGORIES.map(name => ({ name, type: 'income' })),
    ...EXPENSE_CATEGORIES.map(name => ({ name, type: 'expense' })),
  ]

  for (const { name, type } of toSeed) {
    const existing = await tx.financeCategory.findFirst({
      where: { workspaceId, name, type },
      select: { id: true },
    })
    if (!existing) {
      await tx.financeCategory.create({ data: { workspaceId, name, type, active: true } })
    }
  }
}

module.exports = { seedFinanceCategories, INCOME_CATEGORIES, EXPENSE_CATEGORIES }
