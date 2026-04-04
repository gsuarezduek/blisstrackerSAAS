# BlissTracker

Aplicación web para gestión de tareas diarias del equipo de Bliss Marketing.

## Stack

- **Backend:** Node.js + Express + Prisma + PostgreSQL
- **Frontend:** React 18 + Vite + Tailwind CSS + React Router v6
- **Auth:** JWT (12h), almacenado en localStorage + Google OAuth 2
- **Email:** Resend (API HTTP — no SMTP)
- **IA:** Anthropic Claude Haiku — insight diario, memoria de productividad y resumen semanal
- **Tests:** Jest + Supertest (backend) · Vitest + React Testing Library (frontend)
- **Deploy:** Railway (backend + BD) · Vercel (frontend)

---

## Desarrollo local

### Requisitos
- Node.js 18+
- PostgreSQL 14+

### 1. Backend

```bash
cd backend
cp .env.example .env
# Editar .env con las variables requeridas (ver abajo)
npm install
npm run db:migrate:dev     # crea las tablas
npm run db:seed            # crea admin, roles por defecto y proyecto Bliss
npm run dev
```

La API corre en `http://localhost:3001`

**Variables de entorno requeridas:**

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/team_tracker
JWT_SECRET=un_string_largo_y_aleatorio
RESEND_API_KEY=re_xxxxxxxxxxxx
FRONTEND_URL=http://localhost:5173
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
ANTHROPIC_API_KEY=sk-ant-...
```

**Credenciales por defecto:**
- Email: `admin@blissmkt.ar`
- Password: `admin123` ← cambiarlo desde el panel de admin

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

La app corre en `http://localhost:5173`

**Variables de entorno:**

```env
# frontend/.env.development
VITE_API_URL=http://localhost:3001
VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com

# frontend/.env.production
VITE_API_URL=https://tu-backend.up.railway.app
VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
```

---

## Tests

```bash
# Backend (Jest + Supertest — sin DB real, todo mockeado)
cd backend
npm test               # corre todos los tests
npm run test:watch     # modo watch mientras desarrollás
npm run test:coverage  # con reporte de cobertura

# Frontend (Vitest + React Testing Library)
cd frontend
npm test               # modo watch
npm run test:run       # corre una vez
npm run test:coverage
```

**Cobertura actual:** 27 tests backend · 30 tests frontend

---

## Deploy en producción

### Backend (Railway)

1. Crear un nuevo proyecto en Railway con servicio PostgreSQL
2. Agregar las variables de entorno en el panel de Railway:
   - `DATABASE_URL` (provista por Railway automáticamente)
   - `JWT_SECRET`, `RESEND_API_KEY`, `FRONTEND_URL`
   - `GOOGLE_CLIENT_ID`, `ANTHROPIC_API_KEY`
3. Railway corre `npm run db:migrate` automáticamente al deployar
4. Ejecutar el seed manualmente una sola vez desde Railway Shell: `node prisma/seed.js`

### Frontend (Vercel)

1. Importar el repositorio en Vercel apuntando a la carpeta `/frontend`
2. Agregar variables de entorno: `VITE_API_URL` y `VITE_GOOGLE_CLIENT_ID`
3. El archivo `vercel.json` ya incluye las reglas de rewrite para React Router SPA

---

## Estructura del proyecto

