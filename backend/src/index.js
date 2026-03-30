require('dotenv').config()
const dns = require('dns')
dns.setDefaultResultOrder('ipv4first')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')

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
const profileRoutes        = require('./routes/profile.routes')

const app = express()

// Security headers
app.use(helmet())

// CORS — only allow the configured frontend origin
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}))

app.use(express.json({ limit: '100kb' }))

// Rate limiting on auth endpoints
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Demasiados intentos. Intentá de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiadas solicitudes. Intentá de nuevo en 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/api/auth/login', loginLimiter)
app.use('/api/auth/forgot-password', forgotPasswordLimiter)

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
app.use('/api/profile',     profileRoutes)

app.get('/api/health', (_, res) => res.json({ ok: true }))

// Error handler — never expose internal details in production
app.use((err, req, res, next) => {
  console.error(err)
  const isProd = process.env.NODE_ENV === 'production'
  const message = isProd && !err.isOperational
    ? 'Internal server error'
    : (err.message || 'Internal server error')
  res.status(err.status || 500).json({ error: message })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
