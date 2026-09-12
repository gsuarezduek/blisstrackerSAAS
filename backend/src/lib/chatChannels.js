const prisma = require('./prisma')
const { slugify } = require('./slugify')

function channelLabel(channel) {
  if (channel.kind === 'project') return channel.project?.name || channel.slug
  return channel.name || channel.slug
}

async function uniqueSlug(workspaceId, base) {
  let slug = base
  let n = 2
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.chatChannel.findUnique({ where: { workspaceId_slug: { workspaceId, slug } } })
    if (!existing) return slug
    slug = `${base}-${n++}`
  }
}

// Crea el canal de un proyecto. La llama tanto `materializeChannels` (proyectos
// preexistentes sin canal) como `projects.service.js` `createProject()` (alta nueva),
// así un proyecto siempre tiene su canal sin duplicar la lógica en dos lugares.
async function ensureProjectChannel({ id, name, workspaceId }) {
  const slug = await uniqueSlug(workspaceId, `proyecto-${slugify(name)}`)
  return prisma.chatChannel.create({
    data: { workspaceId, kind: 'project', slug, projectId: id },
  })
}

// Canal de voz default: se siembra UNA sola vez por workspace (flag
// Workspace.voiceChannelSeededAt, mismo criterio que demoSeeded). A diferencia de
// #general, nace kind:'custom' — un admin puede renombrarlo/borrarlo como cualquier
// custom channel — así que no alcanza con chequear "¿existe un canal medium=voice?"
// en cada llamada: eso lo resucitaría apenas se borrara.
async function ensureDefaultVoiceChannel(workspaceId) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { voiceChannelSeededAt: true } })
  if (workspace?.voiceChannelSeededAt) return

  const slug = await uniqueSlug(workspaceId, 'voz')
  await prisma.chatChannel.create({ data: { workspaceId, kind: 'custom', medium: 'voice', slug, name: 'Voz' } })
  await prisma.workspace.update({ where: { id: workspaceId }, data: { voiceChannelSeededAt: new Date() } })
}

// Materialización perezosa (mismo idioma que las tareas recurrentes): asegura que
// #general exista, que todo proyecto activo tenga su canal, y que el canal de voz
// default se haya sembrado — sin cron ni backfill.
async function materializeChannels(workspaceId) {
  const general = await prisma.chatChannel.findFirst({ where: { workspaceId, kind: 'general' }, select: { id: true } })
  if (!general) {
    await prisma.chatChannel.create({ data: { workspaceId, kind: 'general', slug: 'general', name: 'General' } })
  }

  const projects = await prisma.project.findMany({
    where: { workspaceId, active: true, chatChannel: null },
    select: { id: true, name: true },
  })
  for (const project of projects) {
    await ensureProjectChannel({ ...project, workspaceId })
  }

  await ensureDefaultVoiceChannel(workspaceId)
}

module.exports = { channelLabel, uniqueSlug, ensureProjectChannel, ensureDefaultVoiceChannel, materializeChannels }
