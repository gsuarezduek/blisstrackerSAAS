require('dotenv').config()
const dns = require('dns')
dns.setDefaultResultOrder('ipv4first')
const express = require('express')
const cors = require('cors')

const authRoutes = require('./routes/auth.routes')
const usersRoutes = require('./routes/users.routes')
const projectsRoutes = require('./routes/projects.routes')
const tasksRoutes = require('./routes/tasks.routes')
const workdaysRoutes = require('./routes/workdays.routes')
const reportsRoutes = require('./routes/reports.routes')
const realtimeRoutes = require('./routes/realtime.routes')
const servicesRoutes = require('./routes/services.routes')
const feedbackRoutes       = require('./routes/feedback.routes')
const notificationsRoutes  = require('./routes/notifications.routes')
const rolesRoutes          = require('./routes/roles.routes')

const app = express()

app.use(cors())
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/projects', projectsRoutes)
app.use('/api/tasks', tasksRoutes)
app.use('/api/workdays', workdaysRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/realtime', realtimeRoutes)
app.use('/api/services', servicesRoutes)
app.use('/api/feedback',      feedbackRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/roles',        rolesRoutes)

app.get('/api/health', (_, res) => res.json({ ok: true }))

app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
