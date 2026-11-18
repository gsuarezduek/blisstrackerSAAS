# Cron jobs (`backend/src/index.js`)

> Se movió desde `CLAUDE.md` para que no se cargue en todas las sesiones. Leelo cuando la tarea toque este tema.

| Schedule | Timezone | Descripción |
|----------|----------|-------------|
| `1 0 * * 5` (viernes 00:01) | ART | Envía resúmenes semanales de IA por email a todos los miembros |
| `0 0 * * 6` (sábados 00:00) | ART | Actualiza perfil de memoria de insights por usuario |
| `0 1 1 * *` (1° mes 01:00) | ART | **Cadena mensual de snapshots** (`MONTHLY_CHAIN`, secuencial): GEO → GA4 → GSC+DomainRating → PageSpeed → keywords → Instagram → TikTok → YouTube → LinkedIn → Facebook → Ads → competidores → métricas RRHH → **enlaces** (verifica forzando el cooldown y congela el snapshot mensual del perfil, que es lo que lee el informe) → **alertas SEO** (`checkAndSendAllSeoAlerts`, compara snapshots del mes cerrado vs anterior y avisa a admins/owners solo si hay alertas, enlaces perdidos y dominios de referencia incluidos). Todos del mes anterior. Cada job aislado en su try/catch; un fallo no corta la cadena. |
| `0 6 * * 1` (lunes 06:00) | ART | Actualiza rankings de keywords del mes actual (upsert semanal) |
| `30 6 2 * *` (día 2 del mes, 06:30) | ART | Captura el SERP de cada keyword trackeada en SerpAPI (posición, features, top-10, People Also Ask). **Mensual y no semanal**: es el único consumo automático de SerpAPI y gasta 1 búsqueda por keyword por corrida; el seguimiento de posición mes a mes ya lo da Search Console gratis. Día 2 para no pisarse con la cadena mensual del 1°, cuya lease es de 6 h |
| `45 6 * * 1` (lunes 06:45) | ART | Verifica los backlinks cargados de cada proyecto: si el `<a href>` sigue puesto, con qué anchor y qué `rel` (100 por proyecto por corrida, round-robin por `lastCheckedAt`) |
| `0 8 * * 1` (lunes 08:00) | ART | Aviso semanal de Productividad por mail a admins/owners (solo si hay personas en alerta) |
| `0 8 * * *` (diario 08:00) | ART | Recordatorios de Ventas: email al responsable con próximas acciones para hoy/vencidas (solo workspaces con flag `ventas`, dedup diario) |
| `5 8 * * *` (diario 08:05) | ART | Motor de reglas de WhatsApp: reabre conversaciones vencidas con plantillas según criterios configurados (solo workspaces con flags `ventas` **y** `whatsapp`) |
| `0 2 * * *` (diario 02:00) | ART | Acumulación automática de vacaciones (regla "+N días cada M meses" por aniversario de ingreso, solo workspaces con `vacationAccrualEnabled`) |
| `0 3 * * *` (diario 03:00) | ART | Marca trials expirados como `past_due` |
| `0 0 * * *` (medianoche) | ART | Auto-pausa tareas `IN_PROGRESS` al cierre del día |
| `0 3 * * 0` (domingos 03:00) | ART | Limpia notificaciones antiguas (leídas >30d, no leídas >90d) |
| `*/15 * * * *` (cada 15 min) | — | Ejecuta eliminaciones de workspaces programadas vencidas |
| `*/15 * * * *` (cada 15 min) | ART | Refresca los calendarios traídos de afuera (Google ya conectado + URLs iCal) — mantiene fresco el cache que la vista Equipo y el buscador de huecos leen de OTRAS personas; los propios se refrescan al abrir el Calendario (ver `docs/claude/calendario.md`) |
| `* * * * *` (cada minuto) | — | Envío de campañas de Mailing (`mailingDispatch`): lanza las programadas vencidas y manda el próximo lote de cada proyecto respetando su ventana horaria y su tope diario (ver `docs/claude/mailing.md`) |
| `* * * * *` (cada minuto) | — | Respuestas del bot de WhatsApp en espera (`runDueBotReplies`: prioridad a los agentes de IA, `WhatsappBotConfig.agentWaitMins`, ver `docs/claude/whatsapp.md`) |

Los jobs con lógica pesada usan in-memory locks (`let jobRunning = false`) para evitar solapamiento del mismo job consigo mismo. Los **11 jobs mensuales del día 1°** ya **no son crons sueltos**: corren en una **única cadena secuencial** (`MONTHLY_CHAIN`, un solo cron + un solo lock `monthlyChainRunning`), así que no se pisan entre sí (resuelve el problema de PageSpeed solapando a los siguientes).

> **⚠️ Deuda técnica — escalabilidad de crons (revisar a ~100 workspaces):** Hoy todos los crons corren en el **mismo proceso web**; la cadena mensual es secuencial (no se solapa), pero su **tiempo total es la suma** de todos los jobs y el procesamiento pesado (GEO con cheerio+Claude, scraping Apify) compite con el tráfico HTTP. **Fix definitivo (opción A, pendiente):** mover los crons a un **worker process** separado (segundo servicio en Railway) + **cola** (BullMQ/Redis) con concurrencia controlada y **backoff ante 429** de APIs externas (PageSpeed/SerpAPI/Apify/Anthropic). Palancas intermedias adicionales si hiciera falta antes: **repartir la cadena en varios días** del mes (hoy es un solo día por completitud del informe on-demand, que lee estos snapshots) y agregar backoff a los llamados externos.
