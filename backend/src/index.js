const app = require('./app')

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))

// Cron: resumen semanal — viernes 14:00 hora Buenos Aires
const cron = require('node-cron')
const { sendAllWeeklyReports } = require('./services/weeklyReport.service')

cron.schedule('0 14 * * 5', async () => {
  console.log('[WeeklyReport] Iniciando envío automático (viernes 14:00 ART)...')
  await sendAllWeeklyReports()
}, { timezone: 'America/Argentina/Buenos_Aires' })
