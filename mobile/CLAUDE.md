@AGENTS.md

# Mobile — BlissTracker

App React Native (Expo) para Android/iOS, pensada para usuarios **no-admin**
del equipo (colaboradores del día a día). No reemplaza al panel admin ni a
módulos de gestión (Marketing, Ventas, EOS, RRHH, Reportes, Contenido) — eso
sigue siendo exclusivamente web. Consume el mismo backend Express de
`../backend`, sin API propia.

## Development commands

```bash
cd mobile
npm start            # abre el bundler de Metro (Expo Dev Tools)
npm run ios          # abre en el simulador de iOS (requiere macOS + Xcode)
npm run android      # abre en el emulador de Android (requiere Android Studio/AVD)
npm run web          # preview en navegador (debug rápido, no es el target real)
```

Requiere `.env` (copiar de `.env.example`) con `EXPO_PUBLIC_API_URL` apuntando
al backend — ver ese archivo para los distintos casos (simulador iOS, emulador
Android, dispositivo físico con Expo Go).

## Decisiones de arquitectura

- **Expo** (no React Native CLI puro): simplifica notificaciones push, cámara,
  secure storage y biometría al venir como módulos ya integrados
  (`expo-notifications`, `expo-secure-store`, `expo-local-authentication`), y
  permite OTA updates para cambios que no sean nativos. Si algún día hace
  falta un módulo nativo muy custom, se puede hacer "prebuild" y salir del
  sandbox de Expo sin reescribir la app.
- **JavaScript, no TypeScript** — mismo criterio que `frontend/`, todo el repo
  es JS.
- **Mismo repo** que backend/frontend (no un repo `blisstracker-mobile`
  separado): un cambio que toca backend + mobile a la vez (ej. un endpoint
  nuevo para push tokens) se hace en un solo PR, y este mismo `CLAUDE.md`
  raíz documenta el contrato de API completo sin tener que duplicarlo.

## Auth y multi-tenancy (sin subdominio)

En web el workspace se resuelve por el subdominio (`slug.blisstracker.app`).
En mobile no hay subdominio, así que se resuelve en el login:

- `POST /api/auth/login` **sin** header `X-Workspace` (nunca se manda en el
  primer login, no hay slug guardado todavía) devuelve
  `{ user, workspaces: [{ id, name, slug, role, token }] }` — cada workspace
  vale con su JWT **ya firmado** (ver `backend/src/controllers/auth.controller.js`
  `buildWorkspaceList`).
- Si el usuario pertenece a **1 solo workspace**, se entra directo con ese
  token (`AuthContext.login` → `enterWorkspace`).
- Si pertenece a **varios**, se muestra `WorkspaceSelectScreen` y se usa el
  token que ya vino en la lista (sin otro request) al elegir uno.
- El token elegido + el slug del workspace se guardan en `expo-secure-store`
  (`src/api/session.js`) y viajan como `Authorization: Bearer <token>` +
  `X-Workspace: <slug>` en cada request (`src/api/client.js`, interceptor
  async — mismo patrón que `frontend/src/api/client.js` pero sin lógica de
  hostname).
- Un 401 en cualquier request limpia la sesión guardada y vuelve a Login
  (`setUnauthorizedHandler` en `client.js`, consumido por `AuthContext`).
- **Sin endpoint nuevo de backend** para esto — todo ya existía para el caso
  "login desde el dominio raíz" de la web.

## Estructura

