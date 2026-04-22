require('dotenv').config()
const dns = require('dns')
dns.setDefaultResultOrder('ipv4first')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')

const authRoutes              = require('./routes/auth.routes')
const workspaceRoutes         = require('./routes/workspace.routes')
const usersRoutes             = require('./routes/users.routes')
const projectsRoutes          = require('./routes/projects.routes')
const tasksRoutes             = require('./routes/tasks.routes')
const workdaysRoutes          = require('./routes/workdays.routes')
const reportsRoutes           = require('./routes/reports.routes')
const realtimeRoutes          = require('./routes/realtime.routes')
const servicesRoutes          = require('./routes/services.routes')
const feedbackRoutes          = require('./routes/feedback.routes')
const notificationsRoutes     = require('./routes/notifications.routes')
const rolesRoutes             = require('./routes/roles.routes')
const profileRoutes           = require('./routes/profile.routes')
const insightsRoutes          = require('./routes/insights.routes')
const roleExpectationsRoutes  = require('./routes/roleExpectations.routes')
const adminProductivityRoutes = require('./routes/adminProductivity.routes')
const rrhhRoutes              = require('./routes/rrhh.routes')
const vacationRoutes          = require('./routes/vacation.routes')
const announcementsRoutes     = require('./routes/announcements.routes')
const avatarsRoutes           = require('./routes/avatars.routes')
const featureFlagsRoutes      = require('./routes/featureFlags.routes')
const marketingRoutes         = require('./routes/marketing.routes')
const superadminRoutes        = require('./routes/superadmin.routes')

const app = express()

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // permite cargar imágenes cross-origin (avatares)
}))

// CORS: acepta cualquier subdominio de blisstracker.app + localhost en dev
const APP_DOMAIN = process.env.APP_DOMAIN || 'blisstracker.app'
const SUBDOMAIN_REGEX = new RegExp(`^https://[a-z0-9-]+\\.${APP_DOMAIN.replace('.', '\\.')}$`)

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true) // server-to-server / curl
    if (
      SUBDOMAIN_REGEX.test(origin) ||
      origin === `https://${APP_DOMAIN}` ||
      origin === 'http://localhost:5173' ||
      origin === 'http://localhost:4173'
    ) {
      return callback(null, true)
    }
    callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))

app.use(express.json({ limit: '100kb' }))
app.set('trust proxy', 1)

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
app.use('/api/auth/google', loginLimiter)
app.use('/api/auth/forgot-password', forgotPasswordLimiter)

app.use('/api/auth',              authRoutes)
app.use('/api/workspaces',        workspaceRoutes)
app.use('/api/users',             usersRoutes)
app.use('/api/projects',          projectsRoutes)
app.use('/api/tasks',             tasksRoutes)
app.use('/api/workdays',          workdaysRoutes)
app.use('/api/reports',           reportsRoutes)
app.use('/api/realtime',          realtimeRoutes)
app.use('/api/services',          servicesRoutes)
app.use('/api/feedback',          feedbackRoutes)
app.use('/api/notifications',     notificationsRoutes)
app.use('/api/roles',             rolesRoutes)
app.use('/api/profile',           profileRoutes)
app.use('/api/insights',          insightsRoutes)
app.use('/api/role-expectations', roleExpectationsRoutes)
app.use('/api/admin/productivity', adminProductivityRoutes)
app.use('/api/admin/rrhh',        rrhhRoutes)
app.use('/api/vacation',          vacationRoutes)
app.use('/api/announcements',     announcementsRoutes)
app.use('/api/avatars',           avatarsRoutes)
app.use('/api/feature-flags',    featureFlagsRoutes)
app.use('/api/marketing',        marketingRoutes)
app.use('/api/superadmin',        superadminRoutes)

app.get('/api/health', (_, res) => res.json({ ok: true }))

const { handlePrismaError } = require('./lib/prismaError')

app.use((err, req, res, next) => {
  if (err.code?.startsWith?.('P2') && handlePrismaError(err, res)) return

  const isProd = process.env.NODE_ENV === 'production'
  const message = isProd && !err.isOperational
    ? 'Internal server error'
    : (err.message || 'Internal server error')
  console.error('[error]', err.code ?? err.message, '\n', err.stack ?? '')
  res.status(err.status || 500).json({ error: message })
})

module.exports = app
