const { z } = require('zod')

// Catálogo declarativo de tools del MCP. Cada entrada mapea 1:1 a un endpoint
// que ya existe en la API (ver docs/claude/api-routes.md) — acá no hay lógica
// de negocio nueva, sólo qué llamar y cómo armar query/body a partir de los
// argumentos que manda el cliente MCP (Grok). `server.js` las registra todas
// contra el mismo ejecutor genérico (apiBridge.callApi).

const projectIdParam = { projectId: z.number().int().describe('ID del proyecto (ver marketing_list_projects / list_projects)') }

// Una entrada por red social — misma forma de endpoint (GET /marketing/projects/:id/<red>),
// evita repetir 5 objetos casi idénticos a mano.
const NETWORKS = ['instagram', 'tiktok', 'youtube', 'linkedin', 'facebook']

const LEAD_STATUS_ENUM = z.enum(['prospecto', 'contactado', 'reunion', 'propuesta', 'ganado', 'perdido'])
const LEAD_ORIGIN_ENUM = z.enum(['sitio_web', 'google_ads', 'meta_ads', 'linkedin', 'referido', 'cliente', 'whatsapp', 'evento', 'llamada', 'otro'])

// Un plan de precio de una propuesta (ver docs/claude/ventas.md "Generador de
// propuestas") — reusado en crear y editar propuesta.
const planSchema = z.object({
  label: z.string().optional().describe('Nombre del plan, ej. "Básico"'),
  price: z.number().optional().describe('Precio mensual (exacto, no lo infiere la IA)'),
  currency: z.string().optional().describe('Default: la moneda del lead'),
  plusIva: z.boolean().optional().describe('Si el precio es + IVA'),
  serviceIds: z.array(z.number().int()).optional().describe('IDs del catálogo de Servicios'),
  serviceNames: z.array(z.string()).optional().describe('Servicios libres (no del catálogo)'),
})