```
src/
  api/
    session.js      # token + slug en SecureStore
    client.js        # instancia axios (baseURL, headers, manejo de 401)
    tasks.js         # helpers de /api/tasks + /api/workdays/today
    projects.js      # helper de /api/projects (selector del modal de nueva tarea)
    comments.js      # helpers de /api/tasks/:id/comments
    members.js       # GET /workspaces/current/members, filtrado a activos (autocomplete de @menciones)
    devices.js       # POST/DELETE /api/devices/register (push)
    notifications.js # GET /api/notifications, POST /api/notifications/read-all
    chat.js          # helpers REST de /api/chat/channels[...]
  lib/
    push.js          # permisos + Expo Push Token de este dispositivo
    events.js        # pub-sub mínimo propio (RN no tiene `window` ni el módulo `events` de Node)
    socket.js         # conexión Socket.IO única para toda la app (JWT en el handshake)
  context/
    AuthContext.jsx  # login, selección de workspace, logout, sesión persistida, registro/baja de push, conexión del socket
  components/
    TaskCard.jsx           # tarjeta de tarea con botones de acción según status
    AddTaskModal.jsx       # modal para crear tarea (descripción + chips de proyecto)
    TaskCommentsModal.jsx  # comentarios de una tarea + autocomplete de @menciones
  screens/
    LoginScreen.jsx
    WorkspaceSelectScreen.jsx
    DashboardScreen.jsx       # tareas de hoy agrupadas por status, pull-to-refresh
    NotificationsScreen.jsx   # centro de notificaciones in-app
    ChannelListScreen.jsx     # lista de canales de chat, no-leídos/menciones en vivo
    ChatScreen.jsx            # mensajes de un canal + input, tiempo real vía socket
  navigation/
    RootNavigator.jsx     # decide pantalla según loading/pendingWorkspaces/user + listener global de push tocado
```

### Dashboard (Fase 1)

`DashboardScreen` combina `workdays/today`'s `tasks` + `carryOverTasks` en una
sola lista y la agrupa en las mismas secciones que el Dashboard web (En curso
/ Destacadas / Pausadas / Bloqueadas / Pendientes / Completadas hoy) — ver
`buildSections()`. **Deliberadamente no portado de la web en esta fase:**
Backlog, Seguimiento (delegadas/seguidas), Futuras/recurrentes, insight diario
IA, historial paginado de completadas de días anteriores. Se evalúa agregarlos
más adelante si hace falta.

Crear tarea (`AddTaskModal`) no estaba en el alcance explícito acordado para
la v1, pero se agregó igual: sin poder crear tareas desde la app, el Dashboard
mobile sería de solo lectura sobre lo cargado en la web, lo que le quita gran
parte del sentido a esta fase. Queda simple a propósito — sin asignar a otro
usuario, sin tareas futuras/recurrentes (eso sigue siendo cosa de la web).

Cada acción de `TaskCard` (iniciar/pausar/reanudar/completar/bloquear/
desbloquear/destacar) pega directo al endpoint (`src/api/tasks.js`) y actualiza
la tarea en el estado local con la respuesta — mismo patrón que
`handleUpdateTask` en `frontend/src/pages/Dashboard.jsx`, sin heredar su
manejo de Backlog/Seguimiento.

### Comentarios y @menciones (Fase 2)

`TaskCommentsModal` (abierto desde el botón "💬 N"/"💬 Comentar" de cada
`TaskCard`) lista `GET /tasks/:id/comments` y postea con `POST
/tasks/:id/comments` — mismos endpoints y misma resolución de menciones
(`resolveMentions`, contra miembros activos del workspace, no solo del
equipo del proyecto) que la web.

**Autocomplete de menciones simplificado a propósito** frente al de la web:
`getMentionQuery()` sólo mira el `@parcial` al final del string completo (vía
regex), no la posición real del cursor — insertar una mención en medio de un
texto ya escrito no funciona bien en esta fase. La razón es que el
`TextInput` de React Native no expone la posición del cursor con la misma
comodidad que un `<textarea>` de web (`selectionStart`); resolverlo bien
requiere trackear `onSelectionChange` a mano. Se deja así para la v1 — cubre
el caso normal de "escribir y mencionar al final" — y se revisita si en el
uso real hace falta mencionar en medio del texto.

No se portaron a mobile en esta fase: reacciones con emoji sobre comentarios
(`TaskCommentReaction`, el endpoint ya existe pero no se consume todavía) ni
edición de la descripción de la tarea desde el modal — ambas son parte de
`TaskCommentsModal.jsx` en la web pero quedan fuera del alcance "básico"
acordado para la v1.

