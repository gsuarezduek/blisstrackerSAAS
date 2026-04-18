/**
 * Script de migración de datos desde el proyecto individual (team.blissmkt.ar)
 * al nuevo proyecto SaaS (blissmkt.blisstracker.app).
 *
 * Uso:
 *   OLD_DATABASE_URL="postgresql://..." node prisma/migrate-from-v1.js
 *
 * El NEW_DATABASE_URL se lee del .env del proyecto (DATABASE_URL).
 */

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const OLD_URL = process.env.OLD_DATABASE_URL
const NEW_URL = process.env.DATABASE_URL

if (!OLD_URL) { console.error('❌ Falta OLD_DATABASE_URL'); process.exit(1) }
if (!NEW_URL) { console.error('❌ Falta DATABASE_URL'); process.exit(1) }

const oldDb = new PrismaClient({ datasources: { db: { url: OLD_URL } } })
const newDb = new PrismaClient({ datasources: { db: { url: NEW_URL } } })

const WORKSPACE_NAME = 'Bliss Marketing'
const WORKSPACE_SLUG = 'blissmkt'
const WORKSPACE_TZ   = 'America/Argentina/Buenos_Aires'

// Helpers
const q   = (db, sql, ...p) => db.$queryRawUnsafe(sql, ...p)
const run = (db, sql, ...p) => db.$executeRawUnsafe(sql, ...p)

// Procesa filas en transacciones de N en N para evitar timeout de conexión.
// fn(row) debe retornar un promise de $executeRawUnsafe.
async function batchRun(label, rows, fn, chunkSize = 100) {
  if (!rows.length) { console.log(`   ✓ 0 ${label}`); return }
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    await newDb.$transaction(chunk.map(row => fn(row)))
    process.stdout.write('.')
  }
  console.log(` ✓ ${rows.length} ${label}`)
}

async function resetSeq(table, col = 'id') {
  try {
    await run(newDb,
      `SELECT setval('"${table}_${col}_seq"', COALESCE((SELECT MAX("${col}") FROM "${table}"), 1))`
    )
  } catch { /* tabla sin sequence */ }
}

