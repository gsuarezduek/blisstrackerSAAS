const prisma = require('../lib/prisma')
const { validateImageUpload } = require('../lib/imageType')
const { slugify } = require('../lib/slugify')
const { handlePrismaError } = require('../lib/prismaError')

const PUBLIC_LIST_FIELDS = {
  id: true, slug: true, title: true, excerpt: true,
  coverImageMimeType: true, publishedAt: true, authorName: true,
}

function stripCover(post) {
  const { coverImageData, coverImageMimeType, ...rest } = post
  return { ...rest, hasCoverImage: !!coverImageMimeType }
}

// Resuelve colisiones de slug con sufijo incremental (-2, -3, ...).
// excludeId permite reutilizar el mismo slug al editar el propio post.
async function uniqueSlug(base, excludeId = null) {
  let slug = base
  let n = 2
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.blogPost.findUnique({ where: { slug }, select: { id: true } })
    if (!existing || existing.id === excludeId) return slug
    slug = `${base}-${n}`
    n += 1
  }
}

// ─── Público (sin auth) ────────────────────────────────────────────────────

async function list(req, res, next) {
  try {
    const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 9, 30)
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1)
    const where = { status: 'published' }

    const [posts, total] = await Promise.all([
      prisma.blogPost.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: PUBLIC_LIST_FIELDS,
      }),
      prisma.blogPost.count({ where }),
    ])

    res.json({ posts: posts.map(stripCover), total, page, pageSize })
  } catch (err) { next(err) }
}

async function getBySlug(req, res, next) {
  try {
    const post = await prisma.blogPost.findFirst({
      where: { slug: req.params.slug, status: 'published' },
      select: {
        id: true, slug: true, title: true, excerpt: true, contentHtml: true,
        coverImageMimeType: true, publishedAt: true, metaTitle: true,
        metaDescription: true, authorName: true,
      },
    })
    if (!post) return res.status(404).json({ error: 'Post no encontrado' })

    res.json({
      ...stripCover(post),
      metaTitle: post.metaTitle || post.title,
      metaDescription: post.metaDescription || post.excerpt,
    })
  } catch (err) { next(err) }
}

// Metadata liviana para el OG dinámico (frontend/api/blog-og.js)
async function getMeta(req, res, next) {
  try {
    const post = await prisma.blogPost.findFirst({
      where: { slug: req.params.slug, status: 'published' },
      select: { id: true, title: true, excerpt: true, metaTitle: true, metaDescription: true, coverImageMimeType: true },
    })
    if (!post) return res.status(404).json({ error: 'Post no encontrado' })

    res.set('Cache-Control', 'public, max-age=300')
    res.json({
      id: post.id,
      title: post.metaTitle || post.title,
      description: post.metaDescription || post.excerpt,
      hasCoverImage: !!post.coverImageMimeType,
    })
  } catch (err) { next(err) }
}

async function serveCover(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10)
    if (!Number.isInteger(id)) return res.status(404).end()

    const post = await prisma.blogPost.findUnique({
      where: { id },
      select: { coverImageData: true, coverImageMimeType: true },
    })
    if (!post?.coverImageData) return res.status(404).end()

    res.set('Content-Type', post.coverImageMimeType)
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Cache-Control', 'public, max-age=86400') // 24h
    res.send(Buffer.from(post.coverImageData))
  } catch { res.status(500).end() }
}

// ─── SuperAdmin (protegido por superAdminOnly en superadmin.routes.js) ─────

async function listAll(req, res, next) {
  try {
    const posts = await prisma.blogPost.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, slug: true, title: true, excerpt: true, contentHtml: true,
        coverImageMimeType: true, status: true, publishedAt: true,
        metaTitle: true, metaDescription: true, authorName: true,
        createdAt: true, updatedAt: true,
      },
    })
    res.json(posts.map(stripCover))
  } catch (err) { next(err) }
}

async function create(req, res, next) {
  try {
    const { title, excerpt, contentHtml, metaTitle, metaDescription, authorName, status, slug: slugInput } = req.body
    if (!title?.trim()) return res.status(400).json({ error: 'El título es requerido' })

    let coverImageData, coverImageMimeType
    if (req.file) {
      const check = validateImageUpload(req.file.buffer, ['image/png', 'image/jpeg', 'image/webp'])
      if (!check.ok) return res.status(400).json({ error: check.error })
      coverImageData = req.file.buffer
      coverImageMimeType = check.mimeType
    }

    const baseSlug = slugify(slugInput?.trim() || title) || 'post'
    const slug = await uniqueSlug(baseSlug)
    const isPublished = status === 'published'

    const post = await prisma.blogPost.create({
      data: {
        slug,
        title: title.trim(),
        excerpt: excerpt?.trim() || '',
        contentHtml: contentHtml || '',
        status: isPublished ? 'published' : 'draft',
        publishedAt: isPublished ? new Date() : null,
        metaTitle: metaTitle?.trim() || null,
        metaDescription: metaDescription?.trim() || null,
        authorName: authorName?.trim() || undefined, // sin valor → usa el default del schema
        ...(coverImageData ? { coverImageData, coverImageMimeType } : {}),
      },
    })
    res.status(201).json(stripCover(post))
  } catch (err) {
    if (handlePrismaError(err, res)) return
    next(err)
  }
}

async function update(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10)
    const existing = await prisma.blogPost.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Post no encontrado' })

    const { title, excerpt, contentHtml, metaTitle, metaDescription, authorName, status, slug: slugInput } = req.body
    const data = {}

    if (title !== undefined) {
      if (!title.trim()) return res.status(400).json({ error: 'El título es requerido' })
      data.title = title.trim()
    }
    if (excerpt !== undefined) data.excerpt = excerpt.trim()
    if (contentHtml !== undefined) data.contentHtml = contentHtml
    if (metaTitle !== undefined) data.metaTitle = metaTitle.trim() || null
    if (metaDescription !== undefined) data.metaDescription = metaDescription.trim() || null
    if (authorName !== undefined) data.authorName = authorName.trim() || 'Equipo BlissTracker'

    if (slugInput !== undefined && slugInput.trim()) {
      const normalized = slugify(slugInput)
      if (normalized !== existing.slug) data.slug = await uniqueSlug(normalized, id)
    }

    if (status !== undefined) {
      const isPublished = status === 'published'
      data.status = isPublished ? 'published' : 'draft'
      // Preserva la fecha de publicación original: solo se fija la primera vez.
      if (isPublished && !existing.publishedAt) data.publishedAt = new Date()
    }

    if (req.file) {
      const check = validateImageUpload(req.file.buffer, ['image/png', 'image/jpeg', 'image/webp'])
      if (!check.ok) return res.status(400).json({ error: check.error })
      data.coverImageData = req.file.buffer
      data.coverImageMimeType = check.mimeType
    }

    const post = await prisma.blogPost.update({ where: { id }, data })
    res.json(stripCover(post))
  } catch (err) {
    if (handlePrismaError(err, res)) return
    next(err)
  }
}

async function remove(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10)
    await prisma.blogPost.delete({ where: { id } })
    res.status(204).end()
  } catch (err) {
    if (handlePrismaError(err, res)) return
    next(err)
  }
}

module.exports = { list, getBySlug, getMeta, serveCover, listAll, create, update, remove }
