/**
 * Borra TODOS los datos operativos de Finanzas de un workspace para arrancar de 0,
 * conservando intacta la "Configuración de Finanzas":
 *   - Bancos y cuentas (FinanceAccount, incluido su saldo inicial) + impuestos ofrecidos por cuenta (FinanceAccountTax)
 *   - Categorías (FinanceCategory)
 *   - Ítems / clientes / proveedores (FinanceItem, con sus datos de contacto y notas)
 *   - Impuestos (FinanceTax)
 *   - Emisores de factura electrónica (FinanceIssuer, con certificado/clave y entorno)
 *
 * Se borra (físicamente, incluso lo que estaba en la papelera por soft-delete):
 *   movimientos (+ egresos hijos de impuestos y líneas de impuestos), cheques,
 *   movimientos de fondos / transferencias, valuaciones de fondos, ajustes de saldo,
 *   pagos al equipo de extras, facturas y notas
 *   de crédito/débito (+ adjuntos, también sus objetos en R2), extras (+ cuotas),
 *   próximas acciones, tareas de Pendientes, nota del workspace, resumen IA y el
 *   log de auditoría de todo eso (el de las entidades de configuración se conserva).
 *   Las tareas de dashboard creadas desde Pendientes que siguen PENDING (sin empezar)
 *   también se borran; las ya empezadas/completadas quedan como tareas comunes.
 *
 * Ojo: borrar una factura acá NO la anula en ARCA. Si alguna se emitió con un
 * emisor en producción, sigue existiendo para AFIP (se anula con nota de crédito).
 * La tabla arca_store (idempotencia del SDK) no se toca: sus keys son UUIDs.
 *
 * Uso:
 *   DATABASE_URL="..." node scripts/reset-finanzas-data.js <slug>            # simulación: solo muestra conteos
 *   DATABASE_URL="..." node scripts/reset-finanzas-data.js <slug> --confirm  # borra de verdad
 * Para borrar también los adjuntos en R2 hacen falta las env vars R2_* (sin ellas
 * se borran las filas y los objetos quedan huérfanos en el bucket).
 */
require('dotenv').config()
const prisma = require('../src/lib/prisma')
const { deleteObjects } = require('../src/services/objectStorage.service')

const CONFIG_AUDIT_TYPES = ['account', 'issuer', 'tax', 'category', 'item']

const slug    = process.argv[2]
const confirm = process.argv.includes('--confirm')

