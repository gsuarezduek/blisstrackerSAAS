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
    biometrics.js     # disponibilidad + prompt de Face ID/huella
  context/
    AuthContext.jsx  # login, selección de workspace, logout, sesión persistida, registro/baja de push, conexión del socket, gate biométrico
  components/
    TaskCard.jsx           # tarjeta de tarea con botones de acción según status
    AddTaskModal.jsx       # modal para crear tarea (descripción + chips de proyecto)
    TaskCommentsModal.jsx  # comentarios de una tarea + autocomplete de @menciones
  screens/
    LoginScreen.jsx
    WorkspaceSelectScreen.jsx
    LockScreen.jsx            # gate biométrico al restaurar una sesión guardada
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

### Biometría + pulido + build (Fase 5)

**Login biométrico** (`expo-local-authentication`):
- `src/lib/biometrics.js` — `isBiometricAvailable()` (hardware + al menos una
  huella/cara ya enrolada en el OS, no solo hardware presente) y
  `authenticateAsync()` (con `disableDeviceFallback: false`, así el PIN/patrón
  del OS sirve de respaldo si la biometría falla).
- **La preferencia (`bliss_biometric_enabled` en SecureStore) vive separada de
  la sesión** (`src/api/session.js`) — `clearSession()` (logout) no la toca a
  propósito: es una preferencia del dispositivo, no de la cuenta. Si alguien
  cierra sesión y vuelve a entrar en el mismo teléfono, tiene sentido que
  siga pidiendo Face ID.
- **Gate solo al restaurar una sesión guardada**, nunca en un login fresco con
  contraseña (`AuthContext`, estado `locked`): si `biometricEnabled` es true,
  la restauración de sesión no llama a `finishEnter()` directo — pone
  `locked=true` y `RootNavigator` muestra `LockScreen` en vez de `Dashboard`.
  `LockScreen` dispara el prompt biométrico apenas se monta (no hace falta
  tocar un botón primero) y ofrece reintentar.
- **Se ofrece activar** (`maybePromptBiometric`, `Alert.alert` nativo) justo
  después de un login/selección de workspace fresco, solo si el dispositivo
  la soporta y todavía no se preguntó una vez (`bliss_biometric_prompted`).
- **Salida si la biometría deja de andar** (dedo/cara distinta, hardware
  roto): `forgetBiometricAndLogout()` — apaga la preferencia y cierra sesión,
  así el próximo login pide contraseña de nuevo en vez de dejar a alguien
  trabado en `LockScreen` para siempre. Botón "No puedo desbloquear — entrar
  con contraseña" en la propia pantalla de bloqueo.
- **iOS**: plugin `expo-local-authentication` en `app.json` con
  `faceIDPermission` (texto de `NSFaceIDUsageDescription`, obligatorio en
  iOS o el build de EAS falla la validación de App Store). Android no
  necesita configuración — el plugin agrega los permisos solo.

**Pulido — errores de red** (`src/api/client.js`): `timeout: 15000` en la
instancia de axios (antes no tenía, un request colgado podía esperar
indefinidamente) y el interceptor de respuesta ahora sintetiza
`err.response.data.error` con un mensaje legible cuando `!err.response`
(nunca llegó al servidor: sin conexión, DNS, timeout) — distingue timeout
("La conexión tardó demasiado") de sin conexión. Como las 15+ pantallas ya
leen `err.response?.data?.error || '<fallback propio>'`, este único cambio
centralizado hace que todas muestren "sin conexión" en vez de su fallback
genérico, sin tocar cada una.

**Ícono y splash de marca**: generados con Python/Pillow (`sips`/ImageMagick/
`rsvg-convert` no estaban disponibles en el entorno — ver
`gen_icon.py`, script de un solo uso, no forma parte del repo), no diseño
manual: fondo naranja de marca `#F7931A` + un checkmark blanco de trazo
grueso (comunica "tareas" de forma simple y legible incluso achicado).
`android-icon-foreground.png`/`monochrome.png` tienen el símbolo achicado al
~42% del canvas porque Android recorta el foreground del adaptive icon con
máscaras (círculo/squircle/etc.) distintas según el launcher — un símbolo a
pantalla completa se corta. Reemplazable en cualquier momento por un logo
real sin tocar código, sólo los PNG en `assets/`.

