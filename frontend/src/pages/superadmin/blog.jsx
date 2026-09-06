import { useState, useEffect, useRef } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../../components/LoadingSpinner'
import RichTextEditor from '../../components/RichTextEditor'

const API_URL = import.meta.env.VITE_API_URL

// Preview de slug en el form — el backend re-normaliza y resuelve colisiones igual.
function slugPreview(text) {
  return (text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function BlogPostForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    title:           initial?.title           ?? '',
    slug:            initial?.slug            ?? '',
    excerpt:         initial?.excerpt         ?? '',
    contentHtml:     initial?.contentHtml     ?? '',
    metaTitle:       initial?.metaTitle       ?? '',
    metaDescription: initial?.metaDescription ?? '',
    authorName:      initial?.authorName      ?? '',
    status:          initial?.status          ?? 'draft',
  })
  const [slugTouched, setSlugTouched] = useState(!!initial?.slug)
  const [imageFile,    setImageFile]    = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const fileRef = useRef()

  function handleTitleChange(value) {
    setForm(p => ({ ...p, title: value, slug: slugTouched ? p.slug : slugPreview(value) }))
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError('El título es requerido'); return }
    setSaving(true); setError('')
    try {
      const data = new FormData()
      data.append('title', form.title)
      data.append('slug', form.slug)
      data.append('excerpt', form.excerpt)
      data.append('contentHtml', form.contentHtml)
      data.append('metaTitle', form.metaTitle)
      data.append('metaDescription', form.metaDescription)
      data.append('authorName', form.authorName)
      data.append('status', form.status)
      if (imageFile) data.append('image', imageFile)
      await onSave(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar')
      setSaving(false)
    }
  }

  const existingCoverUrl = initial?.hasCoverImage ? `${API_URL}/api/public/blog-cover/${initial.id}` : null

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Título */}
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
          Título <span className="text-red-500">*</span>
        </label>
        <input type="text" value={form.title} required
          onChange={e => handleTitleChange(e.target.value)}
          placeholder="Ej: Cómo optimizar tu agencia con BlissTracker"
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Slug */}
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Slug (URL: /blog/…)</label>
        <input type="text" value={form.slug}
          onChange={e => { setSlugTouched(true); setForm(p => ({ ...p, slug: e.target.value })) }}
          placeholder={slugPreview(form.title) || 'se-genera-del-titulo'}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
        />
      </div>

      {/* Extracto */}
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Extracto</label>
        <textarea rows={2} value={form.excerpt}
          onChange={e => setForm(p => ({ ...p, excerpt: e.target.value }))}
          placeholder="Resumen corto para la card del listado y como meta description por defecto…"
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
        />
      </div>

      {/* Portada */}
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Imagen de portada</label>
        <div className="flex items-center gap-3">
          {(imagePreview || existingCoverUrl) && (
            <img src={imagePreview || existingCoverUrl} alt="" className="w-20 h-20 object-cover rounded-lg border border-gray-200 dark:border-gray-600" />
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile}
            className="text-sm text-gray-600 dark:text-gray-300"
          />
        </div>
      </div>

      {/* Contenido */}
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Contenido</label>
        <RichTextEditor
          defaultContent={form.contentHtml}
          onChange={html => setForm(p => ({ ...p, contentHtml: html }))}
          minHeight={280}
          resizable
          autoFocus={false}
        />
      </div>

      {/* SEO */}
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Meta título (SEO, opcional)</label>
          <input type="text" value={form.metaTitle}
            onChange={e => setForm(p => ({ ...p, metaTitle: e.target.value }))}
            placeholder={form.title || 'Usa el título del post si se deja vacío'}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Meta descripción (SEO, opcional)</label>
          <textarea rows={2} value={form.metaDescription}
            onChange={e => setForm(p => ({ ...p, metaDescription: e.target.value }))}
            placeholder={form.excerpt || 'Usa el extracto si se deja vacío'}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
        </div>
      </div>

      {/* Autor + estado */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Autor</label>
          <input type="text" value={form.authorName}
            onChange={e => setForm(p => ({ ...p, authorName: e.target.value }))}
            placeholder="Equipo BlissTracker"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">Estado</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={form.status === 'draft'}
                onChange={() => setForm(p => ({ ...p, status: 'draft' }))}
                className="accent-primary-600"
              />
              <span className="text-sm text-gray-800 dark:text-gray-200">Borrador</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={form.status === 'published'}
                onChange={() => setForm(p => ({ ...p, status: 'published' }))}
                className="accent-primary-600"
              />
              <span className="text-sm text-gray-800 dark:text-gray-200">Publicado</span>
            </label>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
          {saving ? 'Guardando…' : (initial ? 'Guardar cambios' : 'Crear post')}
        </button>
      </div>
    </form>
  )
}

