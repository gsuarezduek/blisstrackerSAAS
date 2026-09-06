/**
 * Seed data al crear un workspace nuevo.
 *
 * Dos piezas independientes:
 *  - `seedDefaults` — catálogo base (1 Service "Marketing Digital" + 1 UserRole
 *    "PROJECT_MANAGER"). Sin huella visible en el Dashboard, así que se crea SIEMPRE
 *    al registrarse, elija lo que elija el admin en el wizard de onboarding.
 *  - `seedWorkspace` — proyecto "Demo — Aprendé BlissTracker" con 8 tareas en
 *    distintos estados. Esto SÍ es visible (ocupa el Dashboard), por eso es 100%
 *    opt-in: solo corre si el admin lo pide explícitamente desde el wizard de
 *    onboarding (fase "demo") o más tarde desde Preferencias. Antes ambas piezas
 *    vivían juntas y corrían siempre — se separaron para no perder el catálogo base
 *    al volver opcional el proyecto demo.
 *
 * Idempotentes: `seedDefaults` no duplica el Service/UserRole si ya existen;
 * `seedWorkspace` no hace nada si `Workspace.demoSeeded === true`.
 *
 * El usuario puede eliminar el proyecto demo en cualquier momento (Preferencias →
 * "Eliminar proyecto demo") — al hacerlo se cascadean las tareas y se mantiene el
 * flag `demoSeeded = true` para no recrearlo automáticamente.
 */
const prisma = require('../lib/prisma')

function daysAgo(d) {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000)
}

