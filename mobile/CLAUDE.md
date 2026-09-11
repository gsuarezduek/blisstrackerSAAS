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
    projects.js      # /api/projects: listar, detalle (endpoint "todo en uno"), star, completadas
    comments.js      # helpers de /api/tasks/:id/comments
    members.js       # GET /workspaces/current/members, filtrado a activos (autocomplete de @menciones)
    devices.js       # POST/DELETE /api/devices/register (push)
    notifications.js # GET /api/notifications, POST /api/notifications/read-all
    chat.js          # helpers REST de /api/chat/channels[...]
    workdays.js      # POST /api/workdays/finish
    vacation.js      # GET /api/vacation/my, POST /api/vacation/my/request
    benefits.js      # GET /api/benefits/my, POST /api/benefits/my/request (horas libres/días home)
  lib/
    push.js          # permisos + Expo Push Token de este dispositivo
    events.js        # pub-sub mínimo propio (RN no tiene `window` ni el módulo `events` de Node)
    socket.js         # conexión Socket.IO única para toda la app (JWT en el handshake)
    biometrics.js     # disponibilidad + prompt de Face ID/huella
    requestCatalog.js # espejo mínimo de VALID_TYPES (vacation) y BANK_CONFIG (benefits) — solo etiquetas
  context/
    AuthContext.jsx  # login, selección de workspace, logout, sesión persistida, registro/baja de push, conexión del socket, gate biométrico
  components/
    TaskCard.jsx           # tarjeta de tarea con botones de acción según status
    AddTaskModal.jsx       # modal para crear tarea (descripción + chips de proyecto)
    TaskCommentsModal.jsx  # comentarios de una tarea + autocomplete de @menciones
    RequestBenefitModal.jsx # modal único para pedir vacaciones/licencia, horas libres o días home
  screens/
    LoginScreen.jsx
    WorkspaceSelectScreen.jsx
    LockScreen.jsx            # gate biométrico al restaurar una sesión guardada
    DashboardScreen.jsx       # tareas de hoy agrupadas por status, pull-to-refresh
    NotificationsScreen.jsx   # centro de notificaciones in-app
    ChannelListScreen.jsx     # lista de canales de chat, no-leídos/menciones en vivo
    ChatScreen.jsx            # mensajes de un canal + input, tiempo real vía socket
    ProjectListScreen.jsx     # proyectos agrupados (destacados/míos/otros)
    ProjectDetailScreen.jsx   # info/situación/links/equipo/tareas/completadas de un proyecto
    ProfileScreen.jsx         # datos del usuario, toggles de biometría/push, logout
    BenefitsScreen.jsx        # saldos + solicitudes de vacaciones/licencias y beneficios
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
  `Animated.Value` (`progress`, 0→1 en loop) interpola dos salidas —
  `rotate` (0→360) y `scale` (1→0.88→1) — aplicadas como las props
  **numéricas** `rotation`/`scaleX`/`scaleY`/`originX={540}`/`originY={540}`
  de `<G>` (no como un string de `transform` armado a mano — ver el bug de
  Fabric más abajo). `useNativeDriver: false` porque el native driver no
  soporta animar props de `react-native-svg`.
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

**⚠️ Bug real encontrado en el primer APK con `BlissLoader`: crasheaba al
abrir la app.** `AnimatedG` animaba la prop `transform` con un **string** SVG
armado a mano (`"rotate(180 540 540) scale(0.88)"`, portado literal del CSS
web) — funciona en la arquitectura vieja de RN, pero con **Fabric** (Nueva
Arquitectura, default desde Expo SDK 53) el `transform` de `<G>` está tipado
del lado nativo como `ReadableArray` (matriz numérica), no string libre.
Pasarle un string tira `ClassCastException: String cannot be cast to
ReadableArray` en `RNSVGGroupManagerDelegate` apenas se monta el primer
frame — `FATAL EXCEPTION` que mata la Activity al toque, siempre (no es un
caso raro/intermitente). **Diagnosticado con el log real** vía `adb logcat`
(instalado con `brew install android-platform-tools`, celular conectado por
USB con Depuración USB activada) — la app no mostraba ningún error en
pantalla porque es un build "release", que no tiene la red screen de
desarrollo. **Fix**: usar las props numéricas propias de `react-native-svg`
(`rotation`, `scaleX`, `scaleY`, `originX`, `originY`) en vez de `transform`
— son `NumberProp`, compatibles con Fabric, y se pueden animar con
interpolación numérica estándar de `Animated` sin tocar nada del lado
nativo. **Lección para el futuro**: si se anima algún otro componente de
`react-native-svg`, evitar el prop `transform` con string — preferir las
props numéricas individuales que exponga el componente.