**Build con EAS** (`eas.json`, 3 perfiles):
- `development` — dev client, APK interno (no para distribuir).
- `preview` — **APK interno instalable directo en un dispositivo**, sin pasar
  por Google Play. Es el que hay que usar para probar la app de verdad por
  primera vez fuera de Expo Go.
- `production` — AAB (`autoIncrement: true`, así no hay que subir
  `versionCode` a mano en cada build), el formato que exige Google Play para
  apps nuevas.

`app.json` suma `android.package` / `ios.bundleIdentifier`
(`app.blisstracker.mobile`, reverse-domain del dominio real del producto) —
Google Play exige un `package` único y estable; una vez publicado **no se
puede cambiar**, así que se fijó ahora aunque el primer build sea solo de
prueba. El primer `eas build` real también completó solo `extra.eas.projectId`
en `app.json` (resuelve el `eas init` pendiente — no hizo falta correrlo
aparte, `eas build` lo hace la primera vez) y agregó
`android.permissions: [USE_BIOMETRIC, USE_FINGERPRINT]` (el plugin de
`expo-local-authentication` los inyecta al generar el proyecto nativo).

**`mobile/.env` no llega a los builds de EAS — hay que declarar
`EXPO_PUBLIC_API_URL` en `eas.json`.** Encontrado en el primer build real: la
app compilaba y se instalaba bien, pero el login fallaba con "Sin conexión"
— no era un problema de red, `EXPO_PUBLIC_API_URL` quedó `undefined` en el
bundle. Causa: `.env` está en `.gitignore` a propósito (no se sube al repo),
y `eas build` empaqueta el proyecto para el servidor de build en la nube
respetando ese `.gitignore` — el archivo simplemente nunca viaja. Esto solo
afecta a `preview`/`production` (bundles "release", el JS y sus env vars
quedan fijos en build-time); `development` no lo necesita porque un dev
client sigue leyendo el `.env` local en caliente vía Metro. Fix: `eas.json`
declara `env.EXPO_PUBLIC_API_URL` directamente en cada perfil release —
**apuntando al backend de Railway en producción**
(`https://blisstrackersaas-production.up.railway.app`), no a `localhost` ni a
una IP de LAN (ver charla con el usuario: se optó por Railway para que el APK
de prueba funcione desde cualquier red, sabiendo que pega contra la base de
datos real del workspace `bliss`, no un entorno aislado de prueba). Sin
problema de CORS/Socket.IO al pegarle a Railway desde la app nativa:
`backend/src/lib/corsOrigins.js` deja pasar cualquier request sin header
`Origin` (`if (!origin) return true`), que es como llegan las apps nativas
(a diferencia de un browser).

**Paso pendiente, requiere la cuenta de Expo del usuario — no lo puede hacer
un agente** (mismo motivo que `eas init` en la Fase 3, ver arriba). **Ojo:**
`npx eas ...` (sin más) puede fallar con `npm error could not determine
executable to run` — el paquete se llama `eas-cli`, no `eas`, y `npx` no
siempre resuelve solo esa asignación package→binario. Instalar `eas-cli`
explícito evita el problema:
```bash
npm install -g eas-cli
eas login   # o npx eas-cli@latest login si preferís no instalar global
cd mobile
eas build --platform android --profile preview     # primer APK de prueba
eas build --platform android --profile production  # AAB para subir a Play Console
```
El AAB de `production` se sube a Google Play Console a mano (o con
`eas submit`, que ya está declarado en `eas.json` pero requiere un service
account JSON de Google Play — otro paso manual, no cubierto acá).
Recordar la política de Google: cuentas de developer nuevas necesitan un
testing cerrado con ≥20 testers durante 14 días corridos antes de habilitar
producción.

### Identidad de marca real (ícono, splash, loader animado)

