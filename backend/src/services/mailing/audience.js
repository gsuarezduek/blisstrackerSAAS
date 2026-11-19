// Audiencia de una campaña: los contactos suscriptos que están en ALGUNA de las
// bases incluidas y en NINGUNA de las excluidas. Como se consulta sobre
// MailingContact (único por proyecto+email), un contacto que está en tres bases
// incluidas sale una sola vez — el dedup lo da el modelo, no un paso aparte.
const prisma = require('../../lib/prisma')

function toIdList(v) {
  if (!Array.isArray(v)) return []
  return [...new Set(v.map(Number).filter(n => Number.isInteger(n) && n > 0))]
}

/** `where` de Prisma sobre MailingContact. Exportado para testearlo. */
function audienceWhere(projectId, includeListIds, excludeListIds) {
  const include = toIdList(includeListIds)
  const exclude = toIdList(excludeListIds)
  return {
    projectId,
    status: 'subscribed',
    // Sin bases incluidas la audiencia es vacía (nunca "todos").
    memberships: { some: { listId: { in: include } } },
    ...(exclude.length ? { NOT: { memberships: { some: { listId: { in: exclude } } } } } : {}),
  }
}

/** Filtra ids de bases a las que realmente son de este proyecto. */
async function ownListIds(projectId, ids) {
  const list = toIdList(ids)
  if (!list.length) return []
  const rows = await prisma.mailingList.findMany({ where: { projectId, id: { in: list } }, select: { id: true } })
  const own = new Set(rows.map(r => r.id))
  return list.filter(id => own.has(id))
}

async function countAudience(projectId, includeListIds, excludeListIds) {
  const include = await ownListIds(projectId, includeListIds)
  if (!include.length) return 0
  const exclude = await ownListIds(projectId, excludeListIds)
  return prisma.mailingContact.count({ where: audienceWhere(projectId, include, exclude) })
}

async function resolveAudience(projectId, includeListIds, excludeListIds) {
  const include = await ownListIds(projectId, includeListIds)
  if (!include.length) return []
  const exclude = await ownListIds(projectId, excludeListIds)
  return prisma.mailingContact.findMany({
    where: audienceWhere(projectId, include, exclude),
    select: { id: true, email: true },
    orderBy: { id: 'asc' },
  })
}

// ─── Reenvío a quienes no abrieron ───────────────────────────────────────────
// La audiencia de un reenvío no sale de las bases: son los destinatarios de la
// campaña original a los que el mail les llegó (sent/delivered) y no lo abrieron
// ni hicieron clic, y que siguen suscriptos. Un rebote, una queja o una baja en el
// medio los saca (el estado del contacto ya lo refleja).
function nonOpenersWhere(parentId) {
  return {
    campaignId: parentId,
    status: { in: ['sent', 'delivered'] },
    firstOpenedAt: null,
    firstClickedAt: null,
    contact: { status: 'subscribed' },
  }
}

async function countNonOpeners(parentId) {
  return prisma.mailingSend.count({ where: nonOpenersWhere(parentId) })
}

async function resolveNonOpeners(parentId) {
  const sends = await prisma.mailingSend.findMany({
    where: nonOpenersWhere(parentId),
    select: { contact: { select: { id: true, email: true } } },
    orderBy: { id: 'asc' },
  })
  return sends.map(s => s.contact).filter(Boolean)
}

/** Audiencia de una campaña cualquiera: reenvío o bases. */
async function campaignAudience(campaign) {
  return campaign.resendOfId
    ? resolveNonOpeners(campaign.resendOfId)
    : resolveAudience(campaign.projectId, campaign.includeListIds, campaign.excludeListIds)
}

module.exports = {
  audienceWhere, countAudience, resolveAudience, ownListIds, toIdList,
  nonOpenersWhere, countNonOpeners, resolveNonOpeners, campaignAudience,
}
