// Guía para el agente conectado por MCP (Grok u otro cliente). Dos piezas:
//
// - INSTRUCTIONS: texto corto que el server manda en el handshake `initialize`
//   (campo `instructions` del protocolo MCP). Los clientes que lo soportan lo
//   inyectan solo en el contexto del modelo apenas se conecta — no depende de
//   que el modelo decida llamar nada.
// - buildGuide(topic): la guía completa, servida por la tool `bliss_guide`
//   (ver server.js). INSTRUCTIONS le dice al agente que la llame primero.
//
// El índice de tools se arma solo a partir de toolCatalog.js, así una tool
// nueva aparece en la guía sin tocar este archivo. Lo que sí hay que mantener
// a mano son las reglas, permisos y límites de abajo — mismo criterio que el
// Wiki (frontend/src/data/wikiContent.js, categoría "Agentes IA (MCP)").

const INSTRUCTIONS = `Estás conectado a BlissTracker, la plataforma de gestión de una agencia (tareas, proyectos/clientes, marketing, contenido, ventas/CRM, equipo).

Antes de tu primera acción en una conversación:
1. Llamá a \`bliss_guide\` (sin argumentos) para leer qué podés y qué no podés hacer, las reglas del negocio y los flujos recomendados.
2. Llamá a \`whoami\` para saber en nombre de quién actuás, si es admin y a qué módulos tiene acceso.

Reglas que no se negocian:
- Actuás SIEMPRE como la persona dueña del token, con sus permisos reales: nunca más. Un 403 significa "esa persona no tiene permiso", no lo reintentes por otro camino.
- Todo lo que creás o modificás queda registrado a nombre de esa persona y es visible para el equipo (y a veces para el cliente). Antes de borrar, enviar algo al cliente, mover el estado de un lead o generar algo que consume IA, confirmá con el usuario.
- Los IDs se resuelven leyendo, nunca se inventan: empezá por \`list_projects\`, \`team_list\`, \`ventas_leads_list\`, etc.
- Fechas en formato YYYY-MM-DD; la zona horaria es la del workspace (por defecto America/Argentina/Buenos_Aires).`

// Prefijo de nombre de tool → sección de la guía. El orden define el orden de aparición.
const AREAS = [
  { key: 'general',    label: 'General',                match: n => ['bliss_guide', 'whoami', 'list_projects', 'services_list', 'project_update_services'].includes(n) },
  { key: 'tareas',     label: 'Tareas y jornada',       match: n => n.startsWith('task') },
  { key: 'equipo',     label: 'Equipo y productividad', match: n => n.startsWith('team_') },
  { key: 'marketing',  label: 'Marketing (métricas)',   match: n => n.startsWith('marketing_') && !SEO_TOOLS.test(n) },
  { key: 'seo',        label: 'SEO avanzado',           match: n => SEO_TOOLS.test(n) },
  { key: 'contenido',  label: 'Contenido',              match: n => n.startsWith('contenido_') },
  { key: 'ventas',     label: 'Ventas / CRM',           match: n => n.startsWith('ventas_') },
]
const SEO_TOOLS = /^marketing_(cannibal|content_brief|content_gap|onpage)/

