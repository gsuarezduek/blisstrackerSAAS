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

  // ── Tareas (resto del sistema) ───────────────────────────────────────────
  {
    name: 'tasks_today',
    description: 'La jornada de hoy del usuario conectado: tareas pendientes/en curso/bloqueadas/completadas de hoy.',
    inputSchema: {},
    request: () => ({ method: 'GET', path: '/workdays/today' }),
  },
  {
    name: 'task_create',
    description: 'Crea una tarea nueva en un proyecto, asignada al usuario conectado por defecto.',
    inputSchema: {
      ...projectIdParam,
      description: z.string().describe('Descripción de la tarea'),
      targetUserId: z.number().int().optional().describe('Asignar a otro miembro del workspace (default: el usuario conectado)'),
    },
    request: ({ projectId, description, targetUserId }) => ({
      method: 'POST',
      path: '/tasks',
      body: { projectId, description, targetUserId },
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
]

module.exports = { tools }
