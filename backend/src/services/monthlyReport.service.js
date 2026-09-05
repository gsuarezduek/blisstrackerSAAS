/**
 * Barrel de compatibilidad: el agregador de informes mensuales vive dividido en
 * `./monthlyReport/` (_shared.js con el período + aggregate.js el orquestador +
 * sectionBuilders/ por red + analysis.js + availability.js). Este archivo
 * reexporta la API pública de siempre para que los 2 consumidores externos
 * (monthlyReport/reportGeneration.controller.js, clientPortal.controller.js)
 * no tengan que cambiar su import.
 */

const { aggregateReportData } = require('./monthlyReport/aggregate')
const { getAvailableSections } = require('./monthlyReport/availability')
const { resolveReportPeriod } = require('./monthlyReport/_shared')

module.exports = { aggregateReportData, getAvailableSections, resolveReportPeriod }