async function main() {
  console.log('🚀 Iniciando migración de datos...\n')

  // ── 1. Workspace ──────────────────────────────────────────────────────────────
  console.log('→ Creando workspace blissmkt...')
  const [ws] = await q(newDb, `
    INSERT INTO "Workspace" (name, slug, timezone, status, "createdAt", "updatedAt")
    VALUES ($1, $2, $3, 'active', NOW(), NOW())
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `, WORKSPACE_NAME, WORKSPACE_SLUG, WORKSPACE_TZ)
  const workspaceId = Number(ws.id)

  await run(newDb, `
    INSERT INTO "Subscription" ("workspaceId", status, "planName", "createdAt", "updatedAt")
    VALUES ($1, 'active', 'pro', NOW(), NOW())
    ON CONFLICT ("workspaceId") DO NOTHING
  `, workspaceId)
  console.log(`   ✓ workspace id = ${workspaceId}\n`)

  // ── 2. Users + WorkspaceMembers ───────────────────────────────────────────────
  console.log('→ Migrando usuarios...')
  const users = await q(oldDb, `SELECT * FROM "User"`)
  for (const u of users) {
    await run(newDb, `
      INSERT INTO "User" (
        id, name, email, password, avatar, "isSuperAdmin",
        phone, birthday, address, dni, cuit, alias, "bankName",
        "maritalStatus", children, "educationLevel", "educationTitle",
        "bloodType", "medicalConditions", "healthInsurance", "emergencyContact",
        "createdAt", "updatedAt"
      )
      VALUES ($1,$2,$3,$4,$5,false,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      ON CONFLICT (id) DO UPDATE SET
        phone            = EXCLUDED.phone,
        birthday         = EXCLUDED.birthday,
        address          = EXCLUDED.address,
        dni              = EXCLUDED.dni,
        cuit             = EXCLUDED.cuit,
        alias            = EXCLUDED.alias,
        "bankName"       = EXCLUDED."bankName",
        "maritalStatus"  = EXCLUDED."maritalStatus",
        children         = EXCLUDED.children,
        "educationLevel" = EXCLUDED."educationLevel",
        "educationTitle" = EXCLUDED."educationTitle",
        "bloodType"      = EXCLUDED."bloodType",
        "medicalConditions" = EXCLUDED."medicalConditions",
        "healthInsurance"   = EXCLUDED."healthInsurance",
        "emergencyContact"  = EXCLUDED."emergencyContact"
    `, Number(u.id), u.name, u.email, u.password, u.avatar ?? null,
       // legajo
       u.phone ?? null, u.birthday ?? null, u.address ?? null,
       u.dni ?? null, u.cuit ?? null, u.alias ?? null, u.bankName ?? null,
       u.maritalStatus ?? null, u.children ?? null,
       u.educationLevel ?? null, u.educationTitle ?? null,
       u.bloodType ?? null, u.medicalConditions ?? null,
       u.healthInsurance ?? null, u.emergencyContact ?? null,
       u.createdAt, u.updatedAt ?? u.createdAt)

    await run(newDb, `
      INSERT INTO "WorkspaceMember" (
        "workspaceId", "userId", role, "teamRole", active, "vacationDays",
        "weeklyEmailEnabled", "dailyInsightEnabled", "insightMemoryEnabled",
        "taskQualityEnabled", "joinedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT ("workspaceId", "userId") DO NOTHING
    `, workspaceId, Number(u.id),
       u.isAdmin ? 'admin' : 'member',
       u.role ?? '',
       u.active ?? true,
       u.vacationDays ?? 0,
       u.weeklyEmailEnabled ?? true,
       u.dailyInsightEnabled ?? true,
       u.insightMemoryEnabled ?? true,
       u.taskQualityEnabled ?? true,
       u.createdAt)
  }
  await resetSeq('User')
  console.log(`   ✓ ${users.length} usuarios\n`)

  // ── 3. UserRoles ──────────────────────────────────────────────────────────────
  console.log('→ Migrando roles...')
  const roles = await q(oldDb, `SELECT * FROM "UserRole"`)
  for (const r of roles) {
    await run(newDb, `
      INSERT INTO "UserRole" (id, name, label, "workspaceId")
      VALUES ($1,$2,$3,$4)
      ON CONFLICT DO NOTHING
    `, Number(r.id), r.name, r.label, workspaceId)
  }
  await resetSeq('UserRole')
  console.log(`   ✓ ${roles.length} roles\n`)

  // ── 4. RoleExpectations ───────────────────────────────────────────────────────
  console.log('→ Migrando expectativas de rol...')
  const expectations = await q(oldDb, `SELECT * FROM "RoleExpectation"`)
  for (const e of expectations) {
    await run(newDb, `
      INSERT INTO "RoleExpectation" (
        id, "roleName", description, "recurrentTasks", dependencies,
        "expectedResults", "operationalResponsibilities", "workspaceId", "createdAt", "updatedAt"
      ) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10)
      ON CONFLICT DO NOTHING
    `, Number(e.id), e.roleName, e.description ?? '',
       JSON.stringify(e.recurrentTasks ?? []),
       JSON.stringify(e.dependencies ?? []),
       JSON.stringify(e.expectedResults ?? []),
       JSON.stringify(e.operationalResponsibilities ?? []),
       workspaceId, e.createdAt, e.updatedAt ?? e.createdAt)
  }
  await resetSeq('RoleExpectation')
  console.log(`   ✓ ${expectations.length} expectativas\n`)

  // ── 5. Services ───────────────────────────────────────────────────────────────
  console.log('→ Migrando servicios...')
  const services = await q(oldDb, `SELECT * FROM "Service"`)
  for (const s of services) {
    await run(newDb, `
      INSERT INTO "Service" (id, name, active, "workspaceId", "createdAt", "updatedAt")
      VALUES ($1,$2,true,$3,$4,$5)
      ON CONFLICT DO NOTHING
    `, Number(s.id), s.name, workspaceId, s.createdAt, s.updatedAt ?? s.createdAt)
  }
  await resetSeq('Service')
  console.log(`   ✓ ${services.length} servicios\n`)

  // ── 6. Projects ───────────────────────────────────────────────────────────────
  console.log('→ Migrando proyectos...')
  const projects = await q(oldDb, `SELECT * FROM "Project"`)
  for (const p of projects) {
    await run(newDb, `
      INSERT INTO "Project" (id, name, active, situation, "emailFrom", "workspaceId", "createdAt", "updatedAt")
      VALUES ($1,$2,true,$3,$4,$5,$6,$7)
      ON CONFLICT (id) DO NOTHING
    `, Number(p.id), p.name,
       p.situation ?? null, p.emailFrom ?? null,
       workspaceId, p.createdAt, p.updatedAt ?? p.createdAt)
  }
  await resetSeq('Project')
  console.log(`   ✓ ${projects.length} proyectos\n`)

  // ── 7. ProjectMembers ─────────────────────────────────────────────────────────
  console.log('→ Migrando miembros de proyectos...')
  const pms = await q(oldDb, `SELECT * FROM "ProjectMember"`)
  for (const pm of pms) {
    await run(newDb, `
      INSERT INTO "ProjectMember" ("projectId", "userId")
      VALUES ($1,$2)
      ON CONFLICT DO NOTHING
    `, Number(pm.projectId), Number(pm.userId))
  }
  console.log(`   ✓ ${pms.length} miembros de proyectos\n`)

  // ── 8. ProjectLinks ───────────────────────────────────────────────────────────
  console.log('→ Migrando links de proyectos...')
  const links = await q(oldDb, `SELECT * FROM "ProjectLink"`)
  for (const l of links) {
    await run(newDb, `
      INSERT INTO "ProjectLink" (id, "projectId", label, url, "createdAt")
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT DO NOTHING
    `, Number(l.id), Number(l.projectId), l.label, l.url, l.createdAt)
  }
  await resetSeq('ProjectLink')
  console.log(`   ✓ ${links.length} links\n`)

  // ── 9. ProjectSettings ────────────────────────────────────────────────────────
  console.log('→ Migrando configuración de proyectos...')
  try {
    const settings = await q(oldDb, `SELECT * FROM "ProjectSettings"`)
    for (const s of settings) {
      await run(newDb, `
        INSERT INTO "ProjectSettings" (id, "projectId", "showCompletedDays", "createdAt", "updatedAt")
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT DO NOTHING
      `, Number(s.id), Number(s.projectId),
         s.showCompletedDays ?? 7, s.createdAt, s.updatedAt ?? s.createdAt)
    }
    await resetSeq('ProjectSettings')
    console.log(`   ✓ ${settings.length} configuraciones\n`)
  } catch { console.log('   (sin datos en ProjectSettings)\n') }

  // ── 10. Project ↔ Service (join table) ───────────────────────────────────────
  console.log('→ Migrando servicios de proyectos...')
  try {
    const ps = await q(oldDb, `SELECT * FROM "ProjectService"`)
    for (const s of ps) {
      await run(newDb, `INSERT INTO "ProjectService" ("projectId","serviceId") VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        Number(s.projectId), Number(s.serviceId))
    }
    console.log(`   ✓ ${ps.length} relaciones proyecto-servicio\n`)
  } catch {
    // Intentar con tabla implícita de Prisma
    try {
      const ps = await q(oldDb, `SELECT * FROM "_ProjectServices"`)
      for (const s of ps) {
        await run(newDb, `INSERT INTO "ProjectService" ("projectId","serviceId") VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          Number(s.A), Number(s.B))
      }
      console.log(`   ✓ relaciones proyecto-servicio migradas\n`)
    } catch { console.log('   (sin relaciones proyecto-servicio)\n') }
  }

  // ── 11. WorkDays ──────────────────────────────────────────────────────────────
  console.log('→ Migrando días de trabajo...')
  const workdays = await q(oldDb, `SELECT * FROM "WorkDay"`)
  await batchRun('días de trabajo', workdays, wd =>
    run(newDb, `
      INSERT INTO "WorkDay" (id, "userId", "workspaceId", date, "startedAt", "endedAt", "createdAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING
    `, Number(wd.id), Number(wd.userId), workspaceId,
       wd.date, wd.startedAt ?? null, wd.endedAt ?? null, wd.createdAt)
  )
  await resetSeq('WorkDay')

  // ── 12. Tasks ─────────────────────────────────────────────────────────────────
  console.log('\n→ Migrando tareas...')
  const tasks = await q(oldDb, `SELECT * FROM "Task"`)
  await batchRun('tareas', tasks, t =>
    run(newDb, `
      INSERT INTO "Task" (
        id, "workDayId", "userId", "projectId", "createdById",
        description, status, starred, "isBacklog",
        "startedAt", "pausedAt", "completedAt",
        "pausedMinutes", "minutesOverride",
        "blockedReason", "createdAt", "updatedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::"TaskStatus",$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      ON CONFLICT (id) DO NOTHING
    `, Number(t.id), Number(t.workDayId), Number(t.userId),
       Number(t.projectId), t.createdById ? Number(t.createdById) : null,
       t.description, t.status, t.starred ?? 0, t.isBacklog ?? false,
       t.startedAt ?? null, t.pausedAt ?? null, t.completedAt ?? null,
       t.pausedMinutes ?? 0, t.minutesOverride ?? null,
       t.blockedReason ?? null, t.createdAt, t.updatedAt ?? t.createdAt)
  )
  await resetSeq('Task')

  // ── 13. TaskSessions ──────────────────────────────────────────────────────────
  console.log('\n→ Migrando sesiones de tareas...')
  try {
    const sessions = await q(oldDb, `SELECT * FROM "TaskSession"`)
    await batchRun('sesiones', sessions, s =>
      run(newDb, `
        INSERT INTO "TaskSession" (id, "taskId", "startedAt", "endedAt")
        VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING
      `, Number(s.id), Number(s.taskId), s.startedAt, s.endedAt ?? null)
    )
    await resetSeq('TaskSession')
  } catch { console.log('   (sin sesiones de tareas)') }

  // ── 14. TaskComments ──────────────────────────────────────────────────────────
  console.log('\n→ Migrando comentarios...')
  const comments = await q(oldDb, `SELECT * FROM "TaskComment"`)
  await batchRun('comentarios', comments, c =>
    run(newDb, `
      INSERT INTO "TaskComment" (id, "taskId", "userId", content, "parentId", "createdAt")
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING
    `, Number(c.id), Number(c.taskId), Number(c.userId),
       c.content, c.parentId ? Number(c.parentId) : null, c.createdAt)
  )
  await resetSeq('TaskComment')

  // ── 15. DailyInsights ─────────────────────────────────────────────────────────
  console.log('\n→ Migrando insights diarios...')
  const insights = await q(oldDb, `SELECT * FROM "DailyInsight"`)
  await batchRun('insights', insights, i =>
    run(newDb, `
      INSERT INTO "DailyInsight" (
        id, "userId", "workspaceId", date, titulo, mensaje, sugerencia,
        "alertaRol", "alertaGTD", tono, feedback, "createdAt", "updatedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING
    `, Number(i.id), Number(i.userId), workspaceId, i.date,
       i.titulo ?? '', i.mensaje ?? '', i.sugerencia ?? null,
       i.alertaRol ?? null, i.alertaGTD ?? null, i.tono ?? 'neutral',
       i.feedback ?? null, i.createdAt, i.updatedAt ?? i.createdAt)
  )
  await resetSeq('DailyInsight')

  // ── 16. UserInsightMemories ───────────────────────────────────────────────────
  console.log('\n→ Migrando memorias de insight...')
  const memories = await q(oldDb, `SELECT * FROM "UserInsightMemory"`)
  await batchRun('memorias', memories, m =>
    run(newDb, `
      INSERT INTO "UserInsightMemory" (
        id, "userId", "workspaceId", tendencias, fortalezas,
        "areasDeAtencion", estadisticas, "weekStart", "updatedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) ON CONFLICT DO NOTHING
    `, Number(m.id), Number(m.userId), workspaceId,
       m.tendencias ?? '', m.fortalezas ?? '', m.areasDeAtencion ?? '',
       JSON.stringify(m.estadisticas ?? {}), m.weekStart, m.updatedAt)
  )
  await resetSeq('UserInsightMemory')

  // ── 17. Notifications ─────────────────────────────────────────────────────────
  console.log('\n→ Migrando notificaciones...')
  const notifs = (await q(oldDb, `SELECT * FROM "Notification"`))
    .filter(n => n.projectId && (n.triggeredById || n.actorId))
  await batchRun('notificaciones', notifs, n =>
    run(newDb, `
      INSERT INTO "Notification" (
        id, "userId", "actorId", "workspaceId", type, message, read,
        "taskId", "projectId", "createdAt"
      ) VALUES ($1,$2,$3,$4,$5::"NotificationType",$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING
    `, Number(n.id), Number(n.userId),
       Number(n.triggeredById ?? n.actorId), workspaceId,
       n.type, n.message, n.read ?? false,
       n.taskId ? Number(n.taskId) : null,
       Number(n.projectId), n.createdAt)
  )
  await resetSeq('Notification')

  // ── 18. UserLogins ────────────────────────────────────────────────────────────
  console.log('\n→ Migrando historial de logins...')
  const logins = await q(oldDb, `SELECT * FROM "UserLogin"`)
  await batchRun('logins', logins, l =>
    run(newDb, `
      INSERT INTO "UserLogin" (id, "userId", "workspaceId", "loginAt", method)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING
    `, Number(l.id), Number(l.userId), workspaceId, l.loginAt, l.method ?? 'email')
  )
  await resetSeq('UserLogin')

  // ── 19. AiTokenLogs ───────────────────────────────────────────────────────────
  console.log('\n→ Migrando logs de tokens IA...')
  const tokenLogs = await q(oldDb, `SELECT * FROM "AiTokenLog"`)
  await batchRun('token logs', tokenLogs, t =>
    run(newDb, `
      INSERT INTO "AiTokenLog" (id, service, "userId", "workspaceId", "inputTokens", "outputTokens", "createdAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING
    `, Number(t.id), t.service,
       t.userId ? Number(t.userId) : null, workspaceId,
       t.inputTokens ?? 0, t.outputTokens ?? 0, t.createdAt)
  )
  await resetSeq('AiTokenLog')

  // ── 20. Feedback ──────────────────────────────────────────────────────────────
  console.log('\n→ Migrando feedback...')
  const feedbacks = await q(oldDb, `SELECT * FROM "Feedback"`)
  await batchRun('feedbacks', feedbacks, f =>
    run(newDb, `
      INSERT INTO "Feedback" (id, "userId", "workspaceId", type, message, read, "createdAt")
      VALUES ($1,$2,$3,$4::"FeedbackType",$5,$6,$7) ON CONFLICT DO NOTHING
    `, Number(f.id), Number(f.userId), workspaceId,
       f.type, f.message, f.read ?? false, f.createdAt)
  )
  await resetSeq('Feedback')
  console.log()

  console.log('✅ Migración completada exitosamente.')
}

main()
  .catch(err => {
    console.error('\n❌ Error durante la migración:', err.message)
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await oldDb.$disconnect()
    await newDb.$disconnect()
  })
