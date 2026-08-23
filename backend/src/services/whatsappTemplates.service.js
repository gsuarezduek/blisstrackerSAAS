const prisma = require('../lib/prisma')
const { getProvider, decryptAccount } = require('../lib/whatsappProvider')

/** Reemplaza {{1}}, {{2}}… por los valores dados, en orden — para mostrar el
 * texto legible en nuestro propio hilo (Meta solo ve los `parameters`, no el
 * texto renderizado). */
function renderTemplateBody(bodyText, variables = []) {
  if (!bodyText) return ''
  return bodyText.replace(/\{\{(\d+)\}\}/g, (match, n) => variables[Number(n) - 1] ?? match)
}

/**
 * Sincroniza el catálogo de plantillas del WABA (Fase 5 del plan) — solo
 * lectura de nuestro lado, ver WhatsappTemplate en el schema. Upsert por
 * (accountId, externalId) para no duplicar en re-sincronizaciones.
 */
async function syncTemplates(account) {
  const provider = getProvider(account.provider)
  const decrypted = decryptAccount(account)
  const { templates } = await provider.listTemplates({ account: decrypted })

  for (const t of templates) {
    const bodyComponent = (t.components || []).find(c => String(c.type).toUpperCase() === 'BODY')
    const bodyText = bodyComponent?.text || null
    const variableCount = bodyText ? (bodyText.match(/\{\{\d+\}\}/g) || []).length : 0

    await prisma.whatsappTemplate.upsert({
      where: { accountId_externalId: { accountId: account.id, externalId: String(t.id) } },
      update: {
        name: t.name, language: t.language, category: t.category, status: t.status,
        bodyText, variableCount, syncedAt: new Date(),
      },
      create: {
        workspaceId: account.workspaceId, accountId: account.id, externalId: String(t.id),
        name: t.name, language: t.language, category: t.category, status: t.status,
        bodyText, variableCount,
      },
    })
  }

  return templates.length
}

module.exports = { syncTemplates, renderTemplateBody }
