# Bliss Team Tracker

Aplicación web para gestión de tareas diarias del equipo de Bliss Marketing.

## Stack

- **Backend:** Node.js + Express + Prisma + PostgreSQL
- **Frontend:** React + Vite + Tailwind CSS
- **Auth:** JWT (12h), almacenado en localStorage
- **Email:** Resend (API HTTP — no SMTP)
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

# frontend/.env.production
VITE_API_URL=https://tu-backend.up.railway.app
```

---

## Deploy en producción

### Backend (Railway)

1. Crear un nuevo proyecto en Railway con servicio PostgreSQL
2. Agregar las variables de entorno en el panel de Railway:
   - `DATABASE_URL` (provista por Railway automáticamente)
   - `JWT_SECRET`
   - `RESEND_API_KEY`
   - `FRONTEND_URL` (ej: `https://team.blissmkt.ar`)
3. Railway corre `npm run db:migrate` automáticamente al deployar (configurar en el start command o Procfile)
4. Ejecutar el seed manualmente una sola vez desde Railway Shell: `node prisma/seed.js`

### Frontend (Vercel)

1. Importar el repositorio en Vercel apuntando a la carpeta `/frontend`
2. Agregar variable de entorno: `VITE_API_URL=https://tu-backend.up.railway.app`
3. El archivo `vercel.json` ya incluye las reglas de rewrite para React Router SPA:
   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
   ```

---

## Estructura del proyecto

```
team-tracker/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # Modelos de base de datos
│   │   ├── migrations/          # Historial de migraciones
│   │   └── seed.js              # Admin inicial, roles por defecto y proyecto Bliss
│   └── src/
│       ├── controllers/
│       │   ├── auth.controller.js          # Login, forgot/reset password
│       │   ├── workdays.controller.js      # Jornada diaria + carry-over
│       │   ├── tasks.controller.js         # CRUD tareas + block/unblock
│       │   ├── projects.controller.js      # Proyectos + tareas por proyecto
│       │   ├── services.controller.js
│       │   ├── reports.controller.js
│       │   ├── realtime.controller.js
│       │   ├── roles.controller.js
│       │   ├── feedback.controller.js
│       │   └── notifications.controller.js
│       ├── middleware/
│       │   └── auth.js           # JWT + adminOnly
│       ├── services/
│       │   └── email.service.js  # Resend: reset password + bienvenida
│       ├── routes/
│       └── index.js
└── frontend/
    └── src/
        ├── pages/
        │   ├── Login.jsx             # Login + link a recuperar contraseña
        │   ├── ForgotPassword.jsx    # Solicitar link de reset
        │   ├── ResetPassword.jsx     # Formulario de nueva contraseña
        │   ├── Dashboard.jsx         # Vista diaria con carry-over
        │   ├── MyProjects.jsx        # Proyectos del usuario
        │   ├── ProjectDetail.jsx     # Tareas pendientes del proyecto por usuario
        │   ├── MyReports.jsx         # Reportes personales
        │   ├── RealTime.jsx          # Monitor en vivo (admin)
        │   ├── Reports.jsx           # Reportes completos (admin)
        │   └── Admin.jsx             # Panel de administración
        ├── components/
        │   ├── Navbar.jsx            # Responsive: hamburger en mobile
        │   ├── TaskCard.jsx          # Tarjeta de tarea con todas las acciones
        │   ├── AddTaskModal.jsx      # Modal con combobox de proyecto + asignación
        │   ├── FeedbackButton.jsx
        │   ├── NotificationBell.jsx
        │   ├── DateRangeFilter.jsx
        │   └── admin/
        │       ├── ProjectsTab.jsx
        │       ├── TeamTab.jsx
        │       ├── ServicesTab.jsx
        │       ├── RolesTab.jsx
        │       └── FeedbackTab.jsx
        ├── hooks/
        │   └── useRoles.js
        ├── context/
        │   ├── AuthContext.jsx
        │   └── ThemeContext.jsx
        └── api/client.js
