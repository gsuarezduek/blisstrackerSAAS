/**
 * Barrel de compatibilidad: el motor de scraping de RRSS vive dividido por red en
 * `./socialScrape/` (_shared.js + instagram.js + linkedin.js + facebook.js). Este
 * archivo reexporta todo con el mismo shape de siempre para que ningún consumidor
 * externo (competitors.controller.js, instagram/linkedin/facebook.controller.js,
 * *Snapshot.service.js) tenga que cambiar su import.
 */

const { getApifyTokens } = require('./socialScrape/_shared')
const instagram = require('./socialScrape/instagram')
const linkedin = require('./socialScrape/linkedin')
const facebook = require('./socialScrape/facebook')

module.exports = {
  getApifyTokens,
  ...instagram,
  ...linkedin,
  ...facebook,
}
