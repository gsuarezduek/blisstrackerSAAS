# Mailing (Marketing → Mailing)

Email marketing **por proyecto**: cada cliente tiene su remitente, sus bases de contactos, sus campañas y sus métricas. Vive como sección de Marketing (`?tab=mailing&sub=campanas|bases|configuracion`), con flag propio.

## Gate

- **Feature flag `mailing`** (`stage: 'testing'`, opt-in por workspace desde SuperAdmin). Es opt-in por el riesgo operativo: un mal uso quema la reputación del dominio de un cliente.
- Además pasa por **los mismos gates que el resto de Marketing**. Las rutas cuelgan de `/api/marketing/projects/:id/mailing` y se montan en `marketing.routes.js` **después** de `requireProjectModulePrefix('marketing')`, así heredan:
  - auth,
  - flag `marketing`,
  - `moduleAccessGuard('marketing')`,
  - privacidad del proyecto,
  - el 404 `PROJECT_MODULE_DISABLED` de un proyecto con Marketing apagado.
- **Escritura** con `canWrite` (admin/owner o equipo del proyecto), igual que el resto de Marketing.
- **Frontend:**
  - `Marketing.jsx` saca la sección de la navegación sin el flag (`hiddenSections`).
  - `preferences/modules.jsx` no la ofrece en "Pestañas visibles".
  - `marketingPending.service.js` (Prioridades) la saltea: todavía no aporta hallazgos.

## Proveedores — las credenciales son del CLIENTE

`MailingConfig` (una por proyecto) guarda el proveedor y **su** credencial:
- una API key de Resend,
- o host/puerto/usuario/contraseña SMTP.

`credentials` es un JSON **cifrado** (`lib/encryption.js`) que nunca vuelve en una respuesta: `publicConfig` expone sólo `configured` + `credentialsHint` (`re_…1234` o host/usuario). Que la credencial sea del cliente es la decisión central: la reputación de envío y el costo quedan de su lado. La API key de Resend **de la plataforma** (`services/email/_shared.js`, mails transaccionales) no se usa nunca para esto.

- **Interfaz común** (`services/mailing/providers/`):
  - `sendBatch(creds, messages)` → `[{ ok, messageId?, error?, retryable?, fatal? }]`
  - `verify(creds, ctx)`
  - `PER_TICK`
  - `supportsWebhooks`

  Para sumar un proveedor (SES, Brevo…) alcanza con un archivo más y registrarlo en `providers/index.js` + `PROVIDER_KEYS`.
- **Resend:**
  - Envía con la Batch API (100 por request, modo `permissive`, 600 ms entre requests por el rate limit por cuenta).
  - `verify` hace tres cosas:
    1. lista los dominios y exige el del remitente `verified`;
    2. avisa si el dominio tiene el tracking propio de Resend (los links se reescribirían dos veces);
    3. **crea solo el webhook** de entregas/rebotes/quejas en la cuenta del cliente y guarda su `signing_secret` cifrado.
  - Con una key de solo envío (`restricted`) no puede crear el webhook: la UI ofrece crearlo a mano y pegar el `whsec_…` (`PUT .../config/webhook-secret`).
- **SMTP:**
  - Usa `nodemailer` con pool.
  - **SSRF:** `assertPublicSmtpHost` rechaza hosts locales, IPs privadas y dominios que resuelven a una privada. Solo acepta los puertos 25/465/587/2525. Se valida al guardar y antes de cada lote, porque el DNS puede cambiar.
  - **No hay rebotes asincrónicos**, solo los rechazos sincrónicos del servidor, y la UI lo avisa.
- **Errores:**
  - `fatal` (auth, dominio no verificado): la config pasa a `invalid` y los envíos vuelven a la cola **sin gastar intento**, porque no es culpa de los destinatarios.
  - `retryable` (429, 5xx, SMTP 4xx, red caída): backoff de 5/30/120 min hasta 3 intentos.
  - El resto es permanente (`failed`).

## Modelo

- **Contactos:** `MailingContact` es **único por proyecto + email**. La baja es por cliente ("no me escribas más"), no por base.
  - `status`: `pending | subscribed | unsubscribed | bounced | complained`.
  - `fields` (Json) son las variables personalizadas.
  - `MailingList` + `MailingListMember` es N–N: un contacto puede estar en varias bases.
- **`MailingCampaign`:**
  - `blocks` (lo que se edita) + `html`/`text` (snapshot congelado al lanzar).
  - `includeListIds`/`excludeListIds`.
  - Contadores desnormalizados de métricas (únicos por destinatario).
- **`MailingSend`** es una fila por destinatario, y es a la vez **la cola** (`status` + `nextAttemptAt` + `claimedAt`) y el registro de qué pasó con ese mail. `token` (aleatorio, 144 bits) identifica el envío en el pixel, los links y la baja sin exponer ids.
- **`MailingLink`/`MailingClick`:** las URLs de la campaña numeradas al lanzar, y los clics únicos por link.
- **`MailingDailyUsage`:** `(projectId, date)` en la tz del workspace. Es la fuente del tope diario.