```

---

## Modelos de base de datos

| Modelo | Descripción |
|--------|-------------|
| `User` | Usuarios del sistema con rol asignado |
| `UserRole` | Roles dinámicos creados desde el panel de admin |
| `WorkDay` | Jornada laboral por usuario por día |
| `Task` | Tarea asociada a una jornada, proyecto y usuario |
| `Project` | Proyectos/clientes |
| `Service` | Servicios que ofrece la agencia |
| `ProjectService` | Relación muchos-a-muchos: proyecto ↔ servicio |
| `ProjectMember` | Relación muchos-a-muchos: proyecto ↔ usuario |
| `Notification` | Notificaciones entre miembros de un mismo proyecto |
| `Feedback` | Mensajes de sugerencias y errores del equipo |
| `PasswordResetToken` | Tokens de un solo uso para recuperación de contraseña |

---

## Estados de una tarea

| Estado | Descripción |
|--------|-------------|
| `PENDING` | Creada, sin iniciar |
| `IN_PROGRESS` | Activa en este momento (máximo una por usuario) |
| `PAUSED` | Pausada temporalmente; acumula tiempo trabajado |
| `BLOCKED` | Bloqueada por un impedimento externo; requiere razón |
| `COMPLETED` | Finalizada |

---

## Roles

Los roles son **dinámicos**: se crean y eliminan desde el panel de administración → pestaña **Roles**.

Los roles por defecto creados con el seed son:

| Nombre interno | Etiqueta |
|----------------|----------|
| `ADMIN` | Administrador |
| `DESIGNER` | Diseñador |
| `CM` | Community Manager |
| `ACCOUNT_EXECUTIVE` | Ejecutivo de Cuentas |
| `ANALYST` | Analista |
| `WEB_DEVELOPER` | Desarrollador Web |

El rol `ADMIN` habilita el acceso al panel de administración y vistas exclusivas. No puede eliminarse si hay usuarios con ese rol.

---

## Navegación por rol

### Usuario común
| Pantalla | Descripción |
|----------|-------------|
| Dashboard | Tareas del día + carry-over de días anteriores |
| Mis Proyectos | Proyectos asignados, con equipo y servicios; click para ver tareas del proyecto |
| Mis Reportes | Historial de tareas completadas por proyecto, con filtro de fechas |

### Administrador
| Pantalla | Descripción |
|----------|-------------|
| Dashboard | Igual que usuario común |
| Mis Proyectos | Todos los proyectos activos |
| Tiempo Real | Monitor en vivo: quién está activo, en qué tarea, tareas completadas/pendientes/bloqueadas |
| Reportes | Tiempo por proyecto o por persona, con detalle de tareas |
| Administración | Gestión de proyectos, equipo, servicios, roles y feedback |

---

## Flujo de uso diario

1. El usuario inicia sesión con email y contraseña
2. La jornada se crea automáticamente al entrar al Dashboard
3. Si tiene tareas pendientes/pausadas/bloqueadas de días anteriores, aparecen en la sección **"Pendientes de días anteriores"**
4. Agrega tareas con descripción y proyecto (combobox con búsqueda); puede asignarla a otro miembro del mismo proyecto
5. Hace clic en **Iniciar** para arrancar una tarea — se registra la hora de inicio
6. Solo puede tener **una tarea activa** a la vez
7. Desde una tarea en curso puede:
   - **Pausar** → acumula tiempo trabajado, se puede retomar después
   - **Bloquear** → requiere ingresar la razón del bloqueo; queda visible para el equipo
   - **Completar** → cierra la tarea y notifica al resto del proyecto
8. Una tarea bloqueada puede retomarse con **Continuar**, volviendo a estado pendiente
9. Al completar una tarea, los demás miembros del proyecto reciben una **notificación**
10. Al terminar el día, hace clic en **Finalizar jornada** — la sesión se cierra automáticamente
11. Si vuelve a iniciar sesión el mismo día, la jornada se reabre

---

## Recuperación de contraseña

1. En la pantalla de login, el usuario hace clic en **"¿Olvidaste tu contraseña?"**
2. Ingresa su email — el sistema envía un link de reset válido por 1 hora
3. El link lleva a `/reset-password?token=...` donde ingresa su nueva contraseña
4. Al completar el reset, es redirigido al login con confirmación

El email se envía vía **Resend** (API HTTP). Railway bloquea los puertos SMTP salientes, por lo que no se usa nodemailer.

---

## Asignación de tareas

Al crear una tarea, si el proyecto tiene más de un miembro, aparece el selector **"Asignar a"** con todos los integrantes del equipo. El usuario propio está marcado como *(yo)* y es la opción por defecto. Las tareas asignadas por otra persona muestran **"Asignada por [nombre]"** en el card.

---

## Vista de proyecto

Desde **Mis Proyectos**, al hacer click en un proyecto se accede a la vista de tareas pendientes, agrupadas por usuario. Las tareas bloqueadas aparecen primero, con la razón del bloqueo visible. Accesible para todos los miembros del proyecto.

---

## Panel de administración

| Pestaña | Funcionalidad |
|---------|---------------|
| **Proyectos** | Crear/editar proyectos, asignar servicios, gestionar equipo, archivar/reactivar |
| **Equipo** | Agregar/editar miembros, asignar roles, activar/desactivar; envía email de bienvenida al crear un usuario |
| **Servicios** | Crear/editar servicios disponibles para asociar a proyectos |
| **Roles** | Crear nuevos roles o eliminar los existentes (no se puede eliminar un rol en uso) |
| **Feedback** | Ver sugerencias y reportes de error del equipo, filtrar por tipo y estado de lectura |

---

## Notificaciones

Cuando un usuario completa una tarea, todos los demás miembros del mismo proyecto reciben una notificación (polling cada 30 segundos). El ícono de campana en la barra muestra un badge con el conteo de no leídas. Al abrir el panel, se marcan como leídas automáticamente.

---

## Tiempo Real (admin)

La pantalla de Tiempo Real muestra una grilla de todos los usuarios activos hoy con:
- Tarea en curso (si la hay), con tiempo transcurrido en vivo
- Indicador de estado: trabajando / disponible / jornada finalizada
- Estadísticas del día: completadas, pendientes, bloqueadas (solo si > 0), tiempo registrado

Se refresca automáticamente cada 30 segundos, con countdown visible y botón de actualización manual.

---

## Timezone

Todas las fechas de jornadas se calculan en **America/Argentina/Buenos_Aires (UTC-3)**. Los timestamps de tareas se almacenan en UTC en la base de datos.

---

## Feedback

Cualquier usuario puede enviar sugerencias o reportar errores desde el botón flotante en la esquina inferior derecha. Los mensajes llegan al panel de administración → pestaña **Feedback**.
