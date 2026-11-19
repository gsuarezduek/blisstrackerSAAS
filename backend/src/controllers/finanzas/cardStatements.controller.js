// Tarjetas de crédito e importación de resúmenes en PDF (Finanzas → "+ Cargar"
// → Tarjeta). Ver docs/claude/finanzas.md → "Tarjetas: importar el resumen".
//
// Flujo en dos pasos, sin estado intermedio en el servidor:
//   1. POST /card-statements/parse — lee el PDF y devuelve la vista previa:
//      renglones agrupados por comercio, la categoría sugerida para cada grupo
//      (memoria de la tarjeta → memoria del workspace → IA), los renglones ya
//      importados antes y el control de saldos. No escribe nada.
//   2. POST /card-statements — el front vuelve a mandar el PDF + lo que el
//      usuario confirmó. Crea los movimientos, guarda el PDF por un año y
//      actualiza la memoria con lo que quedó (sugerido o corregido).
const prisma = require('../../lib/prisma')
const objectStorage = require('../../services/objectStorage.service')
const { logFinanceAudit } = require('../../lib/financeAudit')
const { toDecimal } = require('../../lib/financeMoney')
const { detectDocumentType } = require('../../lib/documentType')
const { businessError } = require('./_shared')
const {
  CURRENCIES, IMPORTABLE_KINDS, movementTypeForKind, normalizeMerchantKey, findRuleForKey,
  sanitizeLines, checkTotals, groupLines, movementNote, normalizeDate,
} = require('../../lib/cardStatement')
const parser = require('../../services/cardStatementParser.service')

const FILE_RETENTION_DAYS = 365
const CARD_INCLUDE = {
  arsAccount: { select: { id: true, name: true, currency: true } },
  usdAccount: { select: { id: true, name: true, currency: true } },
}

function cleanLast4(v) {
  if (v == null || v === '') return null
  const digits = String(v).replace(/\D/g, '')
  if (digits.length !== 4) throw businessError(400, 'Los últimos 4 dígitos tienen que ser 4 números')
  return digits
}

/** La cuenta existe en el workspace y es de la moneda esperada (o null si no vino). */
async function resolveAccount(workspaceId, accountId, currency) {
  if (accountId == null || accountId === '') return null
  const id = Number(accountId)
  if (!Number.isInteger(id)) throw businessError(400, 'Cuenta inválida')
  const account = await prisma.financeAccount.findFirst({ where: { id, workspaceId }, select: { id: true, name: true, currency: true } })
  if (!account) throw businessError(400, 'Cuenta no encontrada')
  if (account.currency !== currency) {
    throw businessError(400, `La cuenta "${account.name}" es en ${account.currency}: para los consumos en ${currency === 'ARS' ? 'pesos' : 'dólares'} elegí una cuenta en ${currency}`)
  }
  return account
}

// GET /api/finanzas/cards
async function listCards(req, res, next) {
  try {
    const cards = await prisma.financeCard.findMany({
      where: { workspaceId: req.workspace.id, active: true },
      orderBy: { name: 'asc' },
      include: CARD_INCLUDE,
    })
    res.json(cards)
  } catch (err) { next(err) }
}

// POST /api/finanzas/cards — { name, last4?, arsAccountId?, usdAccountId? }
async function createCard(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const name = String(req.body.name || '').trim()
    if (!name) return res.status(400).json({ error: 'Poné un nombre para la tarjeta' })
    const last4 = cleanLast4(req.body.last4)
    const [ars, usd] = await Promise.all([
      resolveAccount(workspaceId, req.body.arsAccountId, 'ARS'),
      resolveAccount(workspaceId, req.body.usdAccountId, 'USD'),
    ])
    const card = await prisma.financeCard.create({
      data: { workspaceId, name, last4, arsAccountId: ars?.id ?? null, usdAccountId: usd?.id ?? null, createdById: req.user.userId },
      include: CARD_INCLUDE,
    })
    res.status(201).json(card)
  } catch (err) { next(err) }
}