### Push notifications (Fase 3)

**Servicio de Expo Push, no Firebase/APNs directo** — un solo tipo de token
(`ExponentPushToken[...]`) cubre Android e iOS sin credenciales propias ni
"prebuild" para salir del managed workflow de Expo; es justo el problema que
Expo existe para simplificar. El primer intento de esta fase usó
`firebase-admin` en el backend, pero para iOS `expo-notifications` en modo
managed devuelve el token APNs crudo, no un token FCM — hubiera hecho falta
`@react-native-firebase/messaging` (SDK nativo, requiere prebuild) para que
ese token fuera utilizable por Firebase. Se revirtió a Expo Push antes de
tocar el lado mobile.

- **`src/lib/push.js`** `registerForPushNotificationsAsync()`: pide permiso,
  configura el canal de notificaciones en Android, y devuelve el Expo Push
  Token de este dispositivo — o `null` en cualquier caso no soportado (nunca
  lanza, el resto de la app funciona igual sin push): no es un dispositivo
  físico (`expo-device` `Device.isDevice`), el permiso fue denegado, o falta
  el **`projectId` de EAS** (ver "Paso pendiente" abajo).
- **`AuthContext`** llama `syncPushToken()` tanto al restaurar una sesión
  guardada (reabrir la app) como después de un login/selección de workspace
  exitosos — en ambos casos fire-and-forget, nunca bloquea el flujo de auth.
  El token se guarda en un `ref` (no en `SecureStore`: no hace falta
  persistirlo entre arranques, `registerForPushNotificationsAsync()` ya cachea
  el permiso a nivel del OS) para poder mandar `DELETE /devices/register` en
  `logout()`.
- **Backend**: `DeviceToken` (`token` único, `userId`+`workspaceId`) +
  `POST`/`DELETE /api/devices/register` + `pushNotification.service.js`
  (`expo-server-sdk`, cargado con `import()` dinámico por ser ESM-only) — ver
  el concepto "Push notifications (mobile)" en el `CLAUDE.md` raíz para el
  lado del servidor completo, incluyendo **qué tipos de notificación disparan
  push hoy** (solo los de Dashboard/Comentarios — Chat/Ventas/EOS/etc. quedan
  para cuando esas funciones lleguen a la app).
- **Recepción y tap** (`RootNavigator`): `Notifications.setNotificationHandler`
  (en `push.js`) hace que la notificación se muestre igual con la app abierta;
  `Notifications.addNotificationResponseReceivedListener` (en
  `RootNavigator.jsx`, con `useNavigationContainerRef` para poder navegar
  desde fuera de un componente de pantalla) maneja el tap — navega a
  `Notifications` y, si el payload trae `taskId`, emite
  `EVENTS.OPEN_TASK_COMMENTS` (`src/lib/events.js`) para que `DashboardScreen`
  abra el modal de comentarios de esa tarea (recargando primero si la tarea
  todavía no está en el estado local — puede pasar si la push llegó con la
  app cerrada, antes del primer fetch).