function todayString() {
  // YYYY-MM-DD en Buenos Aires (UTC-3)
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * Catálogo base de un workspace nuevo (Service + UserRole por defecto). Se llama
 * desde el registro, siempre — independiente de si el admin termina cargando el
 * proyecto demo o no.
 */
async function seedDefaults(workspaceId, tx = prisma) {
  const existingService = await tx.service.findFirst({
    where: { workspaceId, name: 'Marketing Digital' },
    select: { id: true },
  })
  if (!existingService) {
    await tx.service.create({ data: { workspaceId, name: 'Marketing Digital', active: true } })
  }

  await tx.userRole.upsert({
    where:  { workspaceId_name: { workspaceId, name: 'PROJECT_MANAGER' } },
    create: { workspaceId, name: 'PROJECT_MANAGER', label: 'Project Manager' },
    update: {},
  }).catch(() => {}) // si no existe el unique compuesto, ignorar
}

async function seedWorkspace(workspaceId, ownerId, tx = prisma) {
  const ws = await tx.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, demoSeeded: true },
  })
  if (!ws || ws.demoSeeded) return null

  // El owner puede ya tener una tarea IN_PROGRESS en OTRO workspace — la constraint
  // `one_active_task_per_user` es global (una sola tarea activa por persona, no por
  // workspace, ver CLAUDE.md). Si le metemos igual una tarea demo IN_PROGRESS, la
  // creación viola esa constraint (P2002) y rompe todo el seed. Caso típico: una
  // cuenta ya existente que crea un workspace adicional.
  const hasActiveTaskElsewhere = !!(await tx.task.findFirst({
    where: { userId: ownerId, status: 'IN_PROGRESS' },
    select: { id: true },
  }))

  // Service "Marketing Digital" — normalmente ya lo creó `seedDefaults` al registrar
  // el workspace; se re-crea acá solo como fallback si por lo que sea no está más
  // (ej. lo borraron a mano desde Admin antes de tocar "Cargar proyecto de ejemplo").
  let service = await tx.service.findFirst({ where: { workspaceId, name: 'Marketing Digital' } })
  if (!service) {
    service = await tx.service.create({ data: { workspaceId, name: 'Marketing Digital', active: true } })
  }

  // WorkDay del día (necesario para las tareas)
  const workDay = await tx.workDay.upsert({
    where:  { userId_workspaceId_date: { userId: ownerId, workspaceId, date: todayString() } },
    create: { userId: ownerId, workspaceId, date: todayString() },
    update: {},
  })

  // Proyecto demo
  const project = await tx.project.create({
    data: {
      workspaceId,
      name: 'Demo — Aprendé BlissTracker',
      active: true,
      services: { create: [{ serviceId: service.id }] },
      members:  { create: [{ userId: ownerId }] },
    },
  })

  // 8 tareas variadas — mezcla genérica de agencia (no asume qué módulos tiene activos
  // el workspace: esto corre a pedido desde el wizard de onboarding, en la misma fase
  // donde todavía no se eligieron los módulos). Se deja 1 sabor marketing/ads como
  // ejemplo de color, sin apoyarse en jerga de un módulo específico (GEO/Search
  // Console/etc.) que puede no tener activado.
  const tasksData = [
    {
      description: 'Revisar el avance del mes de Cliente Demo y preparar 3 puntos para la próxima reunión de status.',
      // PENDING en vez de IN_PROGRESS si el owner ya tiene una tarea activa en otro
      // workspace (ver constraint `one_active_task_per_user` más arriba).
      status:      hasActiveTaskElsewhere ? 'PENDING' : 'IN_PROGRESS',
      starred:     2,                  // amarillo — importante
      startedAt:   hasActiveTaskElsewhere ? undefined : new Date(Date.now() - 30 * 60 * 1000), // hace 30 min
    },
    {
      description: 'Preparar informe mensual para Cliente Demo. Generar PDF + URL pública con dashboard. Incluir comparativa vs mes anterior y 3 next steps.',
      status:      'PENDING',
      starred:     3,                  // rojo — crítica
    },
    {
      description: 'Revisar el sitio/entregable de Cliente Demo con el equipo y armar una lista de mejoras priorizadas.',
      status:      'PENDING',
      starred:     2,
    },
    {
      description: 'Optimizar campaña Meta Ads de Producto X. CPC subió 23% en la última semana. Probar 2 creativos nuevos y ajustar audiencias.',
      status:        'BLOCKED',
      blockedReason: 'Esperando aprobación del cliente.',
    },
    {
      description:   'Coordinar entrega de copys para nueva landing. Pendiente recibir copy del equipo de contenido. Deadline viernes.',
      status:        'PAUSED',
      pausedMinutes: 45,
      pausedAt:      new Date(Date.now() - 45 * 60 * 1000),
    },
    {
      description:     'Onboarding de Cliente Y: cargar datos de acceso, sumar al equipo del proyecto y agendar kickoff.',
      status:          'COMPLETED',
      startedAt:       daysAgo(2),
      completedAt:     daysAgo(2),
      minutesOverride: 35,
    },
    {
      description:     'Documentar el proceso de aprobación de entregables con el equipo y compartirlo en el standup del lunes.',
      status:          'COMPLETED',
      startedAt:       daysAgo(3),
      completedAt:     daysAgo(3),
      minutesOverride: 60,
    },
    {
      description:     'Reunión semanal con Cliente Demo (notas). Status, próximos hitos, riesgos. Subir notas al proyecto.',
      status:          'COMPLETED',
      startedAt:       daysAgo(1),
      completedAt:     daysAgo(1),
      minutesOverride: 45,
    },
  ]

  for (const t of tasksData) {
    await tx.task.create({
      data: {
        workDayId:       workDay.id,
        projectId:       project.id,
        userId:          ownerId,
        createdById:     ownerId,
        description:     t.description,
        status:          t.status,
        starred:         t.starred         ?? 0,
        startedAt:       t.startedAt       ?? null,
        pausedAt:        t.pausedAt        ?? null,
        completedAt:     t.completedAt     ?? null,
        blockedReason:   t.blockedReason   ?? null,
        pausedMinutes:   t.pausedMinutes   ?? 0,
        minutesOverride: t.minutesOverride ?? null,
      },
    })
  }

  // Marcar workspace como demo-seeded
  await tx.workspace.update({
    where: { id: workspaceId },
    data:  { demoSeeded: true },
  })

  return { projectId: project.id, taskCount: tasksData.length }
}

/**
 * Borra el proyecto demo (y sus tareas) de un workspace. Mantiene el flag demoSeeded en true
 * para no recrear automáticamente.
 */
async function removeDemoProject(workspaceId) {
  const project = await prisma.project.findFirst({
    where: { workspaceId, name: 'Demo — Aprendé BlissTracker' },
    select: { id: true },
  })
  if (!project) return { removed: 0 }

  // Notification no tiene cascade sobre Task — borrarlas antes para evitar el FK
  // constraint (mismo patrón que tasks.controller.js remove()).
  await prisma.notification.deleteMany({ where: { task: { projectId: project.id } } })
  await prisma.task.deleteMany({ where: { projectId: project.id } })
  // ProjectMember/ProjectService tienen FK RESTRICT hacia Project — sin esto,
  // project.delete() falla siempre porque el seed siempre crea al menos una fila
  // de cada uno.
  await prisma.projectMember.deleteMany({ where: { projectId: project.id } })
  await prisma.projectService.deleteMany({ where: { projectId: project.id } })
  await prisma.project.delete({ where: { id: project.id } })

  return { removed: 1, projectId: project.id }
}

module.exports = { seedDefaults, seedWorkspace, removeDemoProject }