```
team-tracker/
├── backend/
│   ├── jest.config.js
│   ├── tests/
│   │   ├── setup.js
│   │   ├── unit/
│   │   │   ├── auth.middleware.test.js
│   │   │   └── assertNoActiveTask.test.js
│   │   └── integration/
│   │       ├── auth.test.js
│   │       └── starTask.test.js
│   ├── prisma/
│   │   ├── schema.prisma        # Modelos de base de datos
│   │   ├── migrations/          # Historial de migraciones
│   │   └── seed.js              # Admin inicial, roles por defecto y proyecto Bliss
│   └── src/
│       ├── app.js               # Express app (sin listen, importable en tests)
│       ├── index.js             # Punto de entrada: listen + crons viernes/sábado
│       ├── controllers/
│       │   ├── auth.controller.js          # Login, Google OAuth, forgot/reset password
│       │   ├── workdays.controller.js      # Jornada diaria + carry-over
│       │   ├── tasks.controller.js         # CRUD tareas + block/unblock/star
│       │   ├── projects.controller.js      # Proyectos + tareas + historial paginado
│       │   ├── profile.controller.js       # Perfil personal + avatar + preferencias (4 flags IA)
│       │   ├── insights.controller.js      # Insight diario con IA: generar, refrescar, feedback
│       │   ├── roleExpectations.controller.js  # Expectativas de rol para coaching IA
│       │   ├── reports.controller.js       # Reportes por proyecto/usuario
│       │   ├── realtime.controller.js      # Snapshot del equipo en tiempo real
│       │   ├── notifications.controller.js
│       │   ├── roles.controller.js
│       │   ├── feedback.controller.js
│       │   └── users.controller.js
│       ├── middleware/
│       │   └── auth.js           # JWT auth + adminOnly (chequea isAdmin)
│       ├── services/
│       │   ├── email.service.js        # Resend: reset, bienvenida, resumen semanal
│       │   ├── weeklyReport.service.js # Resumen semanal con Claude Haiku + cron viernes 14:00
│       │   └── insightMemory.service.js # Memoria de productividad semanal + cron sábado 00:00
│       ├── routes/
│       │   ├── insights.routes.js          # GET / · POST /refresh · POST /feedback
│       │   └── roleExpectations.routes.js  # GET /mine · GET / · GET /:role · PUT /:role
│       ├── utils/
│       │   └── dates.js          # todayString() en timezone Buenos Aires
│       └── lib/
│           └── prisma.js         # Singleton PrismaClient
└── frontend/
    ├── public/
    │   ├── blisstracker_logo.svg # Logo principal
    │   ├── favicon.ico / favicon-*.png / apple-touch-icon.png / logo-*.png
    │   └── perfiles/             # Avatares PNG (bee.png, beeartist.png, etc.)
    └── src/
        ├── tests/
        │   ├── setup.js
        │   ├── utils/
        │   │   ├── format.test.js
        │   │   └── linkify.test.jsx
        │   └── hooks/
        │       └── useRoles.test.js
        ├── pages/
        │   ├── Login2.jsx            # Login + Google OAuth + link a recuperar contraseña
        │   ├── ForgotPassword.jsx    # Solicitar link de reset
        │   ├── ResetPassword.jsx     # Formulario de nueva contraseña
        │   ├── Dashboard.jsx         # Tareas del día + insight diario IA (con feedback y refresh)
        │   ├── MyProjects.jsx        # Proyectos con pills de conteos de tareas
        │   ├── ProjectDetail.jsx     # Tareas activas + completadas semana + archivo histórico
        │   ├── MyReports.jsx         # Reportes personales
        │   ├── RealTime.jsx          # Actividad del equipo en tiempo real
        │   ├── Reports.jsx           # Reportes completos (admin)
        │   ├── Admin.jsx             # Panel de administración (con deep linking ?tab=)
        │   ├── MyProfile.jsx         # Perfil personal, avatar y datos personales
        │   └── Preferences.jsx       # Sistema IA: insight diario, memoria, calidad, resumen semanal
        ├── components/
        │   ├── Navbar.jsx            # Logo + nombre + dropdown de usuario
        │   ├── TaskCard.jsx          # Tarjeta de tarea con todas las acciones + link al proyecto
        │   ├── AddTaskModal.jsx      # Modal con combobox de proyecto + asignación
        │   ├── NotificationBell.jsx  # Campana con panel (completadas en azul, bloqueadas en rojo)
        │   ├── FeedbackButton.jsx
        │   ├── InactivityModal.jsx
        │   ├── UserTasksModal.jsx
        │   └── admin/
        │       ├── ProjectsTab.jsx         # Gestión de proyectos con buscador y links útiles
        │       ├── TeamTab.jsx
        │       ├── ServicesTab.jsx
        │       ├── RolesTab.jsx
        │       ├── FeedbackTab.jsx
        │       └── RoleExpectationsTab.jsx # Expectativas de rol por puesto para coaching IA
        ├── hooks/
        │   ├── useRoles.js
        │   └── useInactivity.js      # Detecta inactividad y pausa la tarea activa
        ├── context/
        │   ├── AuthContext.jsx       # user, login, loginWithGoogle, logout, updateUser
        │   └── ThemeContext.jsx
        ├── utils/
        │   ├── format.js             # fmtMins, activeMinutes, completedDuration
        │   └── linkify.jsx           # Convierte URLs en texto a links clickeables
        └── api/client.js
```

---

## Modelos de base de datos

| Modelo | Descripción |
|--------|-------------|
| `User` | Usuarios con rol, avatar, `isAdmin` y 4 preferencias IA |
| `UserRole` | Roles dinámicos creados desde el panel de admin |
| `WorkDay` | Jornada laboral por usuario por día |
| `Task` | Tarea con estado, prioridad (starred) y registro de tiempo |
| `Project` | Proyectos/clientes |
| `ProjectLink` | Links útiles asociados a un proyecto (Drive, Figma, etc.) |
| `Service` | Servicios que ofrece la agencia |
| `ProjectService` | Relación muchos-a-muchos: proyecto ↔ servicio |
| `ProjectMember` | Relación muchos-a-muchos: proyecto ↔ usuario |
| `Notification` | Notificaciones tipadas (COMPLETED / BLOCKED) entre miembros del proyecto |
| `Feedback` | Mensajes de sugerencias y errores del equipo |
| `PasswordResetToken` | Tokens de un solo uso para recuperación de contraseña |
| `DailyInsight` | Coaching IA generado diariamente por usuario (cacheado, con feedback) |
| `UserInsightMemory` | Perfil de productividad acumulado: tendencias, fortalezas y estadísticas históricas |
| `RoleExpectation` | Tareas recurrentes y dependencias configuradas por rol para el coaching IA |

