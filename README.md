# BlissTracker

Aplicación web para gestión de tareas diarias del equipo de Bliss Marketing.

## Stack

- **Backend:** Node.js + Express + Prisma + PostgreSQL
- **Frontend:** React 18 + Vite + Tailwind CSS + React Router v6
- **Auth:** JWT (12h), almacenado en localStorage + Google OAuth 2
- **Email:** Resend (API HTTP — no SMTP)
- **IA:** Anthropic Claude Haiku (resumen semanal de productividad)
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
│       ├── index.js             # Punto de entrada: listen + cron semanal
│       ├── controllers/
│       │   ├── auth.controller.js          # Login, Google OAuth, forgot/reset password
│       │   ├── workdays.controller.js      # Jornada diaria + carry-over
│       │   ├── tasks.controller.js         # CRUD tareas + block/unblock/star
│       │   ├── projects.controller.js      # Proyectos + tareas + historial paginado
│       │   ├── profile.controller.js       # Perfil personal + avatar + preferencias
│       │   ├── reports.controller.js       # Reportes por proyecto/usuario
│       │   ├── realtime.controller.js      # Snapshot del equipo en tiempo real
│       │   ├── notifications.controller.js
│       │   ├── roles.controller.js
│       │   ├── feedback.controller.js
│       │   └── users.controller.js
│       ├── middleware/
│       │   └── auth.js           # JWT + adminOnly
│       ├── services/
│       │   ├── email.service.js        # Resend: reset, bienvenida, resumen semanal
│       │   └── weeklyReport.service.js # Generación de resumen con Claude + cron
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
        │   ├── Dashboard.jsx         # Vista diaria con carry-over, destacadas e insight diario
        │   ├── MyProjects.jsx        # Proyectos con pills de conteos de tareas
        │   ├── ProjectDetail.jsx     # Tareas activas + completadas semana + archivo histórico
        │   ├── MyReports.jsx         # Reportes personales
        │   ├── RealTime.jsx          # Actividad del equipo en tiempo real
        │   ├── Reports.jsx           # Reportes completos (admin)
        │   ├── Admin.jsx             # Panel de administración
        │   ├── MyProfile.jsx         # Perfil personal, avatar y datos personales
        │   └── Preferences.jsx       # Insight diario + resumen semanal IA
        ├── components/
        │   ├── Navbar.jsx            # Logo + nombre + dropdown de usuario
        │   ├── TaskCard.jsx          # Tarjeta de tarea con todas las acciones + link al proyecto
        │   ├── AddTaskModal.jsx      # Modal con combobox de proyecto + asignación
        │   ├── NotificationBell.jsx  # Campana con panel (completadas en azul, bloqueadas en rojo)
        │   ├── FeedbackButton.jsx
        │   ├── InactivityModal.jsx
        │   ├── UserTasksModal.jsx
        │   └── admin/
        │       ├── ProjectsTab.jsx   # Gestión de proyectos con buscador y links útiles
        │       ├── TeamTab.jsx
        │       ├── ServicesTab.jsx
        │       ├── RolesTab.jsx
        │       └── FeedbackTab.jsx
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
| `User` | Usuarios con rol, avatar y preferencias (`weeklyEmailEnabled`, `dailyInsightEnabled`) |
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

## Navegación por rol

### Usuario común
| Pantalla | Descripción |
|----------|-------------|
| Dashboard | Tareas del día + carry-over + destacadas + insight diario |
| Mis Proyectos | Proyectos asignados con pills de conteos de tareas por estado |
| Detalle de proyecto | Tareas activas por persona + servicios + equipo + completadas esta semana + archivo histórico |
| Mis Reportes | Historial de tareas completadas por proyecto con filtro de fechas |
| Perfil | Avatar, datos personales, cambio de contraseña |
| Preferencias | Toggle insight diario + toggle resumen semanal por IA + botón de prueba |

### Administrador (todo lo anterior más)
| Pantalla | Descripción |
|----------|-------------|
| Actividad | Monitor en vivo del equipo con fotos y estado en tiempo real |
| Reportes | Tiempo por proyecto o por persona con detalle de tareas |
| Administración | Gestión de proyectos (con links útiles y buscador), equipo, servicios, roles y feedback |

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

## Insight diario

En el Dashboard aparece un banner de una línea que analiza el estado actual del usuario y da una recomendación. La lógica es puramente frontend (sin llamadas API adicionales) y se evalúa en cada render:

| Condición | Tono | Ejemplo |
|-----------|------|---------|
| Hay tareas bloqueadas | ⚠️ Rojo | "Tenés 2 tareas bloqueadas — resolvé ese impedimento antes de seguir." |
| Muchas pendientes, pocas completadas | 🎯 Ámbar | "Tenés 6 tareas sin iniciar. Elegí una y avanzá." |
| Distribuido en 4+ proyectos | ⚡ Ámbar | "Estás distribuido en 4 proyectos distintos hoy." |
| Buen progreso (≥3 completadas) | ✅ Verde | "Buen ritmo hoy — ya completaste 4 tareas." |
| Tarea en curso | 🔥 Verde | "Estás enfocado en 'Proyecto X'. Terminala antes de arrancar algo nuevo." |
| Proyecto dominante en pendientes | 📌 Gris | "La mayoría de tus tareas pendientes son de 'Proyecto X'." |
| Sin tareas | 💡 Gris | "Definí tus tareas para empezar el día con foco." |

Activable/desactivable desde **Preferencias → Dashboard**. Se oculta automáticamente cuando la jornada está finalizada.

---

## Resumen semanal con IA

Cada **viernes a las 14:00 (Buenos Aires)** se envía automáticamente un email generado por Claude Haiku a todos los usuarios con `weeklyEmailEnabled: true`.

El email incluye:
1. **Resumen de la semana** — datos clave en 2-3 oraciones
2. **Qué pasó realmente** — análisis de patrones y uso del tiempo
3. **Insight principal** — una conclusión concreta y accionable
4. **Riesgos o alertas** — posibles problemas si el comportamiento continúa
5. **Recomendaciones accionables** — 3 sugerencias específicas
6. **Enfoque para la próxima semana** — qué priorizar

Compara con la semana anterior cuando hay datos disponibles. Los usuarios se procesan de forma secuencial (un usuario cada 3 segundos) para no superar el límite de la API de Claude. Los usuarios pueden activar/desactivar el envío desde **Preferencias**, y probar el envío inmediato con el botón "Enviar ahora".

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
4. El insight diario sugiere en qué enfocarse según el estado actual
5. Agrega tareas con descripción y proyecto; puede asignarla a otro miembro
6. Hace clic en **Iniciar** — solo puede tener **una tarea activa** a la vez
7. Desde una tarea en curso puede pausar, bloquear (requiere razón) o completar
8. Al completar, los demás miembros del proyecto reciben una notificación
9. Al terminar el día, hace clic en **Finalizar jornada** — la sesión se cierra

---

## Feedback

Cualquier usuario puede enviar sugerencias o reportar errores desde el botón flotante en la esquina inferior derecha. Los mensajes llegan al panel de administración → pestaña **Feedback**.
