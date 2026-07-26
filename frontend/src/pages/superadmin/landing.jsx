import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../../api/client'

const API_URL = import.meta.env.VITE_API_URL || ''
const trustedLogoUrl = (id) => `${API_URL}/api/landing/trusted-companies/${id}/image`

// ─── Hero + video ─────────────────────────────────────────────────────────────

function HeroEditor() {
  const [form,    setForm]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    api.get('/superadmin/landing/content')
      .then(r => setForm(r.data))
      .catch(() => setError('No se pudo cargar el contenido'))
      .finally(() => setLoading(false))
  }, [])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const { data } = await api.put('/superadmin/landing/content', form)
      setForm(data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!form) return <p className="text-sm text-red-500">{error}</p>

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
          Badge (arriba del título)
        </label>
        <input
          type="text"
          value={form.heroBadge}
          onChange={e => set('heroBadge', e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
            Título — línea 1
          </label>
          <input
            type="text"
            value={form.heroTitle}
            onChange={e => set('heroTitle', e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
            Título — línea 2 (coloreada)
          </label>
          <input
            type="text"
            value={form.heroTitleAccent}
            onChange={e => set('heroTitleAccent', e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
          Subtítulo
        </label>
        <textarea
          value={form.heroSubtitle}
          onChange={e => set('heroSubtitle', e.target.value)}
          rows={3}
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y leading-relaxed"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
          Video de demo — URL de embed
        </label>
        <p className="text-xs text-gray-400 mb-2">
          Tiene que ser el link de <strong>embed</strong>, no el de compartir normal. En Loom: botón Share →
          Embed → copiar la URL del <code>src</code> del iframe (algo como <code>https://www.loom.com/embed/xxxxx</code>).
          En YouTube: botón Compartir → Insertar → copiar la URL del <code>src</code> (<code>https://www.youtube.com/embed/xxxxx</code>).
          Vacío = se muestra el mockup de la app en su lugar.
        </p>
        <input
          type="text"
          value={form.demoVideoUrl ?? ''}
          onChange={e => set('demoVideoUrl', e.target.value)}
          placeholder="https://www.loom.com/embed/..."
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        {saved && <span className="text-sm text-emerald-500">✓ Guardado</span>}
      </div>
    </div>
  )
}

// ─── Empresas que confían ─────────────────────────────────────────────────────

function TrustedCompaniesEditor() {
  const [companies, setCompanies] = useState([])
  const [loading,    setLoading]   = useState(true)
  const [uploading,  setUploading] = useState(false)
  const [editId,     setEditId]    = useState(null)
  const [editName,   setEditName]  = useState('')
  const [editUrl,    setEditUrl]   = useState('')
  const [deleteId,   setDeleteId]  = useState(null)
  const fileRef = useRef()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/superadmin/landing/trusted-companies')
      setCompanies(data)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const name = window.prompt('Nombre de la empresa:')
    if (!name) return
    const websiteUrl = window.prompt('Sitio web (opcional, con https://):', '') || ''
    setUploading(true)
    try {
      const form = new FormData()
      form.append('image', file)
      form.append('name', name)
      if (websiteUrl.trim()) form.append('websiteUrl', websiteUrl.trim())
      await api.post('/superadmin/landing/trusted-companies', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      await load()
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al subir el logo')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function saveEdit(id) {
    if (!editName.trim()) return
    try {
      const { data } = await api.patch(`/superadmin/landing/trusted-companies/${id}`, {
        name: editName, websiteUrl: editUrl.trim() || null,
      })
      setCompanies(prev => prev.map(c => c.id === id ? { ...c, name: data.name, websiteUrl: data.websiteUrl } : c))
    } catch {}
    setEditId(null)
  }

  async function handleToggle(id) {
    try {
      const { data } = await api.patch(`/superadmin/landing/trusted-companies/${id}/toggle`)
      setCompanies(prev => prev.map(c => c.id === id ? { ...c, active: data.active } : c))
    } catch {}
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/superadmin/landing/trusted-companies/${id}`)
      setCompanies(prev => prev.filter(c => c.id !== id))
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al eliminar')
    } finally { setDeleteId(null) }
  }

  async function move(id, direction) {
    const idx = companies.findIndex(c => c.id === id)
    const swap = direction === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= companies.length) return
    const reordered = [...companies]
    ;[reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]]
    const items = reordered.map((c, i) => ({ id: c.id, order: i + 1 }))
    setCompanies(reordered.map((c, i) => ({ ...c, order: i + 1 })))
    api.patch('/superadmin/landing/trusted-companies/reorder', { items }).catch(() => load())
  }

  const active   = companies.filter(c => c.active)
  const inactive = companies.filter(c => !c.active)

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {active.length} activas · {inactive.length} inactivas
        </p>
        <div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            {uploading ? 'Subiendo…' : '+ Agregar empresa'}
          </button>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 text-right">PNG, JPG o WEBP · máx 2 MB</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
        {active.map((c, idx) => (
          <div key={c.id} className="flex items-center gap-4 px-5 py-3">
            <img src={trustedLogoUrl(c.id)} alt={c.name} className="w-10 h-10 rounded-lg object-contain flex-shrink-0 bg-gray-50 dark:bg-gray-700 ring-1 ring-gray-200 dark:ring-gray-600" />

            <div className="flex-1 min-w-0">
              {editId === c.id ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nombre"
                    className="text-sm border border-primary-400 rounded-lg px-2 py-1 w-full sm:w-40 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500" />
                  <input value={editUrl} onChange={e => setEditUrl(e.target.value)} placeholder="https://..."
                    className="text-sm border border-primary-400 rounded-lg px-2 py-1 w-full sm:w-56 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500" />
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(c.id)} className="text-xs text-primary-600 font-medium hover:underline">Guardar</button>
                    <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:underline">Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</span>
                  {c.websiteUrl && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{c.websiteUrl}</p>}
                </>
              )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {editId !== c.id && (
                <button onClick={() => { setEditId(c.id); setEditName(c.name); setEditUrl(c.websiteUrl ?? '') }}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-2">Editar</button>
              )}
              <button onClick={() => move(c.id, 'up')} disabled={idx === 0} title="Subir" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 text-gray-500">↑</button>
              <button onClick={() => move(c.id, 'down')} disabled={idx === active.length - 1} title="Bajar" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 text-gray-500">↓</button>
              <button onClick={() => handleToggle(c.id)} title="Desactivar" className="p-1 rounded hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-500 text-xs px-2">Ocultar</button>
              <button onClick={() => setDeleteId(c.id)} title="Eliminar" className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 text-xs px-2">Eliminar</button>
            </div>
          </div>
        ))}
        {active.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">Sin empresas activas</div>
        )}
      </div>

      {inactive.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
          {inactive.map(c => (
            <div key={c.id} className="flex items-center gap-4 px-5 py-3 opacity-50">
              <img src={trustedLogoUrl(c.id)} alt={c.name} className="w-10 h-10 rounded-lg object-contain grayscale flex-shrink-0" />
              <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{c.name}</span>
              <button onClick={() => handleToggle(c.id)} className="text-xs text-primary-600 hover:underline font-medium">Reactivar</button>
              <button onClick={() => setDeleteId(c.id)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
            </div>
          ))}
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-80 mx-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white text-center mb-1">¿Eliminar empresa?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-5">No se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 text-sm border border-gray-200 dark:border-gray-600 rounded-lg py-2 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">Cancelar</button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 font-medium">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sección completa ─────────────────────────────────────────────────────────

export function SectionLanding() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Landing</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Hero, video de demo y empresas destacadas de la landing pública (blisstracker.app). El resto
          de la landing (features, comparativa, FAQ) se edita por código.
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Hero</h2>
        <HeroEditor />
      </div>

      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Empresas que confían</h2>
        <TrustedCompaniesEditor />
      </div>
    </div>
  )
}