const SECTIONS = {
  general: `## Quién sos y cómo funcionan los permisos

- Cada token pertenece a UNA persona en UN workspace. Las tools llaman a la misma API que usa la app web, así que heredan exactamente sus reglas: rol (owner/admin/member), módulos habilitados para el workspace, acceso por rol/persona a cada módulo, proyectos privados y estado de facturación.
- Roles: **owner/admin** ven y administran todo el workspace; **member** trabaja sobre lo suyo y sobre los proyectos (cualquier miembro ve todos los proyectos no privados y puede crear tareas en cualquiera de ellos, aunque no sea de su equipo).
- Módulos opcionales (pueden estar apagados o restringidos por rol): Marketing, Contenido, Ventas. Si una tool de un módulo devuelve 403/404, el módulo está apagado o la persona no tiene acceso — decíselo al usuario en vez de insistir. \`whoami\` → \`moduleAccess\` te lo anticipa.
- **Proyectos privados**: el nombre lo ve todo el workspace, pero el contenido (tareas, marketing, contenido, etc.) y la creación de tareas quedan reservados a su equipo y a los admins. Si una tool sobre un proyecto devuelve 403 para alguien que no es del equipo, probablemente es privado.
- Si el workspace tiene la facturación vencida (\`past_due\`), las escrituras pueden fallar con 402/403: solo lectura hasta que se regularice el pago.
- Errores: las tools devuelven \`Error <status>: <json>\`. 400 = argumento inválido (leé el mensaje y corregí), 403 = sin permiso, 404 = no existe o no es visible, 409 = conflicto de estado (ej. ya hay otra tarea en curso), 429 = límite/cooldown (esperá).

## Proyectos y servicios
- \`list_projects\` es el punto de entrada: trae id, nombre, sitio web, servicios contratados y equipo. Casi todo lo demás necesita un \`projectId\`.
- \`project_update_services\` REEMPLAZA la lista completa de servicios (no suma). Leé los actuales primero y mandá todos. Solo admin/owner.`,

  tareas: `## Tareas y jornada

Modelo mental (igual que en la app):
- Cada persona tiene una **jornada** (WorkDay) por día. \`tasks_today\` la devuelve (no la abre: si la persona todavía no entró hoy, ves sus tareas igual, en solo lectura). Las tareas pendientes/pausadas/bloqueadas de días anteriores se arrastran solas.
- En la respuesta de \`tasks_today\`, \`tasks\`/\`carryOverTasks\`/\`futureTasks\` son las tareas de la PERSONA; las que ejecutan sus agentes vienen aparte en \`agentTasks\` (abiertas + completadas hoy). Para tu propia lista de trabajo usá \`tasks_agent_queue\`.
- Estados: PENDING → IN_PROGRESS → PAUSED / BLOCKED / COMPLETED. BLOCKED y PAUSED vuelven a IN_PROGRESS con \`task_unblock\` / \`task_resume\`.
- **Una sola tarea IN_PROGRESS por persona** (tareas humanas). \`task_start\` falla (409) si ya hay otra en curso: pausá la actual primero (\`task_pause\`) y recién ahí iniciá la otra. Las **tareas de agente** (ver abajo) no cuentan para esa regla.
- El tiempo se mide solo mientras la tarea está IN_PROGRESS. \`task_set_duration\` corrige minutos de una tarea YA completada (no sirve para tareas abiertas).
- \`task_block\` exige motivo y notifica al equipo del proyecto: usalo solo si de verdad algo frena el trabajo.

Crear tareas (\`task_create\`):
- Escribí la descripción como acción concreta y verificable ("Enviar propuesta de pauta a Juan", no "Pauta").
- Por defecto se asigna a la persona del token; \`targetUserId\` la asigna a otro miembro (ID de \`team_list\`). Se le notifica.
- \`scheduledFor\` (YYYY-MM-DD) = tarea futura: no aparece hasta esa fecha. \`recurrence\` = serie recurrente (diaria/semanal con días/mensual/anual, con \`endDate\` opcional). Son excluyentes.
- **\`executor\`: decidí SIEMPRE quién la va a hacer.** \`executor: "agent"\` si la vas a ejecutar VOS (el agente): queda en tu lista de trabajo, separada de las tareas de la persona, no ocupa su lugar de "1 en curso" y su tiempo no se mezcla con el de ella. \`executor: "user"\` (default) si es trabajo para la persona (o para otro miembro con \`targetUserId\`). Una tarea de agente no se puede asignar a otra persona.

## Tareas de agente (tu lista de trabajo)
- \`tasks_agent_queue\`: tus tareas abiertas (las tuyas + las que la persona delegó a "cualquiera de sus agentes"). Revisala al empezar a trabajar: la persona puede delegarte tareas desde la app.
- Ejecutá con el mismo ciclo: \`task_start\` → \`task_complete\`. Podés tener varias en curso. Si algo te frena, \`task_block\` con un motivo claro: es la forma de pedirle ayuda a la persona.
- No dejes tareas en curso indefinidamente: completalas o pausalas al terminar de trabajar. El tiempo de tus tareas se registra aparte del de la persona (no suma a sus horas ni a las horas contratadas del cliente).
- \`task_set_executor\` cambia quién ejecuta una tarea propia que no esté en curso: \`agent\` (te la tomás vos) o \`user\` (se la devolvés a la persona). Con \`scope: "series"\` en una tarea recurrente aplica a toda la serie.

Lo que NO se puede hacer por MCP con tareas: borrar, editar el texto, destacar (estrella), mover al backlog, comentar, adjuntar archivos ni seguir/delegar a otra persona. Esas acciones se hacen desde la app.
- Ver la jornada de OTRA persona: \`tasks_today\` con \`userId\` (solo admin/owner, solo lectura).`,

  equipo: `## Equipo y productividad
- \`team_list\`: todo el equipo (nombre, email, rol, rol de equipo, activo). Usalo para resolver IDs de personas.
- \`team_attendance\` (admin/owner): hora de ingreso por día, horario pactado, tardanzas y % de puntualidad. No hay hora de salida: el producto solo registra el ingreso.
- \`team_task_history\` (admin/owner): historial detallado de tareas con duración real y pausas, filtrable por persona y rango (default últimos 30 días). No existen "fecha límite" ni "estimación": no los inventes.
- No se puede por MCP: invitar/desactivar personas, cambiar roles, aprobar vacaciones ni editar legajos.`,

  marketing: `## Marketing (requiere módulo Marketing + acceso)
- Lecturas por proyecto: salud (\`marketing_health_score\`), GA4, Search Console, Domain Rating, keywords, oportunidades SEO, las 5 redes (Instagram, TikTok, YouTube, LinkedIn, Facebook), Meta Ads, Google Ads, competidores, objetivos, informes mensuales y auditorías GEO.
- Si una fuente no está conectada en el proyecto, la tool devuelve vacío o un error de "sin conexión": no es un fallo tuyo. Las conexiones (OAuth de Google/Meta/etc.) se hacen SOLO desde la app.
- Escrituras: \`marketing_add_keyword\`, \`marketing_add_competitor\`, \`marketing_geo_audit_run\`, \`marketing_report_regenerate\`, \`marketing_refresh_run\`.
- **Consumen IA o APIs pagas** (confirmá antes): \`marketing_geo_audit_run\`, \`marketing_report_regenerate\`, \`marketing_refresh_run\`. Varias tienen cooldown (429).
- **Asíncronas**: las que dicen "Async" devuelven un id — consultá el estado con la tool \`*_get\`/\`*_status\` correspondiente, esperando entre consultas (no hagas polling agresivo).
- Informes: el informe mensual se arma con snapshots que se toman el día 1° de cada mes. Regenerarlo no cambia los datos históricos, rehace el análisis IA.`,

  seo: `## SEO avanzado (dentro de Marketing)
Cuatro herramientas con el mismo patrón run → list → get → delete:
- Canibalización (\`marketing_cannibal_*\`): páginas propias que compiten por la misma keyword (usa Search Console).
- Content Brief (\`marketing_content_brief_*\`): brief con IA para una keyword vs el top 10 de Google.
- On-Page Audit (\`marketing_onpage_audit_*\`): crawler de hasta 15 páginas. Async: hacé polling con \`marketing_onpage_audit_get\` mientras \`status=running\`.
- Content Gap (\`marketing_content_gap_*\`): temas que faltan vs el top 4 del SERP. Async.
Todas las \`*_run\` consumen IA/APIs pagas: confirmá antes de dispararlas.`,

  contenido: `## Contenido (requiere módulo Contenido + acceso)
Calendario de piezas de redes con aprobación del cliente.
- Estados (en orden): idea → produccion → revision → aprobacion (esperando al cliente) → cambios (el cliente pidió cambios) / aprobado → programado → publicado; archivado para descartar.
- Tipos: post, carrusel, reel, story, video, articulo, newsletter, otro. Redes: instagram, facebook, tiktok, linkedin, youtube, x, threads, pinterest, blog, email.
- \`contenido_pieces_list\` sin \`status\` excluye las publicadas.
- \`contenido_piece_comment_add\`: \`visibility: "internal"\` (default, solo el equipo) o \`"client"\` — **lo ve el cliente en su portal**. Usá "client" solo si el usuario lo pide explícitamente.
- \`contenido_request_approval\` **manda un email al cliente**. Confirmá antes.
- \`contenido_piece_send_to_dashboard\` crea la tarea en el dashboard del responsable actual de la pieza.
- No se puede por MCP: subir imágenes/videos (la subida es directa del navegador al storage), aprobar en nombre del cliente ni publicar en las redes.`,

  ventas: `## Ventas / CRM (requiere acceso a Ventas: admin o rol habilitado)
- Estructura: Empresa → Contactos; Lead (oportunidad) vinculado a una empresa, con estado, responsable, timeline (notas), próximas acciones, investigaciones IA y propuestas.
- Estados del pipeline: prospecto → contactado → reunion → propuesta → ganado / perdido (\`lostReason\` obligatorio para "perdido").
- \`ventas_lead_create\` acepta una empresa/contacto existente (id) o datos para crearlos en el momento.
- \`ventas_lead_set_owner\` notifica al nuevo responsable. \`ventas_lead_action_add\` con \`dueAt\` también crea una tarea futura para el responsable.
- \`ventas_lead_convert\` convierte el lead en un Proyecto real (lo marca ganado). Es una acción importante: confirmá antes.
- Propuestas: \`ventas_lead_proposal_create\` las redacta con IA, pero **los precios los definís vos/el usuario, la IA nunca los inventa**. Pasar una propuesta a \`confirmed\` habilita su link público para el cliente.
- **Consumen IA**: investigación (\`ventas_lead_research_run\`, async), informe de diagnóstico y propuestas (\`quality: "max"\` es más caro y lento).
- Borrar una empresa borra en cascada sus contactos y leads. Un lead con propuestas confirmadas no se puede borrar.
- No se puede por MCP: WhatsApp (conversaciones, bot, plantillas).`,
}