### Sistema de alertas propio (reemplaza `Alert.alert`)

**Distinción importante que motivó este cambio**: el prompt biométrico real
(el que pide la huella/cara) es del sistema operativo por diseño de
seguridad — ninguna app puede re-skinnearlo, es la garantía de que
efectivamente es el SO pidiendo la biometría y no la app falsificando el
diálogo. Lo que SÍ se podía mejorar era el `Alert.alert` que la propia app
elegía mostrar (el "¿Querés activar Face ID?" antes de ese prompt, y varios
mensajes de error dispersos) — esos se veían con el diálogo gris genérico
del SO en vez de la estética de BlissTracker.

- **`src/lib/alert.js`** — `showAlert(title, message, buttons)`, misma firma
  que `Alert.alert` de React Native (mismo shape de `buttons`:
  `{text, style: 'cancel'|'destructive'|undefined, onPress}`), para que el
  reemplace de cada call site fuera mecánico. Patrón singleton (mismo que
  `setUnauthorizedHandler` en `api/client.js`): un módulo plano que delega a
  un handler registrado por el componente montado en `App.js` — evita tener
  que pasar por `useContext` en cada componente que antes solo importaba
  `Alert` de `react-native`.
- **`src/components/AppAlertHost.jsx`** — el modal en sí (montado una vez en
  `App.js`, junto a `RootNavigator`): card blanca centrada con sombra, título
  + mensaje + fila de botones. Un solo botón (mensajes de error simples) se
  centra solo; dos botones quedan lado a lado. Estilo de botón según
  `button.style`: default = naranja de marca relleno, `'cancel'` = gris
  claro, `'destructive'` = rojo — mismo criterio de color que ya usa el
  resto de la app (`TaskCard`, `LockScreen`).
- **Reemplazados los 8 usos existentes** de `Alert.alert`: el prompt de
  activar biometría (`AuthContext`) y los mensajes de error de
  `TaskCard`/`AddTaskModal`/`TaskCommentsModal`. Ningún componente nuevo
  necesita nada especial para usarlo — `import { showAlert } from
  '../lib/alert'` y listo, sin registrar nada ni envolver en un Provider.

Como es JS puro (sin cambios nativos), **no requiere un rebuild para
compilar** — pero como el APK del perfil `preview`/`production` es un
bundle "release" con el JS embebido estáticamente (no conectado a Metro),
sigue haciendo falta un `eas build` nuevo para verlo reflejado en el
dispositivo, igual que cualquier otro cambio de JS en un build ya instalado.

### Rediseño de las pantallas de entrada (Login, selección de workspace, bloqueo)

Pulido de UX/UI a pedido del usuario, sin fase numerada propia (mismo criterio
que "Identidad de marca real"/"Sistema de alertas propio" arriba): las
pantallas por las que pasa cualquiera antes de llegar al Dashboard —
`LoginScreen`, `WorkspaceSelectScreen`, `LockScreen` — tenían un look
genérico (inputs de caja simple, sin logo, título plano "BlissTracker") muy
distinto del login real de la web (`frontend/src/pages/Login2.jsx`).