// PATCH /api/finanzas/cards/:id — { name?, last4?, arsAccountId?, usdAccountId?, active? }
async function updateCard(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeCard.findFirst({ where: { id, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Tarjeta no encontrada' })
    const data = {}
    if (req.body.name !== undefined) {
      const name = String(req.body.name || '').trim()
      if (!name) return res.status(400).json({ error: 'Poné un nombre para la tarjeta' })
      data.name = name
    }
    if (req.body.last4 !== undefined) data.last4 = cleanLast4(req.body.last4)
    if (req.body.arsAccountId !== undefined) data.arsAccountId = (await resolveAccount(workspaceId, req.body.arsAccountId, 'ARS'))?.id ?? null
    if (req.body.usdAccountId !== undefined) data.usdAccountId = (await resolveAccount(workspaceId, req.body.usdAccountId, 'USD'))?.id ?? null
    if (req.body.active !== undefined) data.active = !!req.body.active
    const card = await prisma.financeCard.update({ where: { id }, data, include: CARD_INCLUDE })
    res.json(card)
  } catch (err) { next(err) }
}

async function loadCard(workspaceId, cardId) {
  const id = Number(cardId)
  if (!Number.isInteger(id)) throw businessError(400, 'Elegí una tarjeta')
  const card = await prisma.financeCard.findFirst({ where: { id, workspaceId }, include: CARD_INCLUDE })
  if (!card) throw businessError(404, 'Tarjeta no encontrada')
  return card
}

function assertPdf(file) {
  if (!file?.buffer?.length) throw businessError(400, 'Subí el PDF del resumen')
  if (detectDocumentType(file.buffer) !== 'pdf') throw businessError(400, 'El archivo no es un PDF')
}

/** Errores del lector con `code` (clave del PDF, sin texto…): el front los necesita para pedir la clave. */
function sendParserError(err, res, next) {
  if (err?.isOperational && err.code) return res.status(err.status || 422).json({ error: err.message, code: err.code })
  return next(err)
}

/**
 * Renglones de esta tarjeta que ya se importaron y siguen con su movimiento
 * vivo, por huella. Un renglón cuyo movimiento se borró (o cuya importación se
 * deshizo) se puede volver a importar.
 */
async function importedFingerprints(cardId, fingerprints) {
  if (fingerprints.length === 0) return new Set()
  const rows = await prisma.financeCardStatementLine.findMany({
    where: { cardId, fingerprint: { in: fingerprints }, movementId: { not: null }, movement: { deletedAt: null } },
    select: { fingerprint: true },
  })
  return new Set(rows.map(r => r.fingerprint))
}

/** Catálogo para sugerir: categorías activas e items activos que no son clientes. */
async function loadCatalog(workspaceId) {
  const [categories, items] = await Promise.all([
    prisma.financeCategory.findMany({ where: { workspaceId, active: true }, select: { id: true, name: true, type: true } }),
    prisma.financeItem.findMany({
      where: { workspaceId, active: true, tracksAccount: false },
      select: { id: true, name: true, categoryId: true },
    }),
  ])
  return { categories, items }
}

// POST /api/finanzas/card-statements/parse — multipart: file, cardId, password?
async function parseStatement(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const card = await loadCard(workspaceId, req.body.cardId)
    assertPdf(req.file)

    const { text, encrypted } = await parser.extractPdfText(req.file.buffer, req.body.password || null)
    const extracted = await parser.extractStatement(text, { workspaceId, userId: req.user.userId })
    if (!extracted?.isCardStatement) {
      return res.status(422).json({ error: 'El PDF no parece un resumen de tarjeta de crédito.', code: 'NOT_A_STATEMENT' })
    }

    const { lines, dropped } = sanitizeLines(extracted.lines)
    const checks = checkTotals(lines, extracted.balances)
    const imported = await importedFingerprints(card.id, lines.map(l => l.fingerprint))
    const fresh = lines.filter(l => !imported.has(l.fingerprint))
    const groups = groupLines(fresh)

    // Memoria: primero esta tarjeta, después cualquier otra del workspace.
    const [cardRules, workspaceRules] = await Promise.all([
      prisma.financeCardRule.findMany({
        where: { cardId: card.id, item: { active: true }, category: { active: true } },
        select: { merchantKey: true, type: true, itemId: true, categoryId: true },
      }),
      prisma.financeCardRule.findMany({
        where: { workspaceId, cardId: { not: card.id }, item: { active: true }, category: { active: true } },
        orderBy: { updatedAt: 'desc' },
        select: { merchantKey: true, type: true, itemId: true, categoryId: true },
      }),
    ])
    const unknown = []
    for (const g of groups) {
      const fromCard = findRuleForKey(cardRules.filter(r => r.type === g.type), g.merchantKey)
      const fromWorkspace = fromCard ? null : findRuleForKey(workspaceRules.filter(r => r.type === g.type), g.merchantKey)
      const rule = fromCard || fromWorkspace
      if (rule) g.suggestion = { itemId: rule.itemId, categoryId: rule.categoryId, newItemName: null, source: fromCard ? 'card' : 'workspace' }
      else unknown.push({ key: g.merchantKey, type: g.type, examples: [...new Set(g.lines.map(l => l.description))] })
    }
    if (unknown.length) {
      const catalog = await loadCatalog(workspaceId)
      // Un mismo comercio puede aparecer en pesos y en dólares: una sola consulta por clave + tipo.
      const uniqueUnknown = [...new Map(unknown.map(u => [`${u.key}|${u.type}`, u])).values()]
      const byKey = new Map()
      for (const type of ['expense', 'income']) {
        const merchants = uniqueUnknown.filter(u => u.type === type)
        if (!merchants.length) continue
        const suggestions = await parser.suggestCategories(merchants, catalog, { workspaceId, userId: req.user.userId })
        for (const [key, s] of suggestions) byKey.set(`${key}|${type}`, s)
      }
      for (const g of groups) {
        if (g.suggestion) continue
        const s = byKey.get(`${g.merchantKey}|${g.type}`)
        g.suggestion = s ? { ...s, source: 'ai' } : { itemId: null, categoryId: null, newItemName: null, source: null }
      }
    }

    res.json({
      card,
      statement: {
        bank: extracted.bank || null,
        cardBrand: extracted.cardBrand || null,
        last4: extracted.last4 ? String(extracted.last4).replace(/\D/g, '').slice(-4) || null : null,
        closingDate: normalizeDate(extracted.closingDate),
        dueDate: normalizeDate(extracted.dueDate),
        encrypted,
      },
      checks,
      groups,
      payments: lines.filter(l => l.kind === 'payment'),
      alreadyImported: lines.filter(l => imported.has(l.fingerprint)),
      droppedLines: dropped,
    })
  } catch (err) { sendParserError(err, res, next) }
}

/**
 * Valida un grupo confirmado y lo deja listo para crear: renglones limpios
 * (mismo criterio que la vista previa — el monto se recalcula de los
 * renglones, nunca se toma un total del cliente), tipo coherente con los
 * renglones, item o item nuevo, categoría del tipo correcto.
 */
function normalizeGroup(raw) {
  const type = raw?.type === 'income' ? 'income' : raw?.type === 'expense' ? 'expense' : null
  const currency = CURRENCIES.includes(raw?.currency) ? raw.currency : null
  if (!type || !currency) throw businessError(400, 'Grupo inválido')
  const { lines } = sanitizeLines(raw.lines)
  if (lines.length === 0 || lines.length !== (raw.lines || []).length) throw businessError(400, 'Hay renglones inválidos en la importación')
  // La huella de la vista previa se calculó sobre el resumen entero (el "#2"
  // de dos renglones idénticos depende de los demás): se respeta la que vino.
  lines.forEach((l, i) => {
    const fp = raw.lines[i]?.fingerprint
    if (typeof fp === 'string' && /^[0-9a-f]{40}$/.test(fp)) l.fingerprint = fp
  })
  for (const l of lines) {
    if (!IMPORTABLE_KINDS.includes(l.kind) || movementTypeForKind(l.kind) !== type || l.currency !== currency) {
      throw businessError(400, 'Hay renglones que no corresponden a su grupo')
    }
  }
  const itemId = raw.itemId == null ? null : Number(raw.itemId)
  const newItemName = !itemId && typeof raw.newItemName === 'string' ? raw.newItemName.trim().slice(0, 80) : ''
  const categoryId = Number(raw.categoryId)
  if (!itemId && !newItemName) throw businessError(400, `Falta el item de "${lines[0].description}"`)
  if (!Number.isInteger(categoryId)) throw businessError(400, `Falta la categoría de "${lines[0].description}"`)
  // La clave se recalcula acá (no se confía en la del cliente): es la llave de la memoria.
  const merchantKey = normalizeMerchantKey(lines[0].description)
  return { type, currency, lines, itemId, newItemName, categoryId, merchantKey }
}

// POST /api/finanzas/card-statements — multipart: file + payload (JSON):
// { cardId, arsAccountId?, usdAccountId?, dateMode: 'due'|'line', closingDate?, dueDate?, encrypted?, checks?, groups: [...] }
async function confirmStatement(req, res, next) {
  let uploadedKey = null
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    let payload
    try { payload = JSON.parse(req.body.payload || '{}') } catch { return res.status(400).json({ error: 'Datos inválidos' }) }
    const card = await loadCard(workspaceId, payload.cardId)
    assertPdf(req.file)

    const rawGroups = Array.isArray(payload.groups) ? payload.groups : []
    if (rawGroups.length === 0) return res.status(400).json({ error: 'No hay nada para importar' })
    const groups = rawGroups.map(normalizeGroup)

    const needs = new Set(groups.map(g => g.currency))
    const accounts = {
      ARS: needs.has('ARS') ? await resolveAccount(workspaceId, payload.arsAccountId, 'ARS') : null,
      USD: needs.has('USD') ? await resolveAccount(workspaceId, payload.usdAccountId, 'USD') : null,
    }
    for (const c of needs) {
      if (!accounts[c]) return res.status(400).json({ error: `Elegí de qué cuenta en ${c === 'ARS' ? 'pesos' : 'dólares'} se pagan los consumos en ${c}` })
    }

    const closingDate = normalizeDate(payload.closingDate)
    const dueDate = normalizeDate(payload.dueDate)
    const dateMode = payload.dateMode === 'line' ? 'line' : 'due'
    const statementDate = dueDate || closingDate
    if (dateMode === 'due' && !statementDate) return res.status(400).json({ error: 'El resumen no tiene vencimiento: elegí "fecha de cada consumo"' })

    // Items y categorías: que existan en el workspace y que la categoría sea del tipo del grupo.
    const itemIds = [...new Set(groups.map(g => g.itemId).filter(Boolean))]
    const categoryIds = [...new Set(groups.map(g => g.categoryId))]
    const [items, categories] = await Promise.all([
      prisma.financeItem.findMany({ where: { workspaceId, id: { in: itemIds } }, select: { id: true, name: true, tracksAccount: true } }),
      prisma.financeCategory.findMany({ where: { workspaceId, id: { in: categoryIds } }, select: { id: true, type: true } }),
    ])
    const itemsById = new Map(items.map(i => [i.id, i]))
    const categoriesById = new Map(categories.map(c => [c.id, c]))
    for (const g of groups) {
      if (g.itemId && !itemsById.has(g.itemId)) return res.status(400).json({ error: 'Item no encontrado' })
      const cat = categoriesById.get(g.categoryId)
      if (!cat) return res.status(400).json({ error: 'Categoría no encontrada' })
      if (cat.type !== g.type) return res.status(400).json({ error: `La categoría de "${g.lines[0].description}" es de ${cat.type === 'income' ? 'ingresos' : 'egresos'}` })
    }

    // Duplicados: si entre la vista previa y la confirmación ya se importaron
    // (dos pestañas, doble click), esos renglones se saltean.
    const imported = await importedFingerprints(card.id, groups.flatMap(g => g.lines.map(l => l.fingerprint)))
    for (const g of groups) g.lines = g.lines.filter(l => !imported.has(l.fingerprint))
    const toCreate = groups.filter(g => g.lines.length > 0)
    if (toCreate.length === 0) return res.status(409).json({ error: 'Todos estos renglones ya estaban importados' })

    // El PDF se sube antes de la transacción; si la transacción falla se borra.
    let file = null
    if (objectStorage.isConfigured()) {
      const put = await objectStorage.putObject(req.file.buffer, 'application/pdf', { prefix: `finance/${workspaceId}/card-statements` })
      uploadedKey = put.key
      file = { fileKey: put.key, fileSize: put.size }
    }
    const expiresAt = new Date(Date.now() + FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const checks = Array.isArray(payload.checks) ? payload.checks.slice(0, 4) : []

    const created = await prisma.$transaction(async (tx) => {
      const statement = await tx.financeCardStatement.create({
        data: {
          workspaceId, cardId: card.id,
          closingDate: closingDate ? new Date(`${closingDate}T12:00:00Z`) : null,
          dueDate: dueDate ? new Date(`${dueDate}T12:00:00Z`) : null,
          fileKey: file?.fileKey ?? null,
          fileName: file ? String(req.file.originalname || 'resumen.pdf').slice(0, 200) : null,
          fileSize: file?.fileSize ?? null,
          fileEncrypted: !!payload.encrypted,
          fileExpiresAt: file ? expiresAt : null,
          summary: { checks },
          createdById: userId,
        },
      })

      // Items nuevos: si ya existe uno con ese nombre se reusa (mismo criterio de duplicado que items.controller.js).
      const newItemIds = new Map()
      for (const g of toCreate) {
        if (g.itemId) continue
        const lower = g.newItemName.toLowerCase()
        if (!newItemIds.has(lower)) {
          const existing = await tx.financeItem.findFirst({ where: { workspaceId, name: { equals: g.newItemName, mode: 'insensitive' } }, select: { id: true, name: true, tracksAccount: true } })
          const item = existing || await tx.financeItem.create({ data: { workspaceId, name: g.newItemName, categoryId: g.categoryId }, select: { id: true, name: true, tracksAccount: true } })
          newItemIds.set(lower, item)
          itemsById.set(item.id, item)
        }
        g.itemId = newItemIds.get(lower).id
      }

      const movements = []
      for (const g of toCreate) {
        const item = itemsById.get(g.itemId)
        const total = g.lines.reduce((acc, l) => acc.plus(toDecimal(l.amount)), toDecimal(0))
        const date = dateMode === 'due' ? statementDate : g.lines.map(l => l.date).sort().at(-1)
        const movement = await tx.financeMovement.create({
          data: {
            workspaceId, type: g.type, date: new Date(`${date}T12:00:00Z`),
            itemId: g.itemId, categoryId: g.categoryId, accountId: accounts[g.currency].id,
            amount: total.toFixed(2), note: movementNote(card.name, g.lines),
            // Un reintegro de la tarjeta entra como transferencia; si el item
            // elegido es un cliente, no toca su cuenta corriente.
            paymentMethod: g.type === 'income' ? 'transfer' : null,
            accountApplication: g.type === 'income' && item?.tracksAccount ? 'no_effect' : null,
            createdById: userId,
          },
        })
        await tx.financeCardStatementLine.createMany({
          data: g.lines.map(l => ({
            workspaceId, cardId: card.id, statementId: statement.id,
            date: new Date(`${l.date}T12:00:00Z`), description: l.description, merchantKey: l.merchantKey,
            currency: l.currency, amount: l.amount, kind: l.kind, fingerprint: l.fingerprint, movementId: movement.id,
          })),
        })
        // Memoria: lo que quedó es como esta tarjeta anota este comercio.
        await tx.financeCardRule.upsert({
          where: { cardId_merchantKey_type: { cardId: card.id, merchantKey: g.merchantKey, type: g.type } },
          create: { workspaceId, cardId: card.id, merchantKey: g.merchantKey, type: g.type, itemId: g.itemId, categoryId: g.categoryId },
          update: { itemId: g.itemId, categoryId: g.categoryId },
        })
        movements.push({ id: movement.id, type: g.type, itemName: item?.name || g.newItemName })
      }

      // La próxima vez arranca con las mismas cuentas.
      await tx.financeCard.update({
        where: { id: card.id },
        data: {
          ...(accounts.ARS ? { arsAccountId: accounts.ARS.id } : {}),
          ...(accounts.USD ? { usdAccountId: accounts.USD.id } : {}),
        },
      })
      return { statement, movements }
    })
    uploadedKey = null

    await logFinanceAudit({
      workspaceId, entityType: 'cardStatement', entityId: created.statement.id, action: 'create', userId,
      entityLabel: `resumen de ${card.name}${closingDate ? ` (cierre ${closingDate})` : ''} — ${created.movements.length} movimientos`,
    })
    for (const m of created.movements) {
      await logFinanceAudit({
        workspaceId, entityType: 'movement', entityId: m.id, action: 'create', userId,
        entityLabel: `${m.type === 'income' ? 'ingreso' : 'egreso'} de ${m.itemName} (resumen de ${card.name})`,
      })
    }

    res.status(201).json({
      statementId: created.statement.id,
      movements: created.movements.length,
      skippedDuplicates: imported.size,
      fileStored: !!file,
    })
  } catch (err) {
    if (uploadedKey) objectStorage.deleteObject(uploadedKey).catch(() => {})
    next(err)
  }
}

// GET /api/finanzas/cards/:id/statements — importaciones de la tarjeta (las vivas)
async function listStatements(req, res, next) {
  try {
    const card = await loadCard(req.workspace.id, req.params.id)
    const statements = await prisma.financeCardStatement.findMany({
      where: { cardId: card.id, deletedAt: null },
      orderBy: [{ closingDate: 'desc' }, { createdAt: 'desc' }],
      take: 24,
      select: {
        id: true, closingDate: true, dueDate: true, fileKey: true, fileName: true, fileEncrypted: true, fileExpiresAt: true, createdAt: true,
        lines: { select: { movementId: true, movement: { select: { deletedAt: true } } } },
      },
    })
    res.json(statements.map(s => ({
      id: s.id, closingDate: s.closingDate, dueDate: s.dueDate, createdAt: s.createdAt,
      hasFile: !!s.fileKey, fileName: s.fileName, fileEncrypted: s.fileEncrypted, fileExpiresAt: s.fileExpiresAt,
      movements: new Set(s.lines.filter(l => l.movementId && !l.movement?.deletedAt).map(l => l.movementId)).size,
      lines: s.lines.length,
    })))
  } catch (err) { next(err) }
}

// GET /api/finanzas/card-statements/:id/pdf — el PDF original, servido por el backend (ruta autenticada)
async function downloadStatementPdf(req, res, next) {
  try {
    const statement = await prisma.financeCardStatement.findFirst({ where: { id: Number(req.params.id), workspaceId: req.workspace.id, deletedAt: null } })
    if (!statement) return res.status(404).json({ error: 'Resumen no encontrado' })
    if (!statement.fileKey || !objectStorage.isConfigured()) return res.status(404).json({ error: 'El PDF de este resumen ya no está guardado' })
    const { body, contentLength } = await objectStorage.getObjectStream(statement.fileKey)
    res.setHeader('Content-Type', 'application/pdf')
    if (contentLength) res.setHeader('Content-Length', contentLength)
    const { safeContentDisposition } = require('../../lib/contentDisposition')
    res.setHeader('Content-Disposition', safeContentDisposition(statement.fileName || 'resumen.pdf', { type: 'inline' }))
    body.pipe(res)
  } catch (err) { next(err) }
}

// DELETE /api/finanzas/card-statements/:id — deshace la importación: borra
// (soft) sus movimientos y el PDF. La memoria de categorías se conserva.
async function deleteStatement(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const statement = await prisma.financeCardStatement.findFirst({
      where: { id: Number(req.params.id), workspaceId, deletedAt: null },
      include: { card: { select: { name: true } }, lines: { select: { movementId: true } } },
    })
    if (!statement) return res.status(404).json({ error: 'Resumen no encontrado' })
    const movementIds = [...new Set(statement.lines.map(l => l.movementId).filter(Boolean))]
    const now = new Date()
    const deleted = await prisma.$transaction(async (tx) => {
      const alive = await tx.financeMovement.findMany({ where: { id: { in: movementIds }, deletedAt: null }, select: { id: true } })
      const ids = alive.map(m => m.id)
      if (ids.length) {
        await tx.financeMovement.updateMany({ where: { id: { in: ids } }, data: { deletedAt: now, deletedById: userId } })
        await tx.financeMovement.updateMany({ where: { sourceMovementId: { in: ids }, deletedAt: null }, data: { deletedAt: now, deletedById: userId } })
      }
      await tx.financeCardStatement.update({ where: { id: statement.id }, data: { deletedAt: now, deletedById: userId, fileKey: null } })
      return ids
    })
    if (statement.fileKey) objectStorage.deleteObject(statement.fileKey).catch(() => {})

    await logFinanceAudit({
      workspaceId, entityType: 'cardStatement', entityId: statement.id, action: 'delete', userId,
      entityLabel: `resumen de ${statement.card.name} — ${deleted.length} movimientos borrados`,
    })
    for (const id of deleted) {
      await logFinanceAudit({ workspaceId, entityType: 'movement', entityId: id, action: 'delete', userId, entityLabel: `movimiento del resumen de ${statement.card.name}` })
    }
    res.json({ ok: true, movements: deleted.length })
  } catch (err) { next(err) }
}

/**
 * Cron `cardStatementPurge`: borra de R2 los PDFs con más de un año
 * (`fileExpiresAt` vencido). Los movimientos y renglones quedan; solo se va el
 * archivo. Devuelve cuántos borró.
 */
async function purgeExpiredStatementFiles(now = new Date()) {
  const expired = await prisma.financeCardStatement.findMany({
    where: { fileKey: { not: null }, fileExpiresAt: { lte: now } },
    select: { id: true, fileKey: true },
    take: 500,
  })
  if (expired.length === 0) return 0
  await objectStorage.deleteObjects(expired.map(s => s.fileKey))
  await prisma.financeCardStatement.updateMany({ where: { id: { in: expired.map(s => s.id) } }, data: { fileKey: null } })
  return expired.length
}

module.exports = {
  listCards, createCard, updateCard,
  parseStatement, confirmStatement, listStatements, downloadStatementPdf, deleteStatement,
  purgeExpiredStatementFiles,
}