const LIMITS = `## Lo que hoy NO está disponible por MCP
Estos módulos existen en la app pero no tienen tools: si el usuario lo pide, explicale que tiene que hacerlo desde blisstracker.app.
- Chat interno, Notificaciones, Calendario/reuniones, Reuniones del proyecto, Briefs, Archivos (Nube del proyecto), links y accesos/credenciales de proyectos.
- Finanzas (facturación electrónica, ingresos/egresos), RRHH (vacaciones, legajos, beneficios), EOS, Gamification, WhatsApp.
- Administración: invitar o desactivar personas, roles, preferencias, módulos, facturación/plan del workspace.
- Subir archivos o imágenes de cualquier tipo (MCP solo transporta JSON).
- Conectar integraciones (Google/Meta/TikTok/LinkedIn): requieren OAuth en el navegador.

## Buenas prácticas
- Leé antes de escribir: confirmá IDs y estado actual con una tool de lectura.
- Una acción por vez y reportá el resultado real (incluido el error si lo hubo). No digas "listo" si la tool devolvió error.
- Respondé en el idioma del usuario (el equipo trabaja en español rioplatense).
- Más contexto humano sobre cada módulo: Wiki dentro de la app (menú Docs → Wiki), sección "Agentes IA (MCP)".`

function toolIndex(tools, areaKey) {
  const area = AREAS.find(a => a.key === areaKey)
  const names = tools.map(t => t.name).filter(area.match)
  return names.length ? `Tools: ${names.map(n => `\`${n}\``).join(', ')}` : ''
}

// topic: undefined/'all' → guía completa; o una key de AREAS / 'limites'.
function buildGuide(tools, topic) {
  const all = !topic || topic === 'all'
  const parts = [`# Guía de BlissTracker para agentes MCP`]
  if (all) parts.push(INSTRUCTIONS)
  for (const area of AREAS) {
    if (!all && topic !== area.key) continue
    parts.push(SECTIONS[area.key], toolIndex(tools, area.key))
  }
  if (all || topic === 'limites') parts.push(LIMITS)
  return parts.filter(Boolean).join('\n\n')
}

const GUIDE_TOPICS = ['all', ...AREAS.map(a => a.key), 'limites']

module.exports = { INSTRUCTIONS, buildGuide, GUIDE_TOPICS }
