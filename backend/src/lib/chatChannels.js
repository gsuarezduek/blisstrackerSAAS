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

// Materialización perezosa (mismo idioma que las tareas recurrentes): asegura que
// #general exista y que todo proyecto activo tenga su canal, sin cron ni backfill.
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
}

module.exports = { channelLabel, uniqueSlug, ensureProjectChannel, materializeChannels }