const tools = [
  // ── Proyectos ────────────────────────────────────────────────────────────
  {
    name: 'list_projects',
    description: 'Lista todos los proyectos activos del workspace (nombre, websiteUrl, servicios, destacados). Punto de entrada: casi todas las demás tools necesitan un projectId de acá.',
    inputSchema: {},
    request: () => ({ method: 'GET', path: '/projects' }),
  },

  // ── Marketing: lectura ───────────────────────────────────────────────────
  {
    name: 'marketing_health_score',
    description: 'Score compuesto de salud de Marketing de un proyecto: GEO, Keywords, GA4 y PageSpeed.',
    inputSchema: { ...projectIdParam },
    request: ({ projectId }) => ({ method: 'GET', path: `/marketing/projects/${projectId}/health-score` }),
  },
  {
    name: 'marketing_analytics',
    description: 'Datos de Google Analytics 4 (sesiones, conversiones, etc.) de un proyecto en un rango de fechas.',
    inputSchema: {
      ...projectIdParam,
      startDate: z.string().optional().describe('YYYY-MM-DD'),
      endDate:   z.string().optional().describe('YYYY-MM-DD'),
    },
    request: ({ projectId, startDate, endDate }) => ({
      method: 'GET',
      path: `/marketing/projects/${projectId}/analytics`,
      query: { startDate, endDate },
    }),
  },
  {
    name: 'marketing_search_console',
    description: 'Datos de Google Search Console (clicks, impresiones, posición, CTR) de un proyecto.',
    inputSchema: {
      ...projectIdParam,
      startDate: z.string().optional().describe('YYYY-MM-DD'),
      endDate:   z.string().optional().describe('YYYY-MM-DD'),
      compare:   z.boolean().optional().describe('Si true, incluye comparación vs el período anterior'),
    },
    request: ({ projectId, startDate, endDate, compare }) => ({
      method: 'GET',
      path: `/marketing/projects/${projectId}/search-console`,
      query: { startDate, endDate, compare },
    }),
  },
  {
    name: 'marketing_domain_rating',
    description: 'Domain Rating (autoridad de dominio, Ahrefs) cacheado del proyecto.',
    inputSchema: { ...projectIdParam },
    request: ({ projectId }) => ({ method: 'GET', path: `/marketing/projects/${projectId}/domain-rating` }),
  },
  {
    name: 'marketing_keywords',
    description: 'Lista las keywords trackeadas de un proyecto con su posición actual.',
    inputSchema: { ...projectIdParam, country: z.string().optional() },
    request: ({ projectId, country }) => ({ method: 'GET', path: `/marketing/projects/${projectId}/keywords`, query: { country } }),
  },
  {
    name: 'marketing_seo_opportunities',
    description: 'Oportunidades SEO en vivo: keywords en "striking distance", páginas en decadencia y de bajo CTR.',
    inputSchema: { ...projectIdParam },
    request: ({ projectId }) => ({ method: 'GET', path: `/marketing/projects/${projectId}/seo/opportunities` }),
  },
  ...NETWORKS.map(network => ({
    name: `marketing_${network}`,
    description: `Métricas del mes actual de ${network} (seguidores, engagement, mejores posts) para un proyecto.`,
    inputSchema: { ...projectIdParam },
    request: ({ projectId }) => ({ method: 'GET', path: `/marketing/projects/${projectId}/${network}` }),
  })),
  {
    name: 'marketing_meta_ads',
    description: 'Datos de Meta Ads (gasto, clicks, CTR) de un proyecto.',
    inputSchema: { ...projectIdParam, datePreset: z.string().optional().describe('ej. last_30d, this_month') },
    request: ({ projectId, datePreset }) => ({ method: 'GET', path: `/marketing/projects/${projectId}/meta-ads`, query: { datePreset } }),
  },
  {
    name: 'marketing_google_ads',
    description: 'Datos de Google Ads (gasto, clicks, CTR) de un proyecto.',
    inputSchema: { ...projectIdParam, datePreset: z.string().optional() },
    request: ({ projectId, datePreset }) => ({ method: 'GET', path: `/marketing/projects/${projectId}/google-ads`, query: { datePreset } }),
  },
  {
    name: 'marketing_competitors',
    description: 'Lista los competidores trackeados (Instagram/LinkedIn/Facebook) de un proyecto, con seguidores nuevos del mes.',
    inputSchema: { ...projectIdParam, platform: z.enum(['instagram', 'linkedin', 'facebook']).optional() },
    request: ({ projectId, platform }) => ({ method: 'GET', path: `/marketing/projects/${projectId}/competitors`, query: { platform } }),
  },
  {
    name: 'marketing_objectives_progress',
    description: 'Progreso de los objetivos de marketing de un proyecto (target vs real, % cumplido).',
    inputSchema: { ...projectIdParam },
    request: ({ projectId }) => ({ method: 'GET', path: `/marketing/projects/${projectId}/objectives/progress` }),
  },
  {
    name: 'marketing_reports_list',
    description: 'Lista los informes mensuales (ya generados o no) de un proyecto.',
    inputSchema: { ...projectIdParam },
    request: ({ projectId }) => ({ method: 'GET', path: `/marketing/projects/${projectId}/reports` }),
  },
  {
    name: 'marketing_report_get',
    description: 'Obtiene el informe mensual de un proyecto para un mes puntual (datos + análisis IA, si ya fue generado).',
    inputSchema: { ...projectIdParam, month: z.string().describe('YYYY-MM') },
    request: ({ projectId, month }) => ({ method: 'GET', path: `/marketing/projects/${projectId}/reports/${month}` }),
  },
  {
    name: 'marketing_geo_audits_list',
    description: 'Lista las auditorías GEO (visibilidad en IA) ya corridas, opcionalmente filtradas por proyecto.',
    inputSchema: { projectId: z.number().int().optional() },
    request: ({ projectId }) => ({ method: 'GET', path: '/marketing/geo/audits', query: { projectId } }),
  },
  {
    name: 'marketing_geo_audit_get',
    description: 'Detalle completo de una auditoría GEO: score, 6 componentes, hallazgos.',
    inputSchema: { auditId: z.number().int() },
    request: ({ auditId }) => ({ method: 'GET', path: `/marketing/geo/audits/${auditId}` }),
  },

  // ── SEO: Canibalización, Content Brief, On-Page Audit, Content Gap ────────
  // Las 4 corren análisis propios (async salvo canibalización) y comparten la
  // misma forma run/list/get/delete.
  {
    name: 'marketing_cannibal_run',
    description: 'Dispara un análisis de canibalización SEO (keywords que compiten entre sí entre páginas del propio sitio) usando datos de Search Console.',
    inputSchema: { ...projectIdParam, dateRange: z.enum(['30d', '90d', '180d']).optional().describe('Default 90d') },
    request: ({ projectId, dateRange }) => ({ method: 'POST', path: `/marketing/projects/${projectId}/cannibal`, body: { dateRange } }),
  },
  {
    name: 'marketing_cannibal_list',
    description: 'Lista los reportes de canibalización SEO ya generados de un proyecto.',
    inputSchema: { ...projectIdParam },
    request: ({ projectId }) => ({ method: 'GET', path: `/marketing/projects/${projectId}/cannibal` }),
  },
  {
    name: 'marketing_cannibal_get',
    description: 'Detalle de un reporte de canibalización SEO.',
    inputSchema: { ...projectIdParam, reportId: z.number().int() },
    request: ({ projectId, reportId }) => ({ method: 'GET', path: `/marketing/projects/${projectId}/cannibal/${reportId}` }),
  },
  {
    name: 'marketing_cannibal_delete',
    description: 'Elimina un reporte de canibalización SEO.',
    inputSchema: { ...projectIdParam, reportId: z.number().int() },
    request: ({ projectId, reportId }) => ({ method: 'DELETE', path: `/marketing/projects/${projectId}/cannibal/${reportId}` }),
  },
  {
    name: 'marketing_content_brief_run',
    description: 'Genera un Content Brief con IA para una keyword: headings sugeridos, PAA, entidades y longitud vs el top 10 de Google.',
    inputSchema: { ...projectIdParam, keyword: z.string().describe('Keyword objetivo, máx 120 caracteres') },
    request: ({ projectId, keyword }) => ({ method: 'POST', path: `/marketing/projects/${projectId}/content-briefs`, body: { keyword } }),
  },
  {
    name: 'marketing_content_briefs_list',
    description: 'Lista los Content Briefs ya generados de un proyecto.',
    inputSchema: { ...projectIdParam },
    request: ({ projectId }) => ({ method: 'GET', path: `/marketing/projects/${projectId}/content-briefs` }),
  },
  {
    name: 'marketing_content_brief_get',
    description: 'Detalle de un Content Brief.',
    inputSchema: { ...projectIdParam, briefId: z.number().int() },
    request: ({ projectId, briefId }) => ({ method: 'GET', path: `/marketing/projects/${projectId}/content-briefs/${briefId}` }),
  },
  {
    name: 'marketing_content_brief_delete',
    description: 'Elimina un Content Brief.',
    inputSchema: { ...projectIdParam, briefId: z.number().int() },
    request: ({ projectId, briefId }) => ({ method: 'DELETE', path: `/marketing/projects/${projectId}/content-briefs/${briefId}` }),
  },
  {
    name: 'marketing_onpage_audit_run',
    description: 'Dispara una auditoría On-Page (crawler de hasta 15 páginas del sitio: title/meta/H1/alt/canonical/enlaces rotos + sugerencias de enlazado interno). Async: devuelve un auditId. Requiere websiteUrl configurado en el proyecto.',
    inputSchema: { ...projectIdParam },
    request: ({ projectId }) => ({ method: 'POST', path: `/marketing/projects/${projectId}/onpage/audit` }),
  },
  {
    name: 'marketing_onpage_audits_list',
    description: 'Lista las auditorías On-Page ya corridas de un proyecto.',
    inputSchema: { ...projectIdParam },
    request: ({ projectId }) => ({ method: 'GET', path: `/marketing/projects/${projectId}/onpage/audits` }),
  },
  {
    name: 'marketing_onpage_audit_get',
    description: 'Estado/detalle de una auditoría On-Page (score, findings por página, sugerencias de enlazado interno). Útil para hacer polling mientras status=running.',
    inputSchema: { ...projectIdParam, auditId: z.number().int() },
    request: ({ projectId, auditId }) => ({ method: 'GET', path: `/marketing/projects/${projectId}/onpage/audits/${auditId}` }),
  },
  {
    name: 'marketing_onpage_audit_delete',
    description: 'Elimina una auditoría On-Page.',
    inputSchema: { ...projectIdParam, auditId: z.number().int() },
    request: ({ projectId, auditId }) => ({ method: 'DELETE', path: `/marketing/projects/${projectId}/onpage/audits/${auditId}` }),
  },
  {
    name: 'marketing_content_gap_run',
    description: 'Dispara un análisis de Content Gap: compara la estructura propia vs el top 4 del SERP de una keyword y detecta temas/secciones que faltan. Async: devuelve un gapId. Requiere SERP_API_KEY configurado y que la keyword ya rankee.',
    inputSchema: { ...projectIdParam, keyword: z.string().describe('Keyword objetivo, máx 120 caracteres') },
    request: ({ projectId, keyword }) => ({ method: 'POST', path: `/marketing/projects/${projectId}/content-gap`, body: { keyword } }),
  },
  {
    name: 'marketing_content_gaps_list',
    description: 'Lista los análisis de Content Gap ya generados de un proyecto.',
    inputSchema: { ...projectIdParam },
    request: ({ projectId }) => ({ method: 'GET', path: `/marketing/projects/${projectId}/content-gaps` }),
  },
  {
    name: 'marketing_content_gap_get',
    description: 'Detalle de un análisis de Content Gap (gaps por prioridad, headings sugeridos).',
    inputSchema: { ...projectIdParam, gapId: z.number().int() },
    request: ({ projectId, gapId }) => ({ method: 'GET', path: `/marketing/projects/${projectId}/content-gaps/${gapId}` }),
  },
  {
    name: 'marketing_content_gap_delete',
    description: 'Elimina un análisis de Content Gap.',
    inputSchema: { ...projectIdParam, gapId: z.number().int() },
    request: ({ projectId, gapId }) => ({ method: 'DELETE', path: `/marketing/projects/${projectId}/content-gaps/${gapId}` }),
  },

  // ── Marketing: escritura ─────────────────────────────────────────────────
  {
    name: 'marketing_geo_audit_run',
    description: 'Dispara una nueva auditoría GEO (visibilidad en IA) para un proyecto. Async: devuelve un auditId para consultar con marketing_geo_audit_get. Requiere que el proyecto tenga websiteUrl configurado.',
    inputSchema: { ...projectIdParam },
    request: ({ projectId }) => ({ method: 'POST', path: '/marketing/geo/audit', body: { projectId } }),
  },
  {
    name: 'marketing_add_keyword',
    description: 'Agrega una keyword a trackear en un proyecto.',
    inputSchema: { ...projectIdParam, query: z.string().describe('La keyword/frase a trackear') },
    request: ({ projectId, query }) => ({ method: 'POST', path: `/marketing/projects/${projectId}/keywords`, body: { query } }),
  },
  {
    name: 'marketing_add_competitor',
    description: 'Agrega una cuenta de la competencia para trackear por scraping (Instagram, LinkedIn o Facebook).',
    inputSchema: {
      ...projectIdParam,
      urlOrUsername: z.string().describe('URL o @handle/slug de la cuenta del competidor'),
      platform: z.enum(['instagram', 'linkedin', 'facebook']).optional().describe('Default instagram'),
    },
    request: ({ projectId, urlOrUsername, platform }) => ({
      method: 'POST',
      path: `/marketing/projects/${projectId}/competitors`,
      body: { url: urlOrUsername, platform },
    }),
  },
  {
    name: 'marketing_report_regenerate',
    description: 'Genera o regenera el informe mensual de un proyecto (dispara análisis IA, consume presupuesto de tokens del workspace). Las secciones no incluidas en enabledSections quedan excluidas del informe.',
    inputSchema: {
      ...projectIdParam,
      month: z.string().describe('YYYY-MM, ancla del informe'),
      enabledSections: z.array(z.string()).describe('Claves de sección a incluir, ej. ["analytics","instagram","objectives"]'),
    },
    request: ({ projectId, month, enabledSections }) => ({
      method: 'POST',
      path: `/marketing/projects/${projectId}/reports/${month}/regenerate`,
      body: { enabledSections },
    }),
  },
  {
    name: 'marketing_refresh_run',
    description: 'Dispara un refresco masivo de fuentes de Marketing (GA4, Search Console, Domain Rating, Keywords, Instagram/Facebook/LinkedIn/TikTok/YouTube, Google Ads, Meta Ads, PageSpeed) — vuelve a traer los datos de cada fuente, lo que automáticamente deja al día el progreso de los objetivos de marketing y el health score (ninguno de los dos se cachea: se recalculan solos en cada lectura, no hace falta nada más). Async: devuelve un jobId al instante, consultar con marketing_refresh_status. Sigue con las demás fuentes/proyectos si una falla.',
    inputSchema: {
      projectId: z.number().int().optional().describe('Proyecto puntual. Sin esto, actualiza todos los proyectos activos del workspace.'),
      sources: z.array(z.enum([
        'analytics', 'search_console', 'domain_rating', 'keywords',
        'instagram', 'facebook', 'linkedin', 'tiktok', 'youtube',
        'google_ads', 'meta_ads', 'pagespeed',
      ])).optional().describe('Sin esto, usa las fuentes que cada proyecto tenga conectadas (excepto pagespeed, que consume cuota de la API de Google y solo corre si se pide explícito).'),
    },
    request: ({ projectId, sources }) => ({ method: 'POST', path: '/marketing/refresh', body: { projectId, sources } }),
  },
  {
    name: 'marketing_refresh_status',
    description: 'Estado de un refresco masivo disparado con marketing_refresh_run: running o completed, resumen de conteos (ok/error/sin conexión/en cooldown) y el detalle por proyecto × fuente (incluye el motivo si una fuente falló, ej. token vencido o cooldown activo).',
    inputSchema: { jobId: z.number().int() },
    request: ({ jobId }) => ({ method: 'GET', path: `/marketing/refresh/${jobId}` }),
  },

  // ── Tareas (resto del sistema) ───────────────────────────────────────────
  {
    name: 'tasks_today',
    description: 'La jornada de hoy del usuario conectado: tareas pendientes/en curso/bloqueadas/completadas de hoy.',
    inputSchema: {},
    request: () => ({ method: 'GET', path: '/workdays/today' }),
  },
  {
    name: 'task_create',
    description: 'Crea una tarea nueva en un proyecto, asignada al usuario conectado por defecto. Opcionalmente futura (scheduledFor) o recurrente (recurrence) — mutuamente excluyentes.',
    inputSchema: {
      ...projectIdParam,
      description: z.string().describe('Descripción de la tarea'),
      targetUserId: z.number().int().optional().describe('Asignar a otro miembro del workspace (default: el usuario conectado)'),
      scheduledFor: z.string().optional().describe('YYYY-MM-DD — tarea futura (one-off): no aparece en foco/backlog hasta esa fecha. Una fecha <= hoy se trata como tarea normal.'),
      recurrence: z.object({
        frequency: z.enum(['daily', 'weekly', 'monthly', 'annual']).describe('daily=diaria, weekly=semanal, monthly=mensual, annual=anual'),
        weekdays: z.array(z.number().int().min(0).max(6)).optional().describe('Solo weekly: días de la semana, 0=domingo..6=sábado'),
        dayOfMonth: z.number().int().min(1).max(31).optional().describe('Solo monthly/annual: día del mes (default: el día de hoy)'),
        month: z.number().int().min(1).max(12).optional().describe('Solo annual: mes (default: el mes actual)'),
        endDate: z.string().optional().describe('YYYY-MM-DD — última fecha en que se genera una ocurrencia. Omitido = nunca termina.'),
      }).optional().describe('Si se manda, crea una serie recurrente en vez de una tarea normal'),
    },
    request: ({ projectId, description, targetUserId, scheduledFor, recurrence }) => ({
      method: 'POST',
      path: '/tasks',
      body: { projectId, description, targetUserId, scheduledFor, recurrence },
    }),
  },
  {
    name: 'task_start',
    description: 'Inicia una tarea (pasa a IN_PROGRESS). Falla si el usuario ya tiene otra tarea en curso.',
    inputSchema: { taskId: z.number().int() },
    request: ({ taskId }) => ({ method: 'PATCH', path: `/tasks/${taskId}/start` }),
  },
  {
    name: 'task_pause',
    description: 'Pausa una tarea en curso.',
    inputSchema: { taskId: z.number().int() },
    request: ({ taskId }) => ({ method: 'PATCH', path: `/tasks/${taskId}/pause` }),
  },
  {
    name: 'task_resume',
    description: 'Reanuda una tarea pausada.',
    inputSchema: { taskId: z.number().int() },
    request: ({ taskId }) => ({ method: 'PATCH', path: `/tasks/${taskId}/resume` }),
  },
  {
    name: 'task_complete',
    description: 'Marca una tarea como completada.',
    inputSchema: { taskId: z.number().int() },
    request: ({ taskId }) => ({ method: 'PATCH', path: `/tasks/${taskId}/complete` }),
  },
  {
    name: 'task_block',
    description: 'Bloquea una tarea en curso con un motivo (notifica al equipo del proyecto).',
    inputSchema: { taskId: z.number().int(), reason: z.string().describe('Motivo del bloqueo') },
    request: ({ taskId, reason }) => ({ method: 'PATCH', path: `/tasks/${taskId}/block`, body: { reason } }),
  },
  {
    name: 'task_unblock',
    description: 'Desbloquea una tarea (vuelve a IN_PROGRESS).',
    inputSchema: { taskId: z.number().int() },
    request: ({ taskId }) => ({ method: 'PATCH', path: `/tasks/${taskId}/unblock` }),
  },
  {
    name: 'task_set_duration',
    description: 'Edita el tiempo registrado de una tarea ya completada (en minutos). Solo funciona sobre tareas COMPLETED; sobreescribe el tiempo que cuenta en Reportes/Productividad.',
    inputSchema: { taskId: z.number().int(), minutes: z.number().int().min(0).describe('Minutos totales a registrar') },
    request: ({ taskId, minutes }) => ({ method: 'PATCH', path: `/tasks/${taskId}/duration`, body: { minutes } }),
  },

  // ── Contenido (calendario de piezas de RRSS con aprobación del cliente) ──
  // Catálogo fijo de backend/src/lib/contentCatalog.js.
  {
    name: 'contenido_pieces_list',
    description: 'Lista las piezas de contenido de un proyecto. Sin status, excluye "publicado" (vive aparte). status acepta varios separados por coma.',
    inputSchema: {
      ...projectIdParam,
      status: z.string().optional().describe('Uno o más de: idea,produccion,revision,aprobacion,cambios,aprobado,programado,publicado,archivado (coma-separado)'),
      network: z.enum(['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'x', 'threads', 'pinterest', 'blog', 'email']).optional(),
      ownerId: z.number().int().optional(),
      from: z.string().optional().describe('YYYY-MM-DD'),
      to: z.string().optional().describe('YYYY-MM-DD'),
      q: z.string().optional().describe('búsqueda por texto'),
      skip: z.number().int().optional(),
      take: z.number().int().optional(),
    },
    request: ({ projectId, ...rest }) => ({ method: 'GET', path: `/contenido/projects/${projectId}/pieces`, query: rest }),
  },
  {
    name: 'contenido_piece_get',
    description: 'Detalle de una pieza de contenido (copy, assets, estado, responsable, historial de tareas).',
    inputSchema: { ...projectIdParam, pieceId: z.number().int() },
    request: ({ projectId, pieceId }) => ({ method: 'GET', path: `/contenido/projects/${projectId}/pieces/${pieceId}` }),
  },
  {
    name: 'contenido_piece_history',
    description: 'Timeline de cambios de estado de una pieza (quién hizo qué y cuándo, incluye decisiones del cliente).',
    inputSchema: { ...projectIdParam, pieceId: z.number().int() },
    request: ({ projectId, pieceId }) => ({ method: 'GET', path: `/contenido/projects/${projectId}/pieces/${pieceId}/history` }),
  },
  {
    name: 'contenido_summary',
    description: 'Resumen de Contenido de un proyecto: cantidad de piezas por estado y cuántas esperan aprobación del cliente.',
    inputSchema: { ...projectIdParam },
    request: ({ projectId }) => ({ method: 'GET', path: `/contenido/projects/${projectId}/summary` }),
  },
  {
    name: 'contenido_piece_comments_list',
    description: 'Lista el hilo de comentarios de una pieza (internos y del cliente mezclados, con su visibility).',
    inputSchema: { ...projectIdParam, pieceId: z.number().int() },
    request: ({ projectId, pieceId }) => ({ method: 'GET', path: `/contenido/projects/${projectId}/pieces/${pieceId}/comments` }),
  },
  {
    name: 'contenido_piece_create',
    description: 'Crea una pieza de contenido nueva (arranca en estado "idea" si no se especifica status).',
    inputSchema: {
      ...projectIdParam,
      title: z.string().describe('Título de la pieza'),
      types: z.array(z.enum(['post', 'carrusel', 'reel', 'story', 'video', 'articulo', 'newsletter', 'otro'])).optional(),
      networks: z.array(z.enum(['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'x', 'threads', 'pinterest', 'blog', 'email'])).optional(),
      status: z.enum(['idea', 'produccion', 'revision', 'aprobacion', 'cambios', 'aprobado', 'programado', 'publicado', 'archivado']).optional(),
      copy: z.string().optional().describe('Texto del posteo — este sí viaja al portal del cliente'),
      hashtags: z.string().optional(),
      designDetails: z.string().optional().describe('Brief de diseño — nunca viaja al portal'),
      internalNotes: z.string().optional().describe('Notas internas — nunca viaja al portal'),
      scheduledAt: z.string().optional().describe('Fecha/hora ISO de publicación'),
      ownerId: z.number().int().optional().describe('Responsable (miembro del workspace)'),
    },
    request: ({ projectId, ...body }) => ({ method: 'POST', path: `/contenido/projects/${projectId}/pieces`, body }),
  },
  {
    name: 'contenido_piece_update',
    description: 'Edita campos de una pieza de contenido, incluido el status (dispara el log de cambio de estado). Solo manda los campos que quieras cambiar.',
    inputSchema: {
      ...projectIdParam,
      pieceId: z.number().int(),
      title: z.string().optional(),
      types: z.array(z.enum(['post', 'carrusel', 'reel', 'story', 'video', 'articulo', 'newsletter', 'otro'])).optional(),
      networks: z.array(z.enum(['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'x', 'threads', 'pinterest', 'blog', 'email'])).optional(),
      status: z.enum(['idea', 'produccion', 'revision', 'aprobacion', 'cambios', 'aprobado', 'programado', 'publicado', 'archivado']).optional(),
      copy: z.string().optional(),
      hashtags: z.string().optional(),
      designDetails: z.string().optional(),
      internalNotes: z.string().optional(),
      scheduledAt: z.string().optional(),
      ownerId: z.number().int().optional(),
    },
    request: ({ projectId, pieceId, ...body }) => ({ method: 'PATCH', path: `/contenido/projects/${projectId}/pieces/${pieceId}`, body }),
  },
  {
    name: 'contenido_piece_delete',
    description: 'Elimina (soft-delete) una pieza de contenido.',
    inputSchema: { ...projectIdParam, pieceId: z.number().int() },
    request: ({ projectId, pieceId }) => ({ method: 'DELETE', path: `/contenido/projects/${projectId}/pieces/${pieceId}` }),
  },
  {
    name: 'contenido_piece_send_to_dashboard',
    description: 'Crea una tarea en el dashboard del responsable ACTUAL de la pieza ("enviar al dashboard"). 409 si el tramo anterior sigue en curso.',
    inputSchema: { ...projectIdParam, pieceId: z.number().int() },
    request: ({ projectId, pieceId }) => ({ method: 'POST', path: `/contenido/projects/${projectId}/pieces/${pieceId}/send-to-dashboard` }),
  },
  {
    name: 'contenido_request_approval',
    description: 'Manda el email de "pedir aprobación" a los contactos del cliente que pueden aprobar. Sin pieceIds, incluye todas las piezas en estado "aprobacion".',
    inputSchema: { ...projectIdParam, pieceIds: z.array(z.number().int()).optional() },
    request: ({ projectId, pieceIds }) => ({ method: 'POST', path: `/contenido/projects/${projectId}/request-approval`, body: { pieceIds } }),
  },
  {
    name: 'contenido_piece_comment_add',
    description: 'Agrega un comentario a una pieza. visibility "internal" (default, solo equipo) o "client" (lo ve el cliente en el portal).',
    inputSchema: {
      ...projectIdParam,
      pieceId: z.number().int(),
      body: z.string().describe('Texto del comentario'),
      visibility: z.enum(['internal', 'client']).optional().describe('Default internal'),
    },
    request: ({ projectId, pieceId, body, visibility }) => ({
      method: 'POST',
      path: `/contenido/projects/${projectId}/pieces/${pieceId}/comments`,
      body: { body, visibility },
    }),
  },

  // ── Ventas (CRM) ─────────────────────────────────────────────────────────
  // Catálogo fijo de backend/src/lib/salesCatalog.js. Sin projectIdParam: Ventas
  // no cuelga de un proyecto (cuelga de empresa/contacto/lead a nivel workspace).
  {
    name: 'ventas_dashboard',
    description: 'Tarjetas del dashboard de Ventas: total de leads, propuestas del mes, por cerrar, ganados/perdidos del mes, acciones de hoy/vencidas.',
    inputSchema: {},
    request: () => ({ method: 'GET', path: '/ventas/dashboard' }),
  },
  {
    name: 'ventas_metrics',
    description: 'Métricas/forecast de Ventas: forecast ponderado, win rate, ticket y ciclo promedio, embudo por etapa, ranking por responsable, leads por origen.',
    inputSchema: {},
    request: () => ({ method: 'GET', path: '/ventas/metrics' }),
  },
  {
    name: 'ventas_team',
    description: 'Lista los responsables comerciales asignables (admins + miembros con acceso al módulo Ventas).',
    inputSchema: {},
    request: () => ({ method: 'GET', path: '/ventas/team' }),
  },
  {
    name: 'ventas_companies_list',
    description: 'Lista empresas del CRM, opcionalmente filtradas por texto.',
    inputSchema: { search: z.string().optional() },
    request: ({ search }) => ({ method: 'GET', path: '/ventas/companies', query: { search } }),
  },
  {
    name: 'ventas_company_get',
    description: 'Detalle de una empresa del CRM.',
    inputSchema: { companyId: z.number().int() },
    request: ({ companyId }) => ({ method: 'GET', path: `/ventas/companies/${companyId}` }),
  },
  {
    name: 'ventas_company_create',
    description: 'Crea una empresa en el CRM.',
    inputSchema: {
      name: z.string().describe('Nombre de la empresa'),
      website: z.string().optional(),
      industry: z.string().optional(),
      notes: z.string().optional(),
    },
    request: (body) => ({ method: 'POST', path: '/ventas/companies', body }),
  },
  {
    name: 'ventas_company_update',
    description: 'Edita una empresa del CRM.',
    inputSchema: {
      companyId: z.number().int(),
      name: z.string().optional(),
      website: z.string().optional(),
      industry: z.string().optional(),
      notes: z.string().optional(),
    },
    request: ({ companyId, ...body }) => ({ method: 'PATCH', path: `/ventas/companies/${companyId}`, body }),
  },
  {
    name: 'ventas_company_delete',
    description: 'Elimina una empresa del CRM (cascada: borra sus contactos y leads).',
    inputSchema: { companyId: z.number().int() },
    request: ({ companyId }) => ({ method: 'DELETE', path: `/ventas/companies/${companyId}` }),
  },
  {
    name: 'ventas_contacts_list',
    description: 'Lista contactos del CRM, opcionalmente de una empresa puntual.',
    inputSchema: { companyId: z.number().int().optional() },
    request: ({ companyId }) => ({ method: 'GET', path: '/ventas/contacts', query: { companyId } }),
  },
  {
    name: 'ventas_contact_create',
    description: 'Crea un contacto dentro de una empresa del CRM.',
    inputSchema: {
      companyId: z.number().int(),
      name: z.string(),
      title: z.string().optional().describe('Cargo'),
      email: z.string().optional(),
      phone: z.string().optional(),
    },
    request: (body) => ({ method: 'POST', path: '/ventas/contacts', body }),
  },
  {
    name: 'ventas_contact_update',
    description: 'Edita un contacto del CRM.',
    inputSchema: {
      contactId: z.number().int(),
      name: z.string().optional(),
      title: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
    },
    request: ({ contactId, ...body }) => ({ method: 'PATCH', path: `/ventas/contacts/${contactId}`, body }),
  },
  {
    name: 'ventas_contact_delete',
    description: 'Elimina un contacto del CRM.',
    inputSchema: { contactId: z.number().int() },
    request: ({ contactId }) => ({ method: 'DELETE', path: `/ventas/contacts/${contactId}` }),
  },
  {
    name: 'ventas_leads_list',
    description: 'Lista leads del CRM con filtros. Sin archived, devuelve solo los activos (no archivados).',
    inputSchema: {
      status: LEAD_STATUS_ENUM.optional(),
      ownerId: z.number().int().optional(),
      origin: LEAD_ORIGIN_ENUM.optional(),
      from: z.string().optional().describe('YYYY-MM-DD, por fecha de alta'),
      to: z.string().optional().describe('YYYY-MM-DD, por fecha de alta'),
      search: z.string().optional(),
      archived: z.boolean().optional().describe('true = solo archivados'),
    },
    request: (query) => ({ method: 'GET', path: '/ventas/leads', query }),
  },
  {
    name: 'ventas_lead_get',
    description: 'Detalle completo de un lead: empresa, contactos, timeline, próximas acciones, propuestas e investigaciones.',
    inputSchema: { leadId: z.number().int() },
    request: ({ leadId }) => ({ method: 'GET', path: `/ventas/leads/${leadId}` }),
  },
  {
    name: 'ventas_lead_create',
    description: 'Crea un lead nuevo. Para la empresa/contacto se puede mandar un id existente o datos para crearlos inline (companyId O newCompany, primaryContactId O newContact).',
    inputSchema: {
      companyId: z.number().int().optional(),
      newCompany: z.object({ name: z.string(), website: z.string().optional(), industry: z.string().optional(), notes: z.string().optional() }).optional(),
      primaryContactId: z.number().int().optional(),
      newContact: z.object({ name: z.string(), title: z.string().optional(), email: z.string().optional(), phone: z.string().optional() }).optional(),
      ownerId: z.number().int().optional(),
      status: LEAD_STATUS_ENUM.optional().describe('Default: prospecto'),
      origin: LEAD_ORIGIN_ENUM.optional(),
      estimatedValue: z.number().optional(),
      currency: z.string().optional().describe('Default: ARS'),
      title: z.string().optional().describe('Título/nombre del lead'),
      nextContactAt: z.string().optional().describe('YYYY-MM-DD'),
    },
    request: (body) => ({ method: 'POST', path: '/ventas/leads', body }),
  },
  {
    name: 'ventas_lead_update',
    description: 'Edita los campos generales de un lead (no el estado/responsable, que tienen tools propias).',
    inputSchema: {
      leadId: z.number().int(),
      title: z.string().optional(),
      origin: LEAD_ORIGIN_ENUM.optional(),
      estimatedValue: z.number().optional(),
      currency: z.string().optional(),
      nextContactAt: z.string().optional().describe('YYYY-MM-DD'),
      notes: z.string().optional().describe('Notas de reunión (HTML o texto)'),
      primaryContactId: z.number().int().optional(),
      companyId: z.number().int().optional(),
    },
    request: ({ leadId, ...body }) => ({ method: 'PATCH', path: `/ventas/leads/${leadId}`, body }),
  },
  {
    name: 'ventas_lead_delete',
    description: 'Elimina un lead. Falla si tiene propuestas confirmadas.',
    inputSchema: { leadId: z.number().int() },
    request: ({ leadId }) => ({ method: 'DELETE', path: `/ventas/leads/${leadId}` }),
  },
  {
    name: 'ventas_lead_set_status',
    description: 'Cambia el estado de un lead (mueve la columna del pipeline). lostReason es obligatorio si el estado nuevo es "perdido".',
    inputSchema: { leadId: z.number().int(), status: LEAD_STATUS_ENUM, lostReason: z.string().optional() },
    request: ({ leadId, status, lostReason }) => ({ method: 'PATCH', path: `/ventas/leads/${leadId}/status`, body: { status, lostReason } }),
  },
  {
    name: 'ventas_lead_set_owner',
    description: 'Cambia el responsable comercial de un lead (notifica al nuevo responsable).',
    inputSchema: { leadId: z.number().int(), ownerId: z.number().int().nullable().describe('null para quitar responsable') },
    request: ({ leadId, ownerId }) => ({ method: 'PATCH', path: `/ventas/leads/${leadId}/owner`, body: { ownerId } }),
  },
  {
    name: 'ventas_lead_archive',
    description: 'Archiva o desarchiva un lead (lo saca del Pipeline sin borrarlo).',
    inputSchema: { leadId: z.number().int(), archived: z.boolean(), reason: z.string().optional() },
    request: ({ leadId, archived, reason }) => ({ method: 'PATCH', path: `/ventas/leads/${leadId}/archive`, body: { archived, reason } }),
  },
  {
    name: 'ventas_lead_convert',
    description: 'Convierte un lead (en estado "propuesta" o "ganado") en un Proyecto real. Lo marca ganado y vincula el proyecto.',
    inputSchema: {
      leadId: z.number().int(),
      name: z.string().optional().describe('Default: nombre de la empresa'),
      serviceIds: z.array(z.number().int()).optional(),
      memberIds: z.array(z.number().int()).optional().describe('Equipo del proyecto nuevo'),
    },
    request: ({ leadId, ...body }) => ({ method: 'POST', path: `/ventas/leads/${leadId}/convert`, body }),
  },
  {
    name: 'ventas_lead_action_add',
    description: 'Agrega una próxima acción a un lead. Si tiene dueAt y un responsable configurado en Ventas, crea también una tarea futura vinculada.',
    inputSchema: {
      leadId: z.number().int(),
      title: z.string(),
      dueAt: z.string().optional().describe('YYYY-MM-DD'),
      ownerId: z.number().int().optional().describe('Default: el usuario conectado'),
    },
    request: ({ leadId, ...body }) => ({ method: 'POST', path: `/ventas/leads/${leadId}/actions`, body }),
  },
  {
    name: 'ventas_lead_action_resolve',
    description: 'Marca una próxima acción como resuelta (y completa su tarea vinculada si seguía abierta).',
    inputSchema: { leadId: z.number().int(), actionId: z.number().int() },
    request: ({ leadId, actionId }) => ({ method: 'PATCH', path: `/ventas/leads/${leadId}/actions/${actionId}/resolve` }),
  },
  {
    name: 'ventas_lead_action_delete',
    description: 'Elimina una próxima acción de un lead.',
    inputSchema: { leadId: z.number().int(), actionId: z.number().int() },
    request: ({ leadId, actionId }) => ({ method: 'DELETE', path: `/ventas/leads/${leadId}/actions/${actionId}` }),
  },
  {
    name: 'ventas_lead_note_add',
    description: 'Agrega una nota manual al timeline de un lead.',
    inputSchema: { leadId: z.number().int(), content: z.string() },
    request: ({ leadId, content }) => ({ method: 'POST', path: `/ventas/leads/${leadId}/notes`, body: { content } }),
  },
  {
    name: 'ventas_lead_note_delete',
    description: 'Elimina una nota del timeline de un lead (solo el autor o un admin).',
    inputSchema: { leadId: z.number().int(), noteId: z.number().int() },
    request: ({ leadId, noteId }) => ({ method: 'DELETE', path: `/ventas/leads/${leadId}/notes/${noteId}` }),
  },
  {
    name: 'ventas_lead_research_run',
    description: 'Dispara una investigación IA de la empresa del lead (sitio web + Claude). Async: consultar con ventas_lead_research_get.',
    inputSchema: { leadId: z.number().int() },
    request: ({ leadId }) => ({ method: 'POST', path: `/ventas/leads/${leadId}/research` }),
  },
  {
    name: 'ventas_lead_research_get',
    description: 'Obtiene la investigación IA más reciente de un lead (o su progreso si sigue corriendo).',
    inputSchema: { leadId: z.number().int() },
    request: ({ leadId }) => ({ method: 'GET', path: `/ventas/leads/${leadId}/research` }),
  },
  {
    name: 'ventas_lead_research_report_generate',
    description: 'Genera (o regenera) el informe de diagnóstico para el cliente, en HTML persuasivo, a partir de la investigación ya hecha.',
    inputSchema: { leadId: z.number().int(), researchId: z.number().int(), instructions: z.string().optional() },
    request: ({ leadId, researchId, instructions }) => ({
      method: 'POST',
      path: `/ventas/leads/${leadId}/research/${researchId}/report`,
      body: { instructions },
    }),
  },
  {
    name: 'ventas_lead_research_report_update',
    description: 'Edita a mano el título/HTML del informe de diagnóstico ya generado (sin volver a llamar a la IA).',
    inputSchema: { leadId: z.number().int(), researchId: z.number().int(), title: z.string().optional(), html: z.string().optional() },
    request: ({ leadId, researchId, title, html }) => ({
      method: 'PATCH',
      path: `/ventas/leads/${leadId}/research/${researchId}/report`,
      body: { title, html },
    }),
  },
  {
    name: 'ventas_lead_proposals_list',
    description: 'Lista las versiones de propuesta de un lead.',
    inputSchema: { leadId: z.number().int() },
    request: ({ leadId }) => ({ method: 'GET', path: `/ventas/leads/${leadId}/proposals` }),
  },
  {
    name: 'ventas_lead_proposal_create',
    description: 'Genera una propuesta nueva con IA a partir de 1 o más planes de precio. El precio de cada plan es exacto (lo define quien llama, nunca lo inventa la IA).',
    inputSchema: {
      leadId: z.number().int(),
      plans: z.array(planSchema).describe('Al menos 1 plan'),
      objectives: z.string().optional().describe('Objetivos del cliente para encuadrar la propuesta'),
      instructions: z.string().optional().describe('Indicaciones puntuales para esta generación'),
      title: z.string().optional(),
      quality: z.enum(['standard', 'max']).optional().describe('standard=Sonnet 5 (default, ~35s), max=Opus 5 (~90s, más caro)'),
    },
    request: ({ leadId, ...body }) => ({ method: 'POST', path: `/ventas/leads/${leadId}/proposals`, body }),
  },
  {
    name: 'ventas_lead_proposal_update',
    description: 'Edita una propuesta: título, status (draft/confirmed — confirmed habilita el link público), o los planes (precio/moneda/+IVA/servicios).',
    inputSchema: {
      leadId: z.number().int(),
      proposalId: z.number().int(),
      title: z.string().optional(),
      status: z.enum(['draft', 'confirmed']).optional(),
      plans: z.array(planSchema).optional(),
    },
    request: ({ leadId, proposalId, ...body }) => ({ method: 'PATCH', path: `/ventas/leads/${leadId}/proposals/${proposalId}`, body }),
  },
  {
    name: 'ventas_lead_proposal_delete',
    description: 'Elimina una versión de propuesta.',
    inputSchema: { leadId: z.number().int(), proposalId: z.number().int() },
    request: ({ leadId, proposalId }) => ({ method: 'DELETE', path: `/ventas/leads/${leadId}/proposals/${proposalId}` }),
  },
]

module.exports = { tools }
