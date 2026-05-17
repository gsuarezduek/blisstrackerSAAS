/**
 * Seed data al crear un workspace nuevo.
 *
 * Crea un proyecto "Demo — Aprendé BlissTracker" con 8 tareas en distintos estados,
 * 1 Service y 1 UserRole. Le da al usuario nuevo algo visible y explorable en el
 * primer login en vez del Dashboard vacío.
 *
 * Llamado desde workspace.controller.js justo después de crear el workspace + owner.
 * Idempotente: si `Workspace.demoSeeded === true` no hace nada.
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

async function seedWorkspace(workspaceId, ownerId, tx = prisma) {
  const ws = await tx.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, demoSeeded: true },
  })
  if (!ws || ws.demoSeeded) return null

  // 1. Service por defecto
  const service = await tx.service.create({
    data: { workspaceId, name: 'Marketing Digital', active: true },
  })

  // 2. UserRole por defecto (idempotente — workspace ya puede tener algunos)
  await tx.userRole.upsert({
    where:  { workspaceId_name: { workspaceId, name: 'PROJECT_MANAGER' } },
    create: { workspaceId, name: 'PROJECT_MANAGER', label: 'Project Manager' },
    update: {},
  }).catch(() => {}) // si no existe el unique compuesto, ignorar

  // 3. WorkDay del día (necesario para las tareas)
  const workDay = await tx.workDay.upsert({
    where:  { userId_workspaceId_date: { userId: ownerId, workspaceId, date: todayString() } },
    create: { userId: ownerId, workspaceId, date: todayString() },
    update: {},
  })

  // 4. Proyecto demo
  const project = await tx.project.create({
    data: {
      workspaceId,
      name: 'Demo — Aprendé BlissTracker',
      active: true,
      services: { create: [{ serviceId: service.id }] },
      members:  { create: [{ userId: ownerId }] },
    },
  })

  // 5. 8 tareas variadas
  const tasksData = [
    {
      description: 'Analizar tráfico orgánico de Cliente Demo del último mes en GA4 + Search Console. Identificar 3 oportunidades de keywords con alto volumen y baja competencia.',
      status:      'IN_PROGRESS',
      starred:     2,                  // amarillo — importante
      startedAt:   new Date(Date.now() - 30 * 60 * 1000), // hace 30 min
    },
    {
      description: 'Preparar informe mensual para Cliente Demo. Generar PDF + URL pública con dashboard. Incluir comparativa vs mes anterior y 3 next steps.',
      status:      'PENDING',
      starred:     3,                  // rojo — crítica
    },
    {
      description: 'Auditoría GEO del sitio de Cliente Demo. Correr GEO Audit desde Marketing → GEO. Revisar score y citation readiness. Crear tareas de fix.',
      status:      'PENDING',
      starred:     2,
    },
    {
      description: 'Optimizar campaña Meta Ads de Producto X. CPC subió 23% en la última semana. Probar 2 creativos nuevos y ajustar audiencias.',
      status:        'BLOCKED',
      blockedReason: 'Esperando aprobación de creativos por parte del cliente.',
    },
    {
      description:   'Coordinar entrega de copys para nueva landing. Pendiente recibir copy del equipo de contenido. Deadline viernes.',
      status:        'PAUSED',
      pausedMinutes: 45,
      pausedAt:      new Date(Date.now() - 45 * 60 * 1000),
    },
    {
      description:     'Setup inicial de Search Console para Cliente Y. Conectar dominio + verificar propiedad. Subir sitemap.xml.',
      status:          'COMPLETED',
      startedAt:       daysAgo(2),
      completedAt:     daysAgo(2),
      minutesOverride: 35,
    },
    {
      description:     'Definir naming convention de campañas Ads del Q. Documentar en Notion + comunicar al equipo en standup del lunes.',
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

  // 6. Marcar workspace como demo-seeded
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

  await prisma.task.deleteMany({ where: { projectId: project.id } })
  await prisma.project.delete({ where: { id: project.id } })

  return { removed: 1, projectId: project.id }
}

module.exports = { seedWorkspace, removeDemoProject }
