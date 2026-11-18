# Índice de tests

> Se movió desde `CLAUDE.md` para que no se cargue en todas las sesiones. Leelo cuando la tarea toque este tema.

```
backend/
  jest.config.js
  tests/
    setup.js          ← define JWT_SECRET, NODE_ENV, RESEND_API_KEY (dummy) para evitar que email.service.js falle al importarse
    unit/
      auth.middleware.test.js
      assertNoActiveTask.test.js
      analyticsSnapshot.helpers.test.js   # monthBounds, prevMonth, delta helpers
      analyticsPartialMonth.test.js       # el mes EN CURSO no se compara contra el mes anterior completo: días transcurridos en la tz del workspace, la ventana equivalente del mes anterior (13 días contra 13, recortada en febrero) y la proyección a fin de mes
      analyticsInsightPeriod.test.js      # que el prompt del análisis IA de Web use ese criterio: refresca el snapshot antes de analizar, compara contra 1–13 de octubre (-7%) y nunca contra octubre completo (-58%), y no inventa comparación el 1° del mes ni con GA4 vencido
      ga4QueryCatalog.test.js             # lista blanca de "Preguntale a tus datos": dimensión/métrica/filtro/orden fuera del catálogo se rechazan, la fecha sólo en los formatos de GA4, el orden por default (top N vs serie temporal) y el mapeo a runReport
      analyticsAsk.test.js                # el loop IA ↔ GA4 de "Preguntale a tus datos": una consulta inválida del modelo no sale a Google (el error vuelve a él), el property lo pone el backend y no el modelo, las filas vuelven con nombre de columna, el tope de pasos y el token vencido que corta el loop
      pageSpeed.helpers.test.js           # URL normalization, scoreRating, parseAudit
      monthUtils.test.js                  # periodMonths, periodLabel (períodos calendario de objetivos)
      marketingObjectives.service.test.js # computeObjectives: flujo vs stock, posición invertida, orphaned, head-to-head competidor
      legajoCatalog.test.js               # resolve/sanitize de campos de legajo (builtins blindados, customs, completitud)
      lateNotification.test.js            # lateMinutes (regla de tardanza con tolerancia) + default template
      attendance.test.js                  # inArrivalWindow (ventana ±2h) + laborableDays (regla del >50%) + loginMinsFromMidnight
      eosAutoScorecard.service.test.js    # métricas automáticas del Scorecard EOS: tardanzas (top 3 días/min, tolerancia), ocupación (ponderada, licencias, sin horario) + mensuales (delta_horas, proyectos nuevos/perdidos, equipo, mes vencido)
      linkedinScrape.test.js              # parseLinkedinCompany (URL/slug/showcase) + computeLinkedinScrapeMetrics (filtro por mes, totales, engagement rate por seguidores, campos null del scraping)
      facebookScrape.test.js              # parseFacebookPage (URL/slug/profile.php) + computeFacebookScrapeMetrics (filtro por mes, totales, engagement rate por seguidores, campos null del scraping)
      chatgptAds.test.js                  # ChatGPT Ads: presets → rango de fechas en la tz de la cuenta, CTR ratio → %, estados a mayúscula, conversiones best-effort (null ≠ 0), clasificación de 401/403/429
      mfa.test.js                         # verifyTotp (códigos con espacios, basura, secret inválido), hasMfa (enrolamiento sin confirmar ≠ activo), códigos de recuperación (alfabeto, normalización, un solo uso, carrera entre requests), verifySecondFactor
      agentOutboundChannels.test.js       # canales de salida hacia un agente: el aviso pegado a la respuesta de una tool (no marca visto, throttle), el webhook (firma HMAC, no filtra el trabajo, reintento, SSRF) y el despertador (identidad del agente, args inválidos, tope de pasos)
      cannibalResolution.test.js          # conflictos de canibalización resueltos: identidad (query+idioma), ventana posterior al arreglo, corte de volumen prorrateado y la regla de reapertura (impresiones residuales de un 301 ≠ "volvió")
      libroIvaDigital.test.js             # Libro IVA Digital (ventas): líneas de 266/62 caracteres reproducidas byte a byte de un export real, alícuotas múltiples, documento 99, nombre con caracteres fuera de Windows-1252 sin correr el ancho, y un monto que no entra es error y no recorte
      textSearch.test.js                  # búsqueda tolerante a tildes (backend): variantes de una palabra (lineales, por la regla de "una tilde por palabra" del español) y combinación de palabras con AND
      connectionCatalog.test.js           # estado de las fuentes de datos de un proyecto (active/expired/missing), el link de reconexión apunta a la app y no a OAuth, y el espejo con ConnectionsPanel.jsx del frontend
      mcpComposedTools.test.js            # tools que encadenan endpoints: el orden de los pasos de `task_log_done` (duración antes que fecha), qué devuelve cuando falla a mitad de camino, y el recorte de `list_projects`
      tokenPurpose.test.js                # INVARIANTE: verifyToken acepta sólo tokens de sesión y rechaza mfaToken / state de OAuth / google-link / portal de cliente; oauthState ida y vuelta; tope de intentos del desafío de 2FA
      projectFileThumbnails.test.js       # qué tipos de archivo de la Nube llevan portada propia (`canHaveThumbnail`): imagen, video y PDF sí; lo que el browser no puede rasterizar, no — es el espejo de servidor de `makeThumbnail`
      projectModules.test.js              # criterio de módulos por proyecto: el campo ausente cuenta como prendido, cada módulo mira el suyo, y los `where` que se esparcen en ~25 queries no se mutan
      contentSeo.test.js                  # inventario del blog (Marketing): las reglas de alerta con su piso de volumen (una nota que pasó de 2 clics a 1 no "perdió el 50%"), la curva de CTR esperado por posición, el idioma por prefijo de ruta y la lectura de un sitemap y de la API de WordPress
      trialLifecycle.test.js              # mails del trial: urgencia contada contra trialEndsAt (trial de 30 días, extendido a mano, trial corto), días en la tz del workspace, y precio/plan Gratis leídos de la configuración en vez de escritos en el template
      mailingRender.test.js               # Mailing: bloques → HTML de mail sin HTML inyectable, links numerados para tracking (sin mailto ni links con variables), pie de baja siempre, variables escapadas con default
      mailingSchedule.test.js             # Mailing: ventana horaria en la tz del workspace (también cruzando la medianoche) y estimación de días según el tope diario
      mailingAudience.test.js             # Mailing: audiencia = alguna base incluida y ninguna excluida, solo suscriptos, nunca "todos" sin bases
      mailingDispatcher.test.js           # Mailing: el tope diario (y el techo de plataforma) manda cuántos salen por tick, fuera de la ventana no sale nada, quien se dio de baja en cola no recibe, credencial rechazada no quema intentos, backoff de los errores temporales
      mailingSns.test.js                  # Mailing: firma de SNS (v1/v2, mensaje alterado, certificado fuera del dominio de SNS) y qué errores de SES invalidan la config
      mailingCrmFilter.test.js            # Mailing: qué contactos de Ventas entran según estados/orígenes/contacto principal
      mailingProviders.test.js            # Mailing: qué errores de Resend/SMTP se reintentan o invalidan la config, y el SMTP no puede apuntar a la red interna (SSRF)
      externalCalendar.test.js            # calendarios traídos de afuera: instante UTC → hora de pared del workspace, y el mapeo de lo que devuelven Google y un ICS (fin EXCLUSIVO del día completo, el evento de las 22:00 que en UTC cae al día siguiente, series expandidas con EXDATE, lo rechazado y los carteles de Google que no son citas)
    integration/
      auth.test.js
      starTask.test.js
      taskComments.test.js
      announcements.controller.test.js
      backlog.test.js
      projectLinks.test.js
      projectModules.test.js              # Marketing/Contenido por proyecto: el gate de las dos secciones (404, no 403, ni para un admin), que el gate de privacidad corre primero, el endpoint que los prende/apaga (una clave ausente no pisa la otra) y las piezas que dejan de aparecer en el buscador global
      projectAccess.test.js               # accesos del proyecto: editar sin revelar el secreto (clave ausente = sin cambios), no inventar cambios al reescribir el mismo valor, y el historial (alta/edición/baja/reveal) sin valores
      vacation.controller.test.js         # usa fechas dinámicas (futureDate) para respetar validación ≥48h
      chat.controller.test.js             # @everyone/@equipo/menciones individuales, responder=mención (+dedup), canal privado y proyecto privado, permisos de editar/eliminar/fijar
      mfaLogin.test.js                    # login con 2FA no entrega sesión, el mfaToken no sirve como Bearer, verify con TOTP/código de recuperación, desafío quemado a los 5 intentos, reset de contraseña exige el código
      mfaSetup.test.js                    # setup/confirm/disable/regenerate: el secret se guarda cifrado y nunca sale en GET /profile, confirm valida el primer código, disable pide contraseña Y código
      agentTasks.test.js                  # tareas de agente: crear/iniciar/delegar/borrar vía MCP, la bandeja de novedades (las dos fuentes), y el desbloqueo desde la app (PAUSED + respuesta como comentario + disparo de los canales de salida), los filtros de la cola (por bot y por fecha) y el cierre con fecha hacia atrás (`logged-at`: jornada + completedAt juntos, tope del mes en curso)
      taskCompleteDirect.test.js          # completar directo una pendiente/pausada: no toca la tarea en curso, conserva lo trabajado de la pausada, duración opcional solo en la pendiente, sale de Backlog/Programadas, bloqueada → 400, vía MCP la tarea sigue siendo de quien era y la delegada a "cualquiera" queda del agente que la cierra
      taskSearch.test.js                  # búsqueda de tareas: filas recortadas, atajo "open", admin para ver las de otra persona, proyectos privados afuera
      cannibalResolution.test.js          # marcar/desmarcar un conflicto como resuelto (persona y agente), el split abierto/resuelto en la lectura del reporte con los conteos recalculados, y los permisos (canWrite)
      connectionsStatus.test.js           # GET /marketing/connections: los tres estados + reconnectUrl, secciones apagadas, vista de todo el workspace y gate de proyectos privados resuelto en el handler
      financeLibroIva.test.js             # exportar Libro IVA Digital: un emisor y un mes, solo responsables inscriptos, el resumen (NC resta, lo sin confirmar queda afuera con aviso, homologación) y el ZIP con los dos .txt en Windows-1252 + CRLF
      financeInvoiceList.test.js          # listado de facturas de Finanzas (pestaña Facturas): rango de emisión inclusive por día, emisor (incluido `none` = informativas), fechas mal formadas o invertidas → 400
      financeInvoiceEdit.test.js          # editar una factura de Finanzas: sólo las informativas (un comprobante de ARCA se rechaza con o sin CAE) y el monto no puede bajar de lo ya cobrado
      financeMovementInvoice.test.js      # imputar un ingreso ya cargado a una factura: pasar de "a cuenta" a factura, el pendiente que no se cuenta dos veces a sí mismo, nota de crédito y factura rechazada afuera, y la cuota del extra que se desvincula
      blogInventory.test.js               # inventario del blog (rutas de Marketing): la tabla con sus filtros y su orden (lo no medido va al final, "mejor posición" es el número más chico), las 3 queries y las dos ventanas del refresco, el cooldown, la importación idempotente en dos pasos, la ficha SEO (y que Contenido ya no escribe esos datos) y la fusión de grupos de traducción
      mailingPhase2.test.js               # Mailing fase 2: formulario público (303 a "revisá tu mail", CORS abierto solo ahí, re-suscripción siempre confirmada, honeypot, freno de reenvío), confirmación (y link vencido), webhook de SES (tópico fijado, queja suprime) e importación desde Ventas sin acceso → 403
      mailing.test.js                     # Mailing: gates (flag `mailing`, Marketing apagado → 404, escritura canWrite), la API key del cliente se guarda cifrada y nunca vuelve, SMTP a la red interna rechazado, importación sin re-suscribir a los dados de baja, clic → URL guardada (no open redirect), pixel siempre 200, one-click de Gmail, webhook de Resend firmado (rebote duro suprime, temporal no)
      externalCalendars.test.js           # suscribir un calendario de afuera: la URL iCal se guarda cifrada y nunca vuelve, son de cada persona (404 sobre el de otro), el título de la agenda ajena se enmascara salvo showDetails, y las reuniones que empujamos a Google no vuelven como "externas"

frontend/
  src/tests/
    setup.js
    utils/
      format.test.js
      textSearch.test.js                  # búsqueda sin tildes del lado del browser (normalizeText/matchesSearch/matchesAnyField)
      linkify.test.jsx
      webTabDates.test.js                 # getDateParams, formatDateLabel, currentMonthStr, prevMonthStr
    components/
      taskCommentsModalComplete.test.jsx # "Completar" en el detalle de la tarea: la pendiente pide duración opcional, en curso/pausada en un click, no aparece en ajenas/bloqueadas/completadas
      projectAccesos.test.jsx           # la fila de un acceso: quién lo cargó y quién lo editó, y que un acceso viejo sin autor no se lo invente
      monthlyTrendChart.test.jsx        # gráfico de 12 meses de Web → Analytics: un mes sin dato es "s/d" y no una barra en cero, el tooltip con visitas/eventos/variación, el aviso del mes en curso, y el espejo del catálogo GA4 (formato de tasa/duración y valores crudos como "202611")
    hooks/
      useRoles.test.js
```