- **`NotificationsScreen`**: lista `GET /api/notifications` (mismo endpoint que
  el bell panel de la web, sin los filtros por tipo ni el modelo de "leído por
  tipo" — acá es simple: "marcar todas leídas" nomás) y reusa el mismo evento
  `OPEN_TASK_COMMENTS` al tocar una fila con `taskId`.

**Paso pendiente, requiere una cuenta personal de Expo — no lo puede hacer un
agente:** `getExpoPushTokenAsync()` necesita un `projectId` de EAS, que solo
se obtiene corriendo `npx eas init` dentro de `mobile/` (pide login a
expo.dev, gratis, y vincula/crea el proyecto — el id queda seteado en
`app.json` bajo `extra.eas.projectId`, ver `app.json`). Sin ese paso, el resto
de la app funciona igual (`registerForPushNotificationsAsync()` devuelve
`null` en silencio, se loguea un warning) pero no se registra ningún
dispositivo ni llega ningún push.

### Chat interno (Fase 4)

Mismo backend que el widget web (`ChatChannel`/`ChatMessage`, REST +
Socket.IO) — ver concepto "Chat interno" en el `CLAUDE.md` raíz para el
modelo completo. `src/lib/socket.js` abre **una sola conexión para toda la
app** (JWT en `auth.token` del handshake, mismo protocolo que
`backend/src/lib/socket.js`), conectada tras login/restauración de sesión y
cerrada en `logout()` — igual ciclo de vida que el registro de push, en el
mismo `AuthContext`.

- **`ChannelListScreen`** — `GET /chat/channels` (ya viene con no-leídos,
  menciones y favoritos resueltos por el backend). Escucha `chat:unread`/
  `chat:read` mientras está en foco y simplemente **recarga la lista
  completa** al recibir cualquiera de los dos — son pocos canales, no vale la
  pena parchear el canal puntual.
- **`ChatScreen`** — al montar hace `socket.emit('join-channel', channelId)`
  (y `leave-channel` al desmontar, mismo protocolo que el widget web) y
  escucha `chat:message` filtrando por `channelId`. **Sin update optimista**:
  enviar un mensaje no lo agrega al estado local — el propio socket lo trae de
  vuelta (`io.to(room)` incluye al emisor), mismo criterio que
  `ChatWidget.jsx` en la web. Marca el canal como leído al entrar y al recibir
  un mensaje ajeno mientras está abierto.
- **Autocomplete de @menciones**: mismo patrón simplificado (mención solo al
  final del texto) que `TaskCommentsModal` de la Fase 2 — ver esa sección más
  arriba para el porqué. `@everyone` **no tiene entrada especial en el
  autocomplete** (a diferencia de la web, que la antepone sintéticamente a la
  lista de miembros) pero funciona igual si se tipea a mano: la resolución de
  "@everyone" es enteramente del lado del backend.
- **Push** (`chat.controller.js` `sendMessage`, ver concepto "Push
  notifications (mobile)" en el `CLAUDE.md` raíz): tocar la notificación
  navega directo al canal (`RootNavigator`, rama `data.channelId`) en vez de
  al centro de notificaciones — el título del header cae al fallback "Chat"
  en ese camino porque el nombre del canal no viaja en el payload de la
  notificación (llegar por la lista in-app sí lo tiene, vía `route.params`).

**Deliberadamente no portado a mobile en esta fase** (todo existe en el
backend, ninguno se consume desde la app): reacciones con emoji, mensajes
fijados (pin), GIFs, responder/citar un mensaje (reply), crear/editar/eliminar
canales custom (es admin-only en el backend — fuera del alcance de un
colaborador no-admin de todos modos), editar/eliminar mensajes propios,
canales privados (el filtrado del backend ya los excluye del listado para
no-admins, así que tampoco hay nada que mostrar). Se evalúan agregar si el
uso real de la app lo pide.

## Roadmap (alcance v1)

Incluye: tareas de hoy (ver/iniciar/pausar/completar/bloquear/destacar),
comentarios y @menciones en tareas, chat interno, notificaciones push, login
biométrico. Google Sign-In queda para v2.

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Setup Expo, navegación, auth (login + selector de workspace + secure storage) | ✅ |
| 1 | Dashboard: tareas de hoy (listar/iniciar/pausar/completar/bloquear/destacar, carry-over, crear tarea) | ✅ |
| 2 | Comentarios y @menciones en tareas | ✅ |
| 3 | Push (backend: `DeviceToken` + servicio de Expo Push; frontend: permisos, registro de token, deep-link, centro de notificaciones) | ✅ (código completo — falta `eas init`, ver arriba) |
| 4 | Chat interno (canales, mensajes, Socket.IO) | ✅ |
| 5 | Biometría (`expo-local-authentication`) + pulido (manejo de errores de red, ícono/splash, build de prueba) | pendiente |

No hay modo offline en la v1 (se evalúa si se vuelve un problema real de uso
en campo con mala señal).
