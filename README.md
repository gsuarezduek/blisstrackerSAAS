# Bliss Team Tracker

Aplicación web para gestión de tareas diarias del equipo de Bliss Marketing.

## Stack

- **Backend:** Node.js + Express + Prisma + PostgreSQL
- **Frontend:** React + Vite + Tailwind CSS
- **Auth:** JWT (12h), almacenado en localStorage

---

## Desarrollo local

### Requisitos
- Node.js 18+
- PostgreSQL 14+

### 1. Backend

```bash
cd backend
cp .env.example .env
# Editar .env con tu DATABASE_URL y JWT_SECRET
npm install
npm run db:migrate:dev     # crea las tablas
npm run db:seed            # crea admin, roles por defecto y proyecto Bliss
npm run dev
```

La API corre en `http://localhost:3001`

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

---

## Deploy en producción (team.blissmkt.ar)

### Backend

```bash
cd backend
cp .env.example .env
# Configurar DATABASE_URL apuntando a tu PostgreSQL de producción
# Configurar JWT_SECRET con un string largo y aleatorio
npm install --production
npm run db:generate
npm run db:migrate       # aplica migraciones
npm run db:seed          # solo la primera vez
```

Usar **PM2** para mantenerlo corriendo:

```bash
npm install -g pm2
pm2 start src/index.js --name team-tracker-api
pm2 save
pm2 startup
```

### Frontend (build estático)

```bash
cd frontend
npm run build
# Subir la carpeta dist/ al hosting
```

### Nginx (subdominio team.blissmkt.ar)

```nginx
server {
    listen 80;
    server_name team.blissmkt.ar;

    root /var/www/team-tracker/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Luego: `certbot --nginx -d team.blissmkt.ar` para HTTPS.

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
│       │   ├── auth.controller.js
│       │   ├── workdays.controller.js
│       │   ├── tasks.controller.js
│       │   ├── projects.controller.js
│       │   ├── services.controller.js
│       │   ├── reports.controller.js
│       │   ├── realtime.controller.js
│       │   ├── roles.controller.js
│       │   ├── feedback.controller.js
│       │   └── notifications.controller.js
│       ├── middleware/
│       │   └── auth.js           # JWT + adminOnly
│       ├── routes/
│       └── index.js
└── frontend/
    └── src/
        ├── pages/
        │   ├── Login.jsx
        │   ├── Dashboard.jsx     # Vista diaria de tareas
        │   ├── MyProjects.jsx    # Proyectos del usuario
        │   ├── MyReports.jsx     # Reportes personales (no admin)
        │   ├── RealTime.jsx      # Monitor en vivo (admin)
        │   ├── Reports.jsx       # Reportes completos (admin)
        │   └── Admin.jsx         # Panel de administración
        ├── components/
        │   ├── Navbar.jsx
        │   ├── TaskCard.jsx
        │   ├── AddTaskModal.jsx
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
        │   └── useRoles.js       # Hook compartido para roles dinámicos
        ├── context/AuthContext.jsx
        └── api/client.js         # Axios con JWT automático
```

---

## Modelos de base de datos

| Modelo | Descripción |
|--------|-------------|
| `User` | Usuarios del sistema con rol asignado (String, referencia a UserRole) |
| `UserRole` | Roles dinámicos creados desde el panel de admin |
| `WorkDay` | Jornada laboral por usuario por día |
| `Task` | Tarea asociada a una jornada y proyecto |
| `Project` | Proyectos/clientes |
| `Service` | Servicios que ofrece la agencia |
| `ProjectService` | Relación muchos-a-muchos: proyecto ↔ servicio |
| `ProjectMember` | Relación muchos-a-muchos: proyecto ↔ usuario |
| `Notification` | Notificaciones entre miembros de un mismo proyecto |
| `Feedback` | Mensajes de sugerencias y errores del equipo |

---

## Roles

Los roles son **dinámicos**: se crean y eliminan desde el panel de administración → pestaña **Roles**. No hay un enum fijo en la base de datos.

Los roles por defecto creados con el seed son:

| Nombre interno | Etiqueta |
|----------------|----------|
| `ADMIN` | Administrador |
| `DESIGNER` | Diseñador |
| `CM` | Community Manager |
| `ACCOUNT_EXECUTIVE` | Ejecutivo de Cuentas |
| `ANALYST` | Analista |
| `WEB_DEVELOPER` | Desarrollador Web |

El rol `ADMIN` es especial: habilita el acceso al panel de administración y a las vistas exclusivas de admin. No puede eliminarse si hay usuarios con ese rol asignado.

---

## Navegación por rol

### Usuario común
| Pantalla | Descripción |
|----------|-------------|
| Dashboard | Tareas del día, iniciar/pausar/completar, finalizar jornada |
| Mis Proyectos | Proyectos a los que está asignado, con servicios y equipo |
| Mis Reportes | Historial de tareas completadas por proyecto, con filtro de fechas |

### Administrador
| Pantalla | Descripción |
|----------|-------------|
| Dashboard | Igual que usuario común |
| Mis Proyectos | Todos los proyectos activos |
| Tiempo Real | Monitor en vivo: quién está activo y en qué tarea trabaja |
| Reportes | Tiempo por proyecto o por persona, con detalle de tareas |
| Administración | Gestión de proyectos, equipo, servicios, roles y feedback |

---

## Panel de administración

| Pestaña | Funcionalidad |
|---------|---------------|
| **Proyectos** | Crear/editar proyectos, asignar servicios, gestionar equipo por proyecto, archivar/reactivar |
| **Equipo** | Agregar/editar miembros, asignar roles, activar/desactivar usuarios |
| **Servicios** | Crear/editar servicios disponibles para asociar a proyectos |
| **Roles** | Crear nuevos roles o eliminar los existentes (no se puede eliminar un rol en uso) |
| **Feedback** | Ver sugerencias y reportes de error del equipo, filtrar por tipo y estado de lectura |

---

## Flujo de uso diario

1. El usuario inicia sesión con email y contraseña
2. La jornada se crea automáticamente al entrar al Dashboard
3. Agrega tareas asociadas a un proyecto (solo ve sus proyectos asignados)
4. Hace clic en **Iniciar** para arrancar una tarea — se registra la hora de inicio
5. Solo puede tener **una tarea activa** a la vez
6. Puede **Pausar** una tarea para retomada después, o **Completar** para cerrarla
7. Al reanudar una tarea pausada, el tiempo de pausa se descuenta del total
8. Al completar una tarea, los demás miembros del proyecto reciben una **notificación**
9. Al terminar el día, hace clic en **Finalizar jornada** — la sesión se cierra automáticamente
10. Si vuelve a iniciar sesión el mismo día, la jornada se reabre

---

## Notificaciones

Cuando un usuario completa una tarea, todos los demás miembros del mismo proyecto reciben una notificación en tiempo real (polling cada 30 segundos). El ícono de campana en la barra de navegación muestra un badge con la cantidad de notificaciones no leídas. Al abrir el panel, todas se marcan como leídas automáticamente.

---

## Timezone

Todas las fechas de jornadas se calculan en **America/Argentina/Buenos_Aires (UTC-3)**. Los timestamps de tareas (startedAt, completedAt, pausedAt) se almacenan en UTC en la base de datos.

---

## Feedback

Cualquier usuario puede enviar sugerencias o reportar errores desde el botón flotante en la esquina inferior derecha. Los mensajes llegan al panel de administración → pestaña **Feedback**, donde el admin puede filtrarlos, leerlos y marcarlos como revisados.