---

## Estados de una tarea

| Estado | Color | Descripción |
|--------|-------|-------------|
| `PENDING` | Gris | Creada, sin iniciar |
| `IN_PROGRESS` | Naranja | Activa en este momento (máximo una por usuario) |
| `PAUSED` | Gris neutro | Pausada temporalmente; acumula tiempo trabajado |
| `BLOCKED` | Rojo | Bloqueada por impedimento externo; requiere razón; notifica al equipo |
| `COMPLETED` | Verde | Finalizada; notifica al equipo |

---

## Tareas destacadas (starred)

Hasta **3 tareas** pueden estar destacadas simultáneamente. Tienen 3 niveles de prioridad indicados por el color de la estrella:

| Nivel | Color | Significado |
|-------|-------|-------------|
| 1 | Amarillo | Prioridad normal |
| 2 | Naranja | Prioridad alta |
| 3 | Rojo | Urgente |

Las tareas destacadas aparecen en la sección **"Destacadas: Foco del día"** del Dashboard, por debajo de las tareas en curso. Si una tarea destacada pasa a `IN_PROGRESS`, se mueve a la sección "En curso".

---

## Sistema de IA

### Insight diario

En el Dashboard aparece una tarjeta de coaching generada por **Claude Haiku** que analiza el estado real del usuario y da recomendaciones basadas en **GTD (Getting Things Done)**. Se genera una vez por día y se cachea hasta el día siguiente. El usuario puede refrescarlo manualmente (cooldown de 1 hora).

La tarjeta puede mostrar hasta 5 capas de información:

| Campo | Descripción |
|-------|-------------|
| **Título + mensaje** | Foco del día con 2-4 oraciones concretas basadas en las tareas reales |
| **Alerta de rol** | Tareas recurrentes esperadas para el puesto que no aparecen registradas |
| **Alerta GTD** | Tareas con descripciones vagas + reformulación sugerida como acción concreta |
| **Sugerencia** | Una acción inmediata y concreta para hacer ahora mismo |
| **Feedback** | 👍 / 👎 para evaluar la calidad del coaching |

El tono varía entre `warning`, `alert`, `positive` y `neutral` según el estado del día.

### Memoria de productividad

Cada **sábado a las 00:00 (Buenos Aires)** el sistema analiza las últimas 4 semanas de cada usuario y actualiza su perfil de productividad en `UserInsightMemory`:

- **Tendencias** — patrones de comportamiento recurrentes
- **Fortalezas** — qué hace bien el usuario consistentemente
- **Áreas de atención** — dónde tiende a bloquearse o bajar el rendimiento
- **Estadísticas** — tasa de completado, tareas/día, proyectos simultáneos

Esta memoria se inyecta en el prompt del insight diario para personalizar el coaching semana a semana. Activable desde **Preferencias**.

### Expectativas de rol (admin)

Los administradores pueden configurar desde **Admin → Roles IA** las tareas recurrentes y dependencias de cada puesto. El insight usa esa información para detectar omisiones: si es primera semana del mes y el diseñador no registró "Informe mensual", la IA lo menciona en `alertaRol`.

Cada rol puede tener:
- **Descripción** del puesto
- **Tareas recurrentes** con frecuencia (`diaria`, `semanal`, `mensual`, `primera semana del mes`) y detalle opcional
- **Dependencias** — a quién entrega o de quién recibe (con descripción)

### Coaching de calidad de tareas

Cuando `taskQualityEnabled` está activo, el insight detecta tareas con descripciones vagas ("Trabajar en web") y sugiere reformularlas como acciones concretas según GTD ("Enviar 3 opciones de homepage para aprobación"). Activable desde **Preferencias**.

### Resumen semanal por email

Cada **viernes a las 14:00 (Buenos Aires)** se envía un email generado por Claude Haiku a todos los usuarios con `weeklyEmailEnabled: true`. Incluye:

1. Resumen de la semana (datos clave)
2. Análisis de patrones y uso del tiempo
3. Insight principal accionable
4. Riesgos o alertas si el comportamiento continúa
5. 3 recomendaciones específicas
6. Enfoque sugerido para la próxima semana