export function BlogPostCard({ post, onTogglePublish, onEdit, onDelete }) {
  const isPublished = post.status === 'published'
  const coverUrl = post.hasCoverImage ? `${API_URL}/api/public/blog-cover/${post.id}` : null

  return (
    <div className="rounded-2xl border-2 p-5 transition-all bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <div className="flex items-start gap-3">
        {coverUrl && <img src={coverUrl} alt="" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isPublished ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
              {isPublished ? 'Publicado' : 'Borrador'}
            </span>
            {post.publishedAt && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {new Date(post.publishedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">/blog/{post.slug}</span>
          </div>
          <p className="font-semibold text-gray-900 dark:text-white">{post.title}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">{post.excerpt}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => onTogglePublish(post)}
            title={isPublished ? 'Pasar a borrador' : 'Publicar'}
            className={`p-1.5 rounded-lg transition-colors ${isPublished ? 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isPublished
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              }
            </svg>
          </button>
          <button onClick={() => onEdit(post)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
          <button onClick={() => onDelete(post)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export function SectionBlog() {
  const [posts,        setPosts]        = useState([])
  const [loading,       setLoading]      = useState(true)
  const [creating,      setCreating]     = useState(false)
  const [editing,       setEditing]      = useState(null)
  const [deleteTarget,  setDeleteTarget] = useState(null)
  const [filter,        setFilter]       = useState('all') // 'all' | 'published' | 'draft'

  useEffect(() => {
    api.get('/superadmin/blog')
      .then(r => setPosts(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const multipartHeaders = { headers: { 'Content-Type': 'multipart/form-data' } }

  async function handleCreate(formData) {
    const { data } = await api.post('/superadmin/blog', formData, multipartHeaders)
    setPosts(prev => [data, ...prev])
    setCreating(false)
  }

  async function handleEdit(formData) {
    const { data } = await api.patch(`/superadmin/blog/${editing.id}`, formData, multipartHeaders)
    setPosts(prev => prev.map(p => p.id === data.id ? data : p))
    setEditing(null)
  }

  async function handleTogglePublish(post) {
    const formData = new FormData()
    formData.append('status', post.status === 'published' ? 'draft' : 'published')
    const { data } = await api.patch(`/superadmin/blog/${post.id}`, formData, multipartHeaders)
    setPosts(prev => prev.map(p => p.id === data.id ? data : p))
  }

  async function handleDelete(post) {
    await api.delete(`/superadmin/blog/${post.id}`)
    setPosts(prev => prev.filter(p => p.id !== post.id))
    setDeleteTarget(null)
  }

  const filtered = posts.filter(p =>
    filter === 'all' ? true : filter === 'published' ? p.status === 'published' : p.status === 'draft'
  )
  const publishedCount = posts.filter(p => p.status === 'published').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Blog</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Escribí y publicá artículos en blisstracker.app/blog. Publicar no requiere deploy.
          </p>
        </div>
        <button
          onClick={() => { setCreating(true); setEditing(null) }}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Nuevo post
        </button>
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{posts.length}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Total</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{publishedCount}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Publicados</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
          <p className="text-2xl font-bold text-gray-400">{posts.length - publishedCount}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Borradores</p>
        </div>
      </div>

      {/* Formulario de creación / edición */}
      {(creating || editing) && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <p className="font-semibold text-gray-900 dark:text-white mb-4">
            {creating ? 'Nuevo post' : 'Editar post'}
          </p>
          <BlogPostForm
            initial={editing}
            onSave={creating ? handleCreate : handleEdit}
            onCancel={() => { setCreating(false); setEditing(null) }}
          />
        </div>
      )}

      {/* Filtros */}
      {posts.length > 0 && (
        <div className="flex items-center gap-2">
          {[['all', 'Todos'], ['published', 'Publicados'], ['draft', 'Borradores']].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === v
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >{l}</button>
          ))}
        </div>
      )}

      {/* Lista */}
      {loading
        ? <LoadingSpinner className="py-12" />
        : filtered.length === 0
          ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">✍️</p>
                <p className="font-medium text-gray-500 dark:text-gray-400">
                  {posts.length === 0 ? 'No hay posts creados aún.' : 'Sin resultados para este filtro.'}
                </p>
                {posts.length === 0 && (
                  <p className="text-sm mt-1">Usá "Nuevo post" para escribir el primer artículo del blog.</p>
                )}
              </div>
            )
          : (
              <div className="space-y-3">
                {filtered.map(post => (
                  <BlogPostCard
                    key={post.id}
                    post={post}
                    onTogglePublish={handleTogglePublish}
                    onEdit={p => { setEditing(p); setCreating(false) }}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            )
      }

      {/* Modal confirmación de borrado */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-200 dark:border-gray-700 p-6 text-center">
            <p className="text-lg font-semibold text-gray-900 dark:text-white mb-2">¿Eliminar post?</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              "<span className="font-medium text-gray-700 dark:text-gray-300">{deleteTarget.title}</span>" se eliminará permanentemente.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Cancelar
              </button>
              <button onClick={() => handleDelete(deleteTarget)}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
