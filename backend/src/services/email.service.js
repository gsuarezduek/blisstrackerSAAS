/**
 * Barrel de compatibilidad: el envío de emails vive dividido por dominio en
 * `./email/` (_shared.js + accountEmails.js + workspaceEmails.js + rrhhEmails.js
 * + digestEmails.js + ventasWhatsappEmails.js + clientPortalEmails.js). Este
 * archivo reexporta todo con el mismo shape de siempre para que ningún
 * consumidor externo tenga que cambiar su import.
 */

const shared = require('./email/_shared')
const accountEmails = require('./email/accountEmails')
const workspaceEmails = require('./email/workspaceEmails')
const rrhhEmails = require('./email/rrhhEmails')
const digestEmails = require('./email/digestEmails')
const ventasWhatsappEmails = require('./email/ventasWhatsappEmails')
const clientPortalEmails = require('./email/clientPortalEmails')

module.exports = {
  // helpers/infra reexportados tal cual (algunos consumidores los usan directo)
  sendPlatformNotification: shared.sendPlatformNotification,
  platformCard: shared.platformCard,
  emailShell: shared.emailShell,
  escHtml: shared.escHtml,
  getEmailFrom: shared.getEmailFrom,
  getPlatformFrom: shared.getPlatformFrom,

  ...accountEmails,
  ...workspaceEmails,
  ...rrhhEmails,
  ...digestEmails,
  ...ventasWhatsappEmails,
  ...clientPortalEmails,
}