async function main() {
  if (!slug || slug.startsWith('--')) throw new Error('Falta el slug del workspace. Uso: node scripts/reset-finanzas-data.js <slug> [--confirm]')
  const workspace = await prisma.workspace.findUnique({ where: { slug }, select: { id: true, name: true } })
  if (!workspace) throw new Error(`No existe el workspace "${slug}"`)
  const workspaceId = workspace.id
  const ws = { workspaceId }

  const dbHost = (process.env.DATABASE_URL || '').split('@')[1]?.split('/')[0] || '(sin DATABASE_URL)'
  console.log(`DB: ${dbHost}`)
  console.log(`Workspace: ${workspace.name} (slug "${slug}", id ${workspaceId})`)
  console.log(confirm ? 'Modo: BORRADO REAL\n' : 'Modo: simulación (agregá --confirm para borrar)\n')

  const financeTasks = await prisma.financeTask.findMany({ where: { ...ws, taskId: { not: null } }, select: { taskId: true } })
  const pendingDashboardTaskIds = (await prisma.task.findMany({
    where: { id: { in: financeTasks.map(t => t.taskId) }, status: 'PENDING' },
    select: { id: true },
  })).map(t => t.id)
  const attachmentKeys = (await prisma.financeAttachment.findMany({
    where: { ...ws, objectKey: { not: null } }, select: { objectKey: true },
  })).map(a => a.objectKey)
  const productionInvoices = await prisma.financeInvoice.count({
    where: { ...ws, arcaStatus: 'authorized', issuer: { environment: 'production' } },
  })

  const auditWhere = { ...ws, entityType: { notIn: CONFIG_AUDIT_TYPES } }
  const counts = {
    'Líneas de impuestos aplicados':      await prisma.financeMovementTax.count({ where: ws }),
    'Cuotas de extras':                   await prisma.financeExtraPayment.count({ where: ws }),
    'Pagos al equipo de extras':          await prisma.financeExtraTeamPayout.count({ where: ws }),
    'Cheques':                            await prisma.financeCheck.count({ where: ws }),
    'Movimientos (ingresos/egresos)':     await prisma.financeMovement.count({ where: ws }),
    'Adjuntos de facturas':               await prisma.financeAttachment.count({ where: ws }),
    'Facturas / notas de crédito-débito': await prisma.financeInvoice.count({ where: ws }),
    'Movimientos de fondos':              await prisma.financeTransfer.count({ where: ws }),
    'Valuaciones de fondos':              await prisma.financeFundValuation.count({ where: ws }),
    'Ajustes de saldo':                   await prisma.financeBalanceAdjustment.count({ where: ws }),
    'Extras':                             await prisma.financeExtra.count({ where: ws }),
    'Próximas acciones':                  await prisma.financeNextAction.count({ where: ws }),
    'Tareas de Pendientes':               await prisma.financeTask.count({ where: ws }),
    'Tareas de dashboard sin empezar':    pendingDashboardTaskIds.length,
    'Nota del workspace':                 await prisma.financeWorkspaceNote.count({ where: ws }),
    'Resumen IA':                         await prisma.financeAiSummary.count({ where: ws }),
    'Log de auditoría (no config)':       await prisma.financeAuditLog.count({ where: auditWhere }),
  }
  console.log('A borrar:')
  for (const [label, n] of Object.entries(counts)) console.log(`  ${String(n).padStart(6)}  ${label}`)

  console.log('\nSe conserva:')
  console.log(`  ${String(await prisma.financeAccount.count({ where: ws })).padStart(6)}  Cuentas`)
  console.log(`  ${String(await prisma.financeCategory.count({ where: ws })).padStart(6)}  Categorías`)
  console.log(`  ${String(await prisma.financeItem.count({ where: ws })).padStart(6)}  Ítems / clientes`)
  console.log(`  ${String(await prisma.financeTax.count({ where: ws })).padStart(6)}  Impuestos`)
  const issuers = await prisma.financeIssuer.findMany({ where: ws, select: { name: true, cuit: true, environment: true, salesPoint: true } })
  console.log(`  ${String(issuers.length).padStart(6)}  Emisores`)
  for (const i of issuers) console.log(`          - ${i.name} (CUIT ${i.cuit}, PV ${i.salesPoint}, ${i.environment})`)

  if (productionInvoices > 0) {
    console.log(`\n⚠️  ${productionInvoices} factura(s) autorizada(s) por ARCA en producción: se borran de BlissTracker pero siguen vigentes en ARCA.`)
  }

  if (!confirm) {
    console.log('\nSimulación terminada, no se borró nada.')
    return
  }

  // Orden pensado para las FKs sin cascade (MovementTax→Tax, Movement/Invoice/Extra/NextAction→Item, etc.).
  await prisma.$transaction(async (tx) => {
    await tx.financeMovementTax.deleteMany({ where: ws })
    await tx.financeExtraPayment.deleteMany({ where: ws })
    await tx.financeExtraTeamPayout.deleteMany({ where: ws })
    await tx.financeCheck.deleteMany({ where: ws })
    await tx.financeMovement.deleteMany({ where: ws })
    await tx.financeAttachment.deleteMany({ where: ws })
    await tx.financeInvoice.deleteMany({ where: ws })
    await tx.financeTransfer.deleteMany({ where: ws })
    await tx.financeFundValuation.deleteMany({ where: ws })
    await tx.financeBalanceAdjustment.deleteMany({ where: ws })
    await tx.financeExtra.deleteMany({ where: ws })
    await tx.financeNextAction.deleteMany({ where: ws })
    await tx.financeTask.deleteMany({ where: ws })
    if (pendingDashboardTaskIds.length) await tx.task.deleteMany({ where: { id: { in: pendingDashboardTaskIds }, status: 'PENDING' } })
    await tx.financeWorkspaceNote.deleteMany({ where: ws })
    await tx.financeAiSummary.deleteMany({ where: ws })
    await tx.financeAuditLog.deleteMany({ where: auditWhere })
  }, { timeout: 120000 })
  console.log('\n✓ Datos de Finanzas borrados.')

  if (attachmentKeys.length) {
    const { deleted } = await deleteObjects(attachmentKeys)
    console.log(`✓ R2: ${deleted}/${attachmentKeys.length} archivo(s) adjunto(s) borrados.`)
  }
}

main()
  .catch(err => { console.error(err.message || err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