## Audiencia — incluir y excluir

Los contactos `subscribed` que están en **alguna** base incluida y en **ninguna** excluida (`audience.js` `audienceWhere`). La consulta es sobre `MailingContact`, así que quien está en tres bases incluidas recibe **un** mail: el dedup lo da el modelo. Sin bases incluidas la audiencia es vacía, nunca "todos". Se resuelve **al lanzar**: una programada calcula su audiencia a la hora de salir.

## Envío — tope diario y lotes

1. **Lanzar** (`dispatcher.launchCampaign`):
   - valida `readinessProblems`: config `active`, remitente, dirección postal, asunto, contenido y bases;
   - congela el HTML/texto con los links numerados;
   - crea los `MailingSend` en `queued` en tandas de 1000, dentro de una transacción.

   Pasar de `draft|scheduled` a `sending` es un `updateMany` condicional, así dos clics no lanzan dos veces.
2. **Cron `mailingDispatch` cada minuto** (`runCron`, lease en DB):
   1. lanza las programadas vencidas;
   2. devuelve a la cola los envíos que quedaron en `sending` más de 15 min (proceso caído);
   3. para cada proyecto con campañas en `sending`, solo si el workspace tiene el flag y está `active`/`trialing` (`enabledWorkspaceIds`):
      - se saltea si está **fuera de la ventana horaria** (`sendWindowStart`/`End`, hora de pared del workspace; puede cruzar la medianoche);
      - toma `min(tope del día − usado hoy, PER_TICK del proveedor)` envíos en orden FIFO por lanzamiento;
      - los reclama (`queued → sending`) y **re-chequea el estado del contacto** (si se dio de baja mientras esperaba, `cancelled`);
      - manda y registra todo en una transacción, incluido el `+N` del uso diario.

   El tope efectivo es `min(MailingConfig.dailyLimit, setting mailingMaxDailyPerProject)`. El setting de plataforma (SuperAdmin → Configuración, default 10.000, 0 = sin techo) es un techo global que protege al proceso web: el envío corre en el mismo proceso que la API (ver la deuda de escalabilidad de los crons en `CLAUDE.md`).
3. Lo que no entra hoy sale mañana. `schedule.js` `estimateFinish` estima el día en que termina. Cuenta lo que ya hay en cola de otras campañas del proyecto, que sale antes. La estimación se muestra al lanzar y en el progreso.
4. **Pausar / reanudar / cancelar** cambian el estado de la campaña: el dispatcher solo toma campañas en `sending`, y cancelar marca los `queued` como `cancelled`. Una campaña lanzada no se edita: se duplica.
5. **Prueba** (`POST .../test`): hasta 5 direcciones, con datos de ejemplo y sin tracking. No consume el tope ni cuenta en métricas.

## Contenido — bloques, no HTML

`render.js` convierte los bloques (`heading | text | image | button | divider | spacer`) en HTML de mail: tablas + estilos inline, 600 px.

- **Nunca se acepta HTML escrito por la persona.** El texto rico se guarda como **JSON de TipTap** y se convierte en el servidor con `@tiptap/html/server`, con el mismo set de extensiones que `MailTextEditor.jsx`; hay que mantenerlos en sync.
- Lo demás son datos validados por `sanitizeBlocks`: URLs solo http(s)/mailto, colores `#RRGGBB`.
- TipTap se carga **perezoso** (`loadTiptap`): requerirlo arriba lo cargaría en cada require de la app, y Jest no puede parsear happy-dom. Por eso `tests/unit/mailingRender.test.js` lo mockea.
- El **pie** (nombre + dirección postal + "Darme de baja") y el **pixel** se agregan siempre y no se pueden sacar desde el editor.
- **Variables:** `{{nombre}}`, `{{apellido}}`, `{{email}}`, `{{campo.x}}` y `{{nombre|default}}`. Se escapan en HTML porque vienen de un CSV o de un formulario.
- **Vista previa:** `POST .../preview` usa el mismo render que el envío, así lo que se ve es lo que sale.
- **Imágenes:** `POST .../images` (multipart), magic bytes PNG/JPG/GIF/WEBP, nunca SVG. Van a R2 con **URL pública permanente**: un mail enviado la pide meses después, así que no puede ser una URL firmada. Sin R2 configurado responde 503 y se pega una URL.

## Tracking propio y baja

Es igual para todos los proveedores, así las métricas se comparan entre clientes (en Resend se pide desactivar su tracking).

- **Pixel:** `GET /api/public/mailing/o/:token.gif`. Responde el GIF **antes** de registrar.
- **Clic:** `GET /api/public/mailing/c/:token/:idx` hace un 302 a `MailingLink.url`.
  - La URL sale de la DB, **nunca del request**, así que no es un open redirect.
  - No se trackean `mailto:` ni links con variables adentro (una URL por destinatario no entra en una fila).
  - Un clic también cuenta como apertura.