Los assets de placeholder de la Fase 5 (checkmark genérico generado con
Python/Pillow) se reemplazaron por el **isotipo real de BlissTracker** —
4 facetas hexagonales tipo "molinillo" en gradiente naranja (`#f39200` →
`#f35a00`), el mismo que ya se usa en la web como favicon/PWA icon
(`frontend/public/blisstracker_logo.svg`, `logo-192.png`, `logo-512.png`) y
como loader animado (`frontend/public/logo-loading.svg`, consumido por
`LoadingSpinner.jsx`). Los 4 `<path>` y sus gradientes están **hardcodeados
en dos lugares** de `mobile/` (`gen.js` de un solo uso para los PNG — no
forma parte del repo — y `src/components/BlissLoader.jsx`) porque no hay
forma directa de compartir el SVG fuente con `frontend/`: son dos apps
totalmente separadas, sin paquete compartido. Si el isotipo cambia alguna
vez, hay que actualizar el path data en ambos lugares a mano.

- **Ícono de la app** (`assets/icon.png`, `android-icon-*.png`,
  `favicon.png`) — rasterizados con `sharp` (Node) desde el SVG fuente
  exacto, no con Pillow como el placeholder anterior (Pillow no rasteriza
  SVG). Fondo blanco en `icon.png`/`android-icon-background.png` (antes
  naranja de marca — con el isotipo ya llevando su propio gradiente naranja,
  blanco da mejor contraste, mismo criterio que `logo-512.png` en la web).
  `android-icon-foreground.png`/`monochrome.png` con el símbolo achicado al
  ~45% del canvas (safe zone de adaptive icons).
- **Splash nativo** (`expo-splash-screen`, plugin en `app.json` — `image`,
  `imageWidth: 220`, `backgroundColor: "#ffffff"`): el isotipo estático
  sobre blanco. Es una limitación de plataforma real, no una decisión de
  diseño — el splash nativo se renderiza antes de que cualquier JS corra,
  así que **no puede animarse**.
- **`src/components/BlissLoader.jsx`** — acá sí, réplica animada exacta del
  loader web con `react-native-svg` + `Animated` de React Native: mismos 4
  `<Path>`/gradientes, mismo timing (1.8s, `cubic-bezier(0.65, 0, 0.35, 1)`,
  keyframes 0%/50%/100% → rotate 0°/180°/360° + scale 1/0.88/1). Un solo
  `Animated.Value` (`progress`, 0→1 en loop) interpola un **string de
  transform SVG completo** (`"rotate(<a> 540 540) scale(<b>)"`) en vez de
  animar rotate/scale por separado — así ambos quedan derivados del mismo
  progreso ya easeado, preservando el timing relativo exacto del CSS
  original. `useNativeDriver: false` a propósito: el native driver no
  soporta animar un prop `transform` de string arbitrario en
  `react-native-svg`.
- **`App.js`** llama `SplashScreen.preventAutoHideAsync()` (antes del primer
  render) + `SplashScreen.hideAsync()` (en un `useEffect` al montar) — el
  splash nativo estático se oculta apenas React Native toma control,
  revelando el `BlissLoader` animado de `RootNavigator` sobre el mismo fondo
  blanco. Sin esto habría un flash en blanco entre el splash nativo y la
  primera pantalla JS.
- **`BlissLoader` reemplaza el spinner genérico solo en los dos momentos de
  "pantalla completa" del arranque** (`RootNavigator` mientras se resuelve
  la sesión guardada, `DashboardScreen` en su primera carga) — no se tocaron
  los `ActivityIndicator` chicos dentro de botones (enviar comentario, crear
  tarea, etc.), donde un ícono de marca grande no encaja bien: ahí el
  spinner nativo del sistema sigue siendo lo apropiado.

**Requiere rebuild para verse** — a diferencia de cambios de JS puro (que
Metro puede hot-reload), el ícono y el splash nativo están "horneados" en el
binario compilado. Hace falta correr `eas build` de nuevo para verlos.

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
| 5 | Biometría (`expo-local-authentication`) + pulido (manejo de errores de red, ícono/splash, build de prueba) | ✅ (código completo — falta correr `eas build`, ver arriba) |

No hay modo offline en la v1 (se evalúa si se vuelve un problema real de uso
en campo con mala señal).
