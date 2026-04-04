const app = require('./app')

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))

const cron = require('node-cron')
const { sendAllWeeklyReports } = require('./services/weeklyReport.service')
const { updateAllMemories }    = require('./services/insightMemory.service')

// Cron: resumen semanal — viernes 14:00 hora Buenos Aires
cron.schedule('0 14 * * 5', async () => {
  console.log('[WeeklyReport] Iniciando envío automático (viernes 14:00 ART)...')
  await sendAllWeeklyReports()
}, { timezone: 'America/Argentina/Buenos_Aires' })

// Cron: actualizar memoria de insights — sábados 00:00 hora Buenos Aires
cron.schedule('0 0 * * 6', async () => {
  console.log('[InsightMemory] Iniciando actualización semanal (sábado 00:00 ART)...')
  await updateAllMemories()
}, { timezone: 'America/Argentina/Buenos_Aires' })