- **`src/lib/blissLogoPaths.js`** — se extrajo el array `BLISS_PATHS` (los 4
  `<path>`/gradientes del isotipo) que antes vivía hardcodeado solo dentro de
  `BlissLoader.jsx`, para que un componente estático pudiera reusarlo sin
  duplicar los datos de coordenadas una tercera vez. `BlissLoader` ahora
  importa de ahí en vez de tener su propia copia — mismo comportamiento,
  una sola fuente.
- **`src/components/BlissIcon.jsx`** — el mismo isotipo pero **sin animar**
  (`<G>` estático, sin `Animated`), para usarlo como logo de marca en headers
  y pantallas de entrada donde `BlissLoader` (que gira) no corresponde.
- **`LoginScreen`** — reescrita para calcar el look del login web: lockup
  ícono+"BlissTracker" arriba (alineado a la izquierda, como en
  `Login2.jsx`), título "Bienvenido" + subtítulo, inputs con radio 14 y
  **estado de foco** (borde gris que pasa a naranja de marca al tocar el
  campo — `onFocus`/`onBlur` con estado local, no hay pseudo-clase `:focus`
  en RN), contraseña con botón 👁/🙈 para mostrar/ocultar (mismo patrón que
  `PasswordInput.jsx` de la web, con emoji en vez de SVG por consistencia con
  el resto de la app mobile, que usa emoji como sistema de iconografía en
  todos lados). Banner de error con fondo rojo suave (antes texto rojo
  suelto). Se agregó un link "¿Olvidaste tu contraseña?" que abre en el
  navegador el flujo de la web (`Linking.openURL`) — no hay pantalla de reset
  propia en mobile, y no se justificaba construir una solo para esto
  cuando la web ya la tiene.
- **`WorkspaceSelectScreen`** — mismo lockup + headings, tarjetas con borde
  en vez de fondo gris plano, chevron `›` y badge de rol reposicionados
  (antes el rol quedaba pegado al borde derecho sin espacio para el
  chevron).
- **`LockScreen`** — el emoji 🔒 genérico se reemplazó por `BlissIcon` (logo
  de marca real) y el `ActivityIndicator` nativo mientras autentica por
  `BlissLoader` (mismo componente que ya usa `RootNavigator` al resolver la
  sesión) — consistencia visual entre las dos únicas pantallas de "esperando
  algo" del arranque.
- **Ningún cambio nativo** — es JS/estilos puros (sin dependencias nuevas),
  así que Metro lo refleja al instante en dev; para verlo en el APK ya
  instalado sigue haciendo falta un build nuevo, igual que cualquier otro
  cambio de JS.

Verificado con `npx expo export --platform android` (bundle de 1096 módulos
sin errores) — no reemplaza probarlo en un dispositivo, pero descarta
errores de sintaxis/imports antes de gastar un build de EAS.

### Rediseño de las pantallas internas (Dashboard, Notificaciones, Canales, Chat)

Continuación del pase anterior — mismo lenguaje visual (tarjetas con borde
`1.5px #e5e7eb` y radio `14`, headers blancos con `borderBottomColor: '#eee'`,
`BlissLoader` en vez de `ActivityIndicator` genérico en las cargas de
pantalla completa) aplicado a las pantallas que ya tenían uso diario, no solo
a las de entrada. Deliberadamente **no** se repitió `BlissIcon` en estos
headers — a diferencia de Login/WorkspaceSelect/Lock (donde no había ninguna
marca visible todavía), estas pantallas ya viven detrás del login y repetir
el logo en cada header sería ruido, no identidad (mismo criterio que la web:
el logo aparece una vez en el Navbar, no en cada página interna).

- **`DashboardScreen`** — el header pasa de transparente a tarjeta blanca con
  borde inferior (igual que Notificaciones/Canales) y suma **badges** en los
  íconos 💬/🔔: un círculo rojo con número si hay menciones o notificaciones
  sin leer, o un punto gris chico si hay no-leídos sin mención. Se resuelven
  con `Promise.all([listNotifications(), listChannels()])` en cada foco de
  pantalla (`loadBadges`, junto a `load()` de las tareas) — mismos endpoints
  que ya usan `NotificationsScreen`/`ChannelListScreen`, sin sumar ningún
  endpoint nuevo. Es un adorno: si falla, se traga el error en silencio, no
  bloquea ni ensucia el error banner de las tareas. `HeaderIcon` (componente
  local del archivo, no exportado — se usa 4 veces solo ahí) centraliza el
  ícono + el overlay del badge. `TaskCard` pasa de radio 12/borde 1px a
  radio 14/borde 1.5px, mismo valor que el resto.