- **"Primera vez" por destinatario:** se resuelve con `updateMany where firstX: null`, así dos requests simultáneos no cuentan doble (Gmail suele pedir el pixel dos veces).
- **Límite de requests:** los dos endpoints de tracking están **exentos del `globalLimiter`** (`app.js`). Los piden los proxies de imágenes de Gmail/Outlook desde pocas IPs compartidas, y con el límite por IP una campaña grande cortaría el tracking y los clics darían 429.
- **Aperturas:** son **estimadas** (Apple Mail precarga las imágenes, otros las bloquean). La UI lo aclara; los clics son el dato confiable.
- **Baja:**
  - Header `List-Unsubscribe` (link one-click + `mailto:`) + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Gmail y Yahoo lo exigen a los envíos masivos desde 2024. El one-click es `POST /api/public/mailing/u/:token`: **cualquier POST da de baja** (Gmail manda `form-urlencoded`).
  - El link del pie lleva a la página pública `/baja/:token` (`pages/MailingUnsubscribe.jsx`, dominio raíz). Pide confirmar con un botón: los antivirus de correo abren todos los links de un mail, y dar de baja al abrir daría de baja a gente que no lo pidió.
  - Un contacto `bounced`/`complained` no se "degrada" a `unsubscribed`.

## Webhook de Resend

`POST /api/mailing/webhook/resend/:token`, montado con `express.raw()` antes de `express.json()` (como Stripe/Chakra). El `token` (`MailingConfig.webhookToken`) identifica el proyecto y la firma Svix se valida con el secreto de **ese** proyecto.

- `email.delivered` → `delivered`.
- `email.bounced` con tipo `Permanent`/sin tipo → **suprime el contacto** (`bounced`). `Transient` (casilla llena) solo se anota.
- `email.complained` → suprime (`complained`).

Volver a mandarle a una dirección que no existe, o a quien marcó spam, es lo que más castiga la reputación del dominio.

## Contactos

- **Alta manual** (`POST .../contacts`): si el email ya existe se suma a las bases **sin cambiar su estado**.
- **Estados a mano:** a `unsubscribed` desde cualquiera, y a `subscribed` **solo desde `bounced`** (la dirección se corrigió). Nunca se re-suscribe a quien pidió la baja o marcó spam.
- **Importación CSV:**
  - El archivo se parsea **en el browser** (`components/marketing/mailing/csv.js`, espejo del parser de `lib/backlinksCsv.js`: BOM, `;` del Excel en español, comillas).
  - Muestra el mapeo de columnas: email, nombre, apellido, variable personalizada (`{{campo.<clave del encabezado>}}`) o ignorar.
  - Manda **tandas de 2000 filas** (`express.json` corta en 1 MB).
  - Dos pasos con `dryRun`, como la importación de enlaces.
  - **Exige declarar el consentimiento** (`consent: true`, queda en `consentSource`).
  - Un email existente completa los datos que faltan y se suma a las bases, pero **conserva su estado**; los suprimidos se informan aparte.
- **Borrar un contacto pierde su supresión:** una importación posterior lo volvería a crear suscripto. La UI lo advierte y sugiere dar de baja en vez de borrar.

## Pendiente (fases siguientes del plan)

- **Fase 2:**
  - Amazon SES (envío + SNS para rebotes).
  - Importar desde Contactos/Leads de Ventas (`MailingContact.crmContactId` ya existe).
  - Formulario público de suscripción con doble opt-in (`MailingList.publicFormToken`/`doubleOptIn` y `MailingContact.confirmToken` ya existen).
- **Fase 3:**
  - Sección en el informe mensual.
  - Alertas en Prioridades (rebotes > 5%, quejas > 0,1%, credencial inválida).
  - Tools de MCP: borradores y métricas; **lanzar queda para una persona**.
  - Aumento gradual del tope para dominios nuevos.
  - A/B de asunto.
  - Reenvío a quienes no abrieron.

## Archivos

- **Backend:**
  - `services/mailing/` (`render`, `audience`, `schedule`, `dispatcher`, `events`, `config`, `providers/`)
  - `controllers/mailing/` (`config`, `contacts`, `campaigns`, `images`, `public`, `summary`)
  - `routes/mailing.routes.js` y `routes/publicMailing.routes.js`
  - `webhooks/mailingResend.webhook.js`
  - el cron en `index.js`
- **Frontend:** `components/marketing/mailing/` (`MailingTab`, `CampaignsPanel`, `CampaignEditor`, `BlockEditor`, `MailTextEditor`, `CampaignStats`, `ContactsPanel`, `CsvImportModal`, `MailingConfigPanel`, `MailingSummary`, `csv.js`, `ui.jsx`) y `pages/MailingUnsubscribe.jsx`.
- **Tests:**
  - unit: `mailingRender`, `mailingSchedule`, `mailingAudience`, `mailingProviders`, `mailingDispatcher`
  - integración: `tests/integration/mailing.test.js`
  - frontend: `src/tests/utils/mailingCsv.test.js`