Los usuarios se procesan secuencialmente (3 segundos entre cada uno) para no superar el límite de la API de Claude. Se puede disparar de forma inmediata desde **Preferencias → "Enviar ahora"**.

---

## Preferencias de IA

Cada usuario controla sus features de IA desde **Preferencias**:

| Preferencia | Flag | Descripción |
|-------------|------|-------------|
| Insight diario | `dailyInsightEnabled` | Muestra la tarjeta de coaching en el Dashboard |
| Memoria de aprendizaje | `insightMemoryEnabled` | El sistema acumula el perfil de productividad del usuario |
| Coaching de calidad | `taskQualityEnabled` | El insight detecta y sugiere mejorar tareas con descripciones vagas |
| Resumen semanal | `weeklyEmailEnabled` | Recibe el email de análisis semanal cada viernes |

Los administradores también ven un acceso directo a **Admin → Roles IA** para configurar las expectativas de su puesto.

---

## Navegación por rol

### Usuario común
| Pantalla | Descripción |
|----------|-------------|
| Dashboard | Tareas del día + carry-over + destacadas + insight diario IA |
| Mis Proyectos | Proyectos asignados con pills de conteos de tareas por estado |
| Detalle de proyecto | Tareas activas por persona + servicios + equipo + completadas esta semana + archivo histórico |
| Mis Reportes | Historial de tareas completadas por proyecto con filtro de fechas |
| Perfil | Avatar, datos personales, cambio de contraseña |
| Preferencias | Control de las 4 features de IA + botón de prueba del resumen semanal |

### Administrador (todo lo anterior más)
| Pantalla | Descripción |
|----------|-------------|
| Actividad | Monitor en vivo del equipo con fotos y estado en tiempo real |
| Reportes | Tiempo por proyecto o por persona con detalle de tareas |
| Administración | Proyectos (con links y buscador), equipo, servicios, roles, feedback y **Roles IA** (expectativas por puesto) |

El panel de admin soporta deep linking: `/admin?tab=role-ai` navega directamente a la pestaña de Roles IA.

---

## Fotos de perfil

Hay 10 avatares disponibles en `frontend/public/perfiles/`:

| Archivo | Descripción |
|---------|-------------|
| `bee.png` | Clásica (por defecto) |
| `bee2.png` | Alternativa |
| `beeartist.png` | Artista |
| `beecoffee.png` | Coffee |
| `beecorp.png` | Corp |
| `beefitness.png` | Fitness |
| `beehacker.png` | Hacker |
| `beeloween.png` | Halloween |
| `beepunk.png` | Punk |
| `beezen.png` | Zen |

Las fotos se muestran en: Navbar (dropdown), detalle de proyecto, Actividad y notificaciones.

---

## Notificaciones

Las notificaciones se generan en dos eventos:
- **Tarea completada** → fondo azul en el panel
- **Tarea bloqueada** → fondo rojo, con badge ⚠ sobre la foto del actor

Polling cada 30 segundos. Se marcan como leídas al abrir el panel.

---

## Detección de inactividad

`hooks/useInactivity.js` monitorea mouse y teclado. Si el usuario lleva 60 minutos sin actividad con una tarea `IN_PROGRESS`:
1. Muestra un modal de advertencia + notificación Chrome
2. Si no responde en 10 minutos más, pausa la tarea automáticamente
3. Al recargar la página, el modal se restaura desde `localStorage` (`autoPaused`)

---

## Timezone

Todas las fechas de jornadas se calculan en **America/Argentina/Buenos_Aires (UTC-3)**. Los timestamps de tareas se almacenan en UTC en la base de datos.

---

## Flujo de uso diario

1. El usuario inicia sesión (email/contraseña o Google OAuth)
2. La jornada se crea automáticamente al entrar al Dashboard
3. Si tiene tareas pendientes/pausadas/bloqueadas de días anteriores, aparecen en **"Pendientes de días anteriores"**
4. El insight diario IA analiza el estado real y sugiere en qué enfocarse, usando el perfil de productividad acumulado y las expectativas del rol
5. Agrega tareas con descripción y proyecto; puede asignarla a otro miembro
6. Hace clic en **Iniciar** — solo puede tener **una tarea activa** a la vez
7. Desde una tarea en curso puede pausar, bloquear (requiere razón) o completar
8. Al completar, los demás miembros del proyecto reciben una notificación
9. Al terminar el día, hace clic en **Finalizar jornada** — la sesión se cierra

---

## Feedback

Cualquier usuario puede enviar sugerencias o reportar errores desde el botón flotante en la esquina inferior derecha. Los mensajes llegan al panel de administración → pestaña **Feedback**.