- **`NotificationsScreen`/`ChannelListScreen`** — las filas planas separadas
  por una línea (`borderBottomWidth`) pasan a ser tarjetas individuales con
  borde y margen (mismo estilo que `BenefitsScreen`), sobre fondo `#f9fafb`
  en vez de blanco puro. Se sumó `RefreshControl` (pull-to-refresh) a
  Notificaciones, que no lo tenía — Canales ya lo tenía. Estados vacíos con
  emoji grande + texto gris, mismo patrón que el Dashboard ("No hay tareas
  para hoy").
- **`ChatScreen`** — estado de foco en el input (borde gris → naranja al
  tocar, mismo mecanismo `onFocus`/`onBlur` que `LoginScreen`) y un estado
  vacío ("No hay mensajes todavía. ¡Escribí el primero!") para un canal
  recién creado, que antes mostraba una lista en blanco sin ninguna pista.

Ningún cambio nativo — verificado de nuevo con `npx expo export --platform
android` (1096 módulos, sin errores) antes de dar por terminado el pase.

### Backlog y tareas futuras/recurrentes (Dashboard)

Primera pieza de la Fase 9 candidata a implementarse — sin cambios de
backend: `GET /workdays/today` ya devolvía `futureTasks` (tareas con
`scheduledFor` posterior a hoy) además de `tasks`/`carryOverTasks`, pero
`DashboardScreen` los descartaba por completo (solo leía los primeros dos
campos). El Backlog en sí tampoco necesitaba un endpoint nuevo: es
puramente un criterio de agrupación client-side sobre las mismas tareas que
ya se traían — se verificó primero cómo lo resuelve la web
(`frontend/src/pages/Dashboard.jsx`) antes de portarlo, para no reinventar el
criterio.

- **Criterio de Backlog** (`buildSections`, mismo que la web): una tarea de
  **hoy** cae al backlog solo si `isBacklog` (movida a mano con "→
  Backlog"); una tarea **arrastrada** de un día anterior cae ahí además si
  sigue `PENDING` sin destacar — perdió prioridad por el solo hecho de no
  haber arrancado, sin que nadie la haya tocado. Distinguir "de hoy" vs
  "arrastrada" no requirió taggear nada al mezclar `tasks`+`carryOverTasks`
  en un único array: se deriva comparando `task.workDayId` contra el `id`
  del `WorkDay` de hoy (`data.id`, ya venía en la respuesta y no se usaba).
  Esto además hace que el criterio se recalcule solo y correctamente después
  de cualquier `onUpdate` (ej. `add-to-today` le cambia el `workDayId` a
  hoy del lado del backend, así que la próxima recomputación ya lo saca del
  backlog sin lógica adicional en el cliente).
- **Sección "Futuras"** — estado separado (`future`, del campo
  `futureTasks` de la respuesta), no entra en el cálculo de backlog: son
  tareas que directamente no deberían verse todavía. `handleBringToToday`
  las saca de `future` y las mete en `tasks` cuando se confirma "Traer a
  hoy" (`PATCH /tasks/:id/bring-to-today`).
- **Ambas secciones son colapsables y arrancan cerradas** (`backlogOpen`/
  `futureOpen`, default `false`, mismo comportamiento que
  `backlogOpen`/`futureOpen` en la web) — se implementó dejando `data: []`
  en la sección de `SectionList` mientras está cerrada (el header sigue
  mostrándose, solo se vacía el contenido) en vez de no renderizar la
  sección — más simple que manejar un `FlatList` propio para cada una.
  **Ojo con el `ListEmptyComponent` de `SectionList`**: React Native lo
  dispara cuando la suma de `data.length` de todas las secciones es 0, lo
  cual pasaría igual con backlog/futuras colapsadas aunque tengan
  contenido — se evitó directamente no delegándole el estado vacío a
  `SectionList`: si `sections.length === 0` (ninguna categoría de foco, ni
  backlog, ni futuras) se renderiza un `ScrollView` con el mensaje +
  `RefreshControl` propio en vez de montar el `SectionList`.
- **`TaskCard`** ahora acepta `backlog`/`future` (booleanos) que cambian su
  modo, espejo del componente web: en `future` no se puede destacar
  (aparece un badge 📅 `dd/mm` en vez del badge de estado) y el único botón
  es "Traer a hoy"; en `backlog` el único botón es "Agregar a hoy"
  (`PATCH /tasks/:id/add-to-today`); en modo normal, una tarea `PENDING`
  suma un link secundario "→ Backlog" (`PATCH /tasks/:id/move-to-backlog`)
  debajo de las acciones de siempre. Se agregó también un badge 🔁 para
  tareas recurrentes (`task.recurrenceId`, dato que ya viajaba en cada tarea
  sin necesidad de tocar el `include` del backend) — no existía ningún
  indicador de esto en mobile hasta ahora.
- **Deliberadamente fuera de esta pieza**: crear una tarea futura o
  recurrente **desde mobile** (`AddTaskModal` sigue siendo
  descripción+proyecto nomás) — esto solo cubre *ver y mover* lo que ya
  existe (creado desde la web, o materializado en automático por
  `materializeForUser` en cada `getOrCreateToday`). Sumar los controles de
  fecha/recurrencia al modal de creación queda para más adelante si hace
  falta.

Verificado con `npx expo export --platform android` (1096 módulos, sin
errores) — sin backend nuevo que probar, y `TaskCard` sigue siendo
compatible con los demás lugares que lo usan sin estos props
(`ProjectDetailScreen`, que no filtra backlog: ahí el link "→ Backlog"
también aparece para tareas `PENDING`, comportamiento nuevo pero no
rompe nada existente).

### Proyectos (Fase 6)

Primera fase que no estaba en el plan original de la v1 — arrancó a pedido
del usuario tras validar las 6 fases base en un dispositivo real. Cubre
navegar por proyecto, algo que hasta acá la app no tenía (solo "mis tareas de
hoy" cruzando proyectos en el Dashboard).

- **`ProjectListScreen`** — `GET /projects` (mismo endpoint que ya usaba
  `AddTaskModal`, ahora también aquí), agrupado igual que "Mis Proyectos" en
  la web: Destacados (`ProjectStar`) → Mis proyectos (soy del equipo,
  `ProjectMember`) → Otros proyectos del workspace. Estrella tocable inline
  (update optimista, revierte si falla) sin entrar al detalle. Punto rojo si
  el proyecto tiene tareas bloqueadas (`taskCounts.BLOCKED`).
- **`ProjectDetailScreen`** — un solo request cubre casi toda la pantalla:
  `GET /projects/:id/tasks` (mismo endpoint que la web, pese al nombre) ya
  devuelve `project` (info, situación, links, miembros, `chatChannel`) +
  `byUser` (tareas activas agrupadas por persona) en una sola llamada. Se
  aplana `byUser` a una lista simple en el cliente porque la respuesta de
  cada acción de `TaskCard` (start/pause/complete/...) no trae `user` —
  `userId`/`userName` se preservan a mano en `handleUpdate` para poder seguir
  agrupando después de cada acción. Reusa `TaskCard`/`TaskCommentsModal` tal
  cual (mismos componentes que el Dashboard).
- **Botón "💬 Abrir chat del proyecto"** — el proyecto solo trae
  `chatChannel: {slug}` (no el `id` numérico que `ChatScreen` necesita), así
  que al tocar el botón se resuelve con `listChannels()` buscando el que
  matchee ese `slug`, y recién ahí se navega a `Chat` con su `id`. Un paso
  extra (una request más) en vez de duplicar lógica de resolución de canal
  en el backend.
- **Completadas** — sección colapsable al final, `GET /projects/:id/completed`
  paginado (`skip`), carga bajo demanda al abrir (mismo patrón que "Cargar
  más" del Dashboard web).
- **Situación** (HTML en el modelo, WYSIWYG en la web) se muestra como
  **texto plano** (`stripHtml()`, regex simple) — no se sumó una dependencia
  de renderizado HTML por un campo de solo lectura en esta fase.

**Deliberadamente fuera de esta fase** (no por desinterés, por sensibilidad o
complejidad — quedan documentadas como candidatas para más adelante):
**Accesos/credenciales** (dato sensible, necesita una UI de "revelar"
cuidada) y **Reuniones** (cronómetro + participantes, suficientemente
compleja como para ser su propia fase). Tampoco se muestran las redes
sociales del proyecto (`Project.connections`) — solo `websiteUrl` — para no
adivinar el formato de cada red sin haberlo verificado primero.

### Housekeeping (Fase 7)

- **"Finalizar jornada"** (`DashboardScreen`, junto al FAB de "+ Agregar
  tarea", mismo patrón que la web: dos botones en fila) — `POST
  /workdays/finish` + `logout()` inmediatamente después. **Mismo criterio
  que la web**: cerrar la jornada cierra sesión, el `WorkDay` se reabre solo
  al volver a loguearse y visitar el Dashboard (no hay forma de "cerrar la
  jornada y seguir usando la app" — es una decisión del backend, no de esta
  pantalla).
- **`ProfileScreen`** — nombre/email/rol (de `user`, ya resuelto por
  `AuthContext`, sin pegarle a un endpoint nuevo) + dos `Switch`:
  - **Biometría**: reusa `getBiometricEnabled`/`setBiometricEnabled` de la
    Fase 5. Activar pide confirmar con `authenticateAsync()` primero (mismo
    criterio que el prompt post-login) — si falla o cancela, el `Switch`
    quita `onValueChange` de la ecuación: como es controlado y el estado no
    se actualiza hasta confirmar, vuelve solo a su valor anterior sin código
    extra. Desactivar no pide nada.
  - **Push**: **preferencia nueva** (`bliss_push_disabled` en SecureStore,
    separada de la sesión por el mismo motivo que la biometría) — hasta
    esta fase, `syncPushToken()` no tenía forma de "recordar" que el usuario
    no quiere push, así que se lo pedía de nuevo en cada login/restauración
    de sesión. `AuthContext` suma `togglePush(enabled)`: persiste la
    preferencia y hace el registro/baja de `DeviceToken` al toque (no
    espera al próximo login), reusando `syncPushToken`/`unregisterDevice`
    ya existentes. `syncPushToken()` ahora chequea la preferencia antes de
    intentar registrar.
  - **Logout** vive acá, no en el header del Dashboard (donde estaba desde
    la Fase 0) — se reemplazó por un ícono de perfil (👤); un logout directo
    sin ningún contexto en el header principal era demasiado fácil de tocar
    por error, ahora pide confirmación (`showAlert` con Cancelar/Cerrar
    sesión) desde una pantalla dedicada.

### Vacaciones y beneficios (Fase 8)

Arrancó tras un cambio real en el dominio mientras se trabajaba en mobile: el
backend sumó un módulo nuevo de "bancos de beneficios" (`horas_libres` +
`dias_home`, otorgados a mano por el admin — premio de un juego, cobertura de
un evento fuera de horario, etc. — y consumidos por autoservicio con
aprobación; **no son licencias legales**, eso sigue siendo `VacationRequest`
aparte). Se investigó el backend real (`benefits.controller.js`,
`lib/benefitBanks.js`) antes de tocar código mobile, en vez de asumir el
shape a partir de lo ya documentado — el dominio se movió mientras esta
sesión trabajaba en otra cosa.

- **`BenefitsScreen`** — un solo request en paralelo a `GET /vacation/my` +
  `GET /benefits/my`, combinados en una sola lista de "Mis solicitudes"
  (ordenada por `createdAt`, cada fila distingue vacación/licencia de
  beneficio por su `kind` sintético agregado en el cliente) + 3 tarjetas de
  saldo arriba (días de vacaciones, horas libres, días home).
- **`RequestBenefitModal`** — un único modal para las 3 clases de pedido
  (selector inicial de chips), en vez de 3 modales separados: comparten
  layout y validación server-side, la única diferencia real es qué campos
  se muestran (fecha única + cantidad para beneficios, rango de fechas + tipo
  para vacaciones/licencias).
- **`@react-native-community/datetimepicker`** — primera dependencia nativa
  nueva desde el crash de `BlissLoader`/Fabric de la Fase 5; se verificó
  `expo-doctor` (21/21) y que el bundle compila, pero **no se pudo probar en
  un dispositivo real antes de subir** (mismo patrón de riesgo que esa vez:
  "compila" no es lo mismo que "no crashea en release"). Si vuelve a
  crashear, el flujo de diagnóstico con `adb logcat` (celular o el emulador
  `Pixel_10a`) ya está armado y anduvo rápido la vez anterior.
- **Ambos endpoints requieren el feature flag `rrhh`** (`requireFeatureFlag`
  en el backend) — verificado antes de reportar la fase como lista: está
  `enabledGlobally: true` y el workspace `bliss` no lo tiene en
  `disabledFeatureKeys`, así que no debería bloquear la prueba.

**Fechas "YYYY-MM-DD" — mismo cuidado que el resto del backend**:
`describeRequest()`/`fmtDate()` en `BenefitsScreen` arman la fecha a mano
partiendo el string (`split('-')`) en vez de `new Date(dateStr)`, que
interpretaría el string como medianoche UTC y la mostraría corrida un día en
timezones al oeste de UTC (Argentina incluida).

## Roadmap (alcance v1 + extensiones)

Alcance v1 original: tareas de hoy (ver/iniciar/pausar/completar/bloquear/
destacar), comentarios y @menciones en tareas, chat interno, notificaciones
push, login biométrico. Google Sign-In queda para v2. Extensiones agregadas
después de validar la v1 en un dispositivo real: Proyectos, Housekeeping,
Vacaciones y beneficios.

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Setup Expo, navegación, auth (login + selector de workspace + secure storage) | ✅ |
| 1 | Dashboard: tareas de hoy (listar/iniciar/pausar/completar/bloquear/destacar, carry-over, crear tarea) | ✅ |
| 2 | Comentarios y @menciones en tareas | ✅ |
| 3 | Push (backend: `DeviceToken` + servicio de Expo Push; frontend: permisos, registro de token, deep-link, centro de notificaciones) | ✅ |
| 4 | Chat interno (canales, mensajes, Socket.IO) | ✅ |
| 5 | Biometría (`expo-local-authentication`) + pulido (manejo de errores de red, ícono/splash real, build de prueba) | ✅ — probado en dispositivo físico y emulador |
| 6 | Proyectos: lista agrupada + detalle (info/situación/links/equipo/tareas/completadas) | ✅ |
| 7 | Housekeeping: "Finalizar jornada" en el Dashboard + pantalla de Perfil (datos, apagar biometría/push, logout) | ✅ |
| 8 | Vacaciones y beneficios: saldos + pedir + ver solicitudes (vacaciones/licencias, horas libres, días home) | ✅ — pendiente de probar en dispositivo real |
| 9 | Backlog + tareas futuras/recurrentes en el Dashboard | ✅ — pendiente de probar en dispositivo real |
| 9b | A evaluar más adelante: self-view de Productividad, Accesos del proyecto, Briefs, Reuniones | pendiente |

No hay modo offline en la v1 (se evalúa si se vuelve un problema real de uso
en campo con mala señal).
