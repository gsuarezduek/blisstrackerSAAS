/**
 * Smoke-test de la Etapa 1 de Finanzas: crea un registro de cada modelo nuevo,
 * encadenados con relaciones reales (impuesto sobre impuesto, movimiento con
 * impuesto aplicado + egreso hijo, cheque, transferencia, factura con cobro
 * parcial, extra con pago, próxima acción, tarea), confirma que
 * `logFinanceAudit` escribe en FinanceAuditLog, y al final borra todo lo que
 * creó (no deja residuos en la DB).
 *
 * Uso: DATABASE_URL="..." node scripts/smoke-test-finanzas.js [slug-del-workspace]
 * Default del slug: "bliss".
 */
require('dotenv').config()
const prisma = require('../src/lib/prisma')
const { logFinanceAudit } = require('../src/lib/financeAudit')

const slug = process.argv[2] || 'bliss'

function assert(cond, msg) {
  if (!cond) throw new Error(`FALLÓ: ${msg}`)
  console.log(`  ✓ ${msg}`)
}

async function main() {
  const workspace = await prisma.workspace.findUnique({ where: { slug } })
  if (!workspace) throw new Error(`No existe el workspace "${slug}"`)
  const workspaceId = workspace.id
  console.log(`Workspace: ${workspace.name} (id ${workspaceId})\n`)

  const created = {} // modelo prisma -> array de ids, para limpiar al final en orden inverso

  function track(model, id) {
    created[model] = created[model] || []
    created[model].push(id)
    return id
  }

  try {
    console.log('1. Cuenta + catálogo de impuestos (con impuesto sobre impuesto)')
    const account = await prisma.financeAccount.create({
      data: { workspaceId, name: 'Smoke Test Bank', type: 'bank', currency: 'ARS', initialBalance: '100000' },
    })
    track('financeAccount', account.id)
    assert(account.initialBalance.toString() === '100000', 'initialBalance se guardó como Decimal exacto')

    const baseTax = await prisma.financeTax.create({
      data: { workspaceId, name: 'Comisión transferencia', percentage: '0.5', appliesTo: 'both', baseType: 'movement' },
    })
    track('financeTax', baseTax.id)

    const dependentTax = await prisma.financeTax.create({
      data: { workspaceId, name: 'IVA s/ comisión', percentage: '21', appliesTo: 'both', baseType: 'other_tax', baseTaxId: baseTax.id },
    })
    track('financeTax', dependentTax.id)
    assert(dependentTax.baseTaxId === baseTax.id, 'impuesto sobre impuesto (baseTaxId) persiste')

    const accountTax1 = await prisma.financeAccountTax.create({ data: { workspaceId, accountId: account.id, taxId: baseTax.id } })
    track('financeAccountTax', accountTax1.id)
    const accountTax2 = await prisma.financeAccountTax.create({ data: { workspaceId, accountId: account.id, taxId: dependentTax.id } })
    track('financeAccountTax', accountTax2.id)

    console.log('\n2. Categoría + Item (cliente, sin seguimiento aún a Project)')
    const category = await prisma.financeCategory.create({
      data: { workspaceId, name: 'Fee mensual (smoke test)', type: 'income' },
    })
    track('financeCategory', category.id)

    const expenseCategory = await prisma.financeCategory.create({
      data: { workspaceId, name: 'Impuestos bancarios (smoke test)', type: 'expense' },
    })
    track('financeCategory', expenseCategory.id)

    const item = await prisma.financeItem.create({
      data: {
        workspaceId, name: 'Cliente Smoke Test', categoryId: category.id, tracksAccount: true,
        contactName: 'Laura Méndez', email: 'laura@smoketest.com', taxId: '30-71234567-8',
      },
    })
    track('financeItem', item.id)

    console.log('\n3. Movimiento (ingreso) con impuesto aplicado → egreso hijo')
    const movement = await prisma.financeMovement.create({
      data: {
        workspaceId, type: 'income', date: new Date(), itemId: item.id, categoryId: category.id,
        accountId: account.id, amount: '1200000', paymentMethod: 'transfer', accountApplication: 'on_account',
      },
    })
    track('financeMovement', movement.id)

    const baseAmount = 1200000
    const baseTaxAmount = Math.round(baseAmount * 0.005 * 100) / 100 // 6000
    const dependentTaxAmount = Math.round(baseTaxAmount * 0.21 * 100) / 100 // 1260

    const childMovement = await prisma.financeMovement.create({
      data: {
        workspaceId, type: 'expense', date: movement.date, itemId: item.id, categoryId: expenseCategory.id,
        accountId: account.id, amount: String(baseTaxAmount + dependentTaxAmount), sourceMovementId: movement.id,
      },
    })
    track('financeMovement', childMovement.id)

    const baseTaxLine = await prisma.financeMovementTax.create({
      data: {
        workspaceId, movementId: movement.id, taxId: baseTax.id, name: baseTax.name, percentage: baseTax.percentage,
        baseType: 'movement', baseAmount: String(baseAmount), amount: String(baseTaxAmount),
      },
    })
    track('financeMovementTax', baseTaxLine.id)

    const dependentTaxLine = await prisma.financeMovementTax.create({
      data: {
        workspaceId, movementId: movement.id, taxId: dependentTax.id, name: dependentTax.name, percentage: dependentTax.percentage,
        baseType: 'other_tax', baseTaxLineId: baseTaxLine.id, baseAmount: String(baseTaxAmount), amount: String(dependentTaxAmount),
        generatedMovementId: childMovement.id,
      },
    })
    track('financeMovementTax', dependentTaxLine.id)
    assert(dependentTaxLine.baseTaxLineId === baseTaxLine.id, 'impuesto sobre impuesto a nivel de línea aplicada persiste')

    console.log('\n4. Cheque (ingreso cobrado con cheque, pendiente de acreditar)')
    const checkMovement = await prisma.financeMovement.create({
      data: {
        workspaceId, type: 'income', date: new Date(), itemId: item.id, categoryId: category.id,
        accountId: account.id, amount: '800000', paymentMethod: 'check', accountApplication: 'on_account',
      },
    })
    track('financeMovement', checkMovement.id)

    const check = await prisma.financeCheck.create({
      data: {
        workspaceId, movementId: checkMovement.id, number: '004512', issuingBank: 'Banco Nación',
        estimatedCollectionDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      },
    })
    track('financeCheck', check.id)
    assert(check.status === 'pending', 'cheque nace pending')

    console.log('\n5. Transferencia entre cuentas (con tipo de cambio)')
    const usdAccount = await prisma.financeAccount.create({
      data: { workspaceId, name: 'Caja dólares (smoke test)', type: 'cash', currency: 'USD' },
    })
    track('financeAccount', usdAccount.id)

    const transfer = await prisma.financeTransfer.create({
      data: {
        workspaceId, date: new Date(), reason: 'buy_usd', fromAccountId: account.id, fromAmount: '145000',
        toAccountId: usdAccount.id, toAmount: '100', exchangeRate: '1450',
      },
    })
    track('financeTransfer', transfer.id)
    assert(transfer.exchangeRate.toString() === '1450', 'tipo de cambio calculado persiste')

    console.log('\n6. Valuación de fondo')
    const fundAccount = await prisma.financeAccount.update({
      where: { id: usdAccount.id }, data: { hasInvestments: true },
    })
    const valuation = await prisma.financeFundValuation.create({
      data: { workspaceId, accountId: fundAccount.id, date: new Date(), value: '105', periodResult: '5' },
    })
    track('financeFundValuation', valuation.id)

    console.log('\n7. Factura + adjunto + cobro parcial')
    const invoice = await prisma.financeInvoice.create({
      data: {
        workspaceId, itemId: item.id, number: 'FC A 0001-00000161', issueDate: new Date(),
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), concept: 'Fee octubre (smoke test)', amount: '950000',
      },
    })
    track('financeInvoice', invoice.id)

    const attachment = await prisma.financeAttachment.create({
      data: { workspaceId, invoiceId: invoice.id, name: 'FC-A-0001-00000161.pdf', mimeType: 'application/pdf', status: 'pending' },
    })
    track('financeAttachment', attachment.id)

    const partialPayment = await prisma.financeMovement.create({
      data: {
        workspaceId, type: 'income', date: new Date(), itemId: item.id, categoryId: category.id,
        accountId: account.id, amount: '400000', paymentMethod: 'transfer', accountApplication: 'invoice', invoiceId: invoice.id,
      },
    })
    track('financeMovement', partialPayment.id)

    const collectedAgg = await prisma.financeMovement.aggregate({
      where: { invoiceId: invoice.id, deletedAt: null }, _sum: { amount: true },
    })
    const collected = Number(collectedAgg._sum.amount || 0)
    assert(collected === 400000 && collected < Number(invoice.amount), 'factura queda en estado "parcial" (cobrado < monto)')

    console.log('\n8. Extra con 2 pagos (uno cobrado)')
    const extra = await prisma.financeExtra.create({
      data: {
        workspaceId, date: new Date(), itemId: item.id, action: 'Video institucional (smoke test)',
        total: '1200000', companyAmount: '840000', teamAmount: '360000', status: 'in_progress',
      },
    })
    track('financeExtra', extra.id)

    const extraPayment1 = await prisma.financeExtraPayment.create({
      data: { workspaceId, extraId: extra.id, number: 1, percentage: '50', amount: '600000', movementId: partialPayment.id },
    })
    track('financeExtraPayment', extraPayment1.id)
    const extraPayment2 = await prisma.financeExtraPayment.create({
      data: { workspaceId, extraId: extra.id, number: 2, percentage: '50', amount: '600000' },
    })
    track('financeExtraPayment', extraPayment2.id)
    assert(extraPayment1.movementId === partialPayment.id, '1 de 2 pagos del extra está cobrado')

    console.log('\n9. Próxima acción (recurrente) + Tarea generada')
    const nextAction = await prisma.financeNextAction.create({
      data: { workspaceId, itemId: item.id, text: 'Cobrar servidor anual (smoke test)', date: new Date(), recurrence: 'yearly' },
    })
    track('financeNextAction', nextAction.id)

    const task = await prisma.financeTask.create({
      data: {
        workspaceId, kind: 'generated', origin: 'check', originId: check.id,
        title: `Controlar cheque N° ${check.number} de ${item.name}`, amount: checkMovement.amount, date: check.estimatedCollectionDate,
      },
    })
    track('financeTask', task.id)

    console.log('\n10. Nota del workspace + Resumen IA (cache)')
    const note = await prisma.financeWorkspaceNote.create({
      data: { workspaceId, content: 'Preguntarle al contador por la retención de IIBB (smoke test).' },
    })
    const aiSummary = await prisma.financeAiSummary.create({
      data: { workspaceId, content: 'Resumen de prueba generado por el smoke test.', generatedAt: new Date() },
    })

    console.log('\n11. Auditoría: create + update con diff real')
    await logFinanceAudit({
      workspaceId, entityType: 'account', entityId: account.id, action: 'create',
      entityLabel: `cuenta "${account.name}"`,
    })
    await logFinanceAudit({
      workspaceId, entityType: 'movement', entityId: movement.id, action: 'update',
      entityLabel: `movimiento de ${item.name}`,
      before: { amount: '1120000' }, after: { amount: movement.amount.toString() },
      fieldLabels: { amount: { label: 'Monto', format: 'money' } },
    })
    // No-op: no debería escribir nada (mismo valor antes/después)
    const noopLog = await logFinanceAudit({
      workspaceId, entityType: 'movement', entityId: movement.id, action: 'update',
      before: { amount: movement.amount.toString() }, after: { amount: movement.amount.toString() },
      fieldLabels: { amount: { label: 'Monto', format: 'money' } },
    })
    assert(noopLog === null, 'logFinanceAudit no escribe update sin cambios reales')

    const auditLogs = await prisma.financeAuditLog.findMany({ where: { workspaceId, entityId: { in: [account.id, movement.id] } } })
    assert(auditLogs.length === 2, 'FinanceAuditLog tiene exactamente las 2 entradas esperadas (create + update)')
    const updateLog = auditLogs.find(l => l.action === 'update')
    assert(updateLog.summary.includes('$ 1.120.000') && updateLog.summary.includes('$ 1.200.000'), `summary legible correcto: "${updateLog.summary}"`)

    console.log('\n✅ Smoke test OK — 19 modelos de Finanzas ejercitados sin errores.\n')

    console.log('Limpiando datos de prueba…')
    await prisma.financeAuditLog.deleteMany({ where: { workspaceId, entityId: { in: [account.id, movement.id] } } })
    await prisma.financeWorkspaceNote.delete({ where: { id: note.id } })
    await prisma.financeAiSummary.delete({ where: { id: aiSummary.id } })
    for (const id of created.financeTask || [])          await prisma.financeTask.delete({ where: { id } })
    for (const id of created.financeNextAction || [])     await prisma.financeNextAction.delete({ where: { id } })
    for (const id of created.financeExtraPayment || [])   await prisma.financeExtraPayment.delete({ where: { id } })
    for (const id of created.financeExtra || [])          await prisma.financeExtra.delete({ where: { id } })
    for (const id of created.financeAttachment || [])     await prisma.financeAttachment.delete({ where: { id } })
    for (const id of created.financeInvoice || [])        await prisma.financeInvoice.delete({ where: { id } })
    for (const id of created.financeFundValuation || [])  await prisma.financeFundValuation.delete({ where: { id } })
    for (const id of created.financeTransfer || [])       await prisma.financeTransfer.delete({ where: { id } })
    for (const id of created.financeCheck || [])          await prisma.financeCheck.delete({ where: { id } })
    for (const id of created.financeMovementTax || [])    await prisma.financeMovementTax.delete({ where: { id } })
    // Movimientos hijos antes que padres (childMovement/checkMovement/partialPayment antes que movement)
    const movementIds = created.financeMovement || []
    for (const id of movementIds) await prisma.financeMovement.delete({ where: { id } }).catch(() => {})
    for (const id of created.financeItem || [])           await prisma.financeItem.delete({ where: { id } })
    for (const id of created.financeCategory || [])       await prisma.financeCategory.delete({ where: { id } })
    for (const id of created.financeAccountTax || [])     await prisma.financeAccountTax.delete({ where: { id } })
    for (const id of created.financeTax || [])             await prisma.financeTax.delete({ where: { id } }).catch(() => {})
    // dependentTax antes que baseTax (FK baseTaxId) — reintentar en orden inverso si falló arriba
    await prisma.financeTax.deleteMany({ where: { id: { in: created.financeTax || [] } } })
    for (const id of created.financeAccount || [])        await prisma.financeAccount.delete({ where: { id } })
    console.log('Listo — sin residuos en la DB.')
  } catch (err) {
    console.error('\n❌ Smoke test falló:', err.message)
    console.error('(datos de prueba parcialmente creados pueden haber quedado en la DB — revisar workspaceId', workspaceId, ')')
    throw err
  }
}

main()
  .then(() => { process.exitCode = 0 })
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
