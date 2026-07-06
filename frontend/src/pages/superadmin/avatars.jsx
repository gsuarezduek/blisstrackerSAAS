import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../../api/client'
import { avatarUrl } from '../../utils/avatarUrl'

export function SectionAvatars() {
  const [avatars,    setAvatars]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [uploading,  setUploading]  = useState(false)
  const [editId,     setEditId]     = useState(null)   // id del avatar en edición inline
  const [editLabel,  setEditLabel]  = useState('')
  const [deleteId,   setDeleteId]   = useState(null)   // id a confirmar eliminación
  const [dragOver,   setDragOver]   = useState(false)
  const [dragId,     setDragId]     = useState(null)
  const fileRef = useRef()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/superadmin/avatars')
      setAvatars(data)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Subida ────────────────────────────────────────────────────────────────

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const label = window.prompt('Nombre del avatar (ej: Bee Ninja):', file.name.replace(/\.[^.]+$/, ''))
    if (!label) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('image', file)
      form.append('label', label)
      await api.post('/superadmin/avatars', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      await load()
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al subir la imagen')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── Renombrar ─────────────────────────────────────────────────────────────

  async function saveLabel(id) {
    if (!editLabel.trim()) return
    try {
      const { data } = await api.patch(`/superadmin/avatars/${id}`, { label: editLabel })
      setAvatars(prev => prev.map(a => a.id === id ? { ...a, label: data.label } : a))
    } catch {}
    setEditId(null)
  }

  // ── Toggle activo ─────────────────────────────────────────────────────────

  async function handleToggle(id) {
    try {
      const { data } = await api.patch(`/superadmin/avatars/${id}/toggle`)
      setAvatars(prev => prev.map(a => a.id === id ? { ...a, active: data.active } : a))
    } catch {}
  }

  // ── Eliminar ──────────────────────────────────────────────────────────────

  async function handleDelete(id) {
    try {
      await api.delete(`/superadmin/avatars/${id}`)
      setAvatars(prev => prev.filter(a => a.id !== id))
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al eliminar')
    } finally { setDeleteId(null) }
  }

  // ── Drag & Drop para reordenar ────────────────────────────────────────────

  function onDragStart(id) { setDragId(id) }

  function onDrop(targetId) {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOver(false); return }
    const from = avatars.findIndex(a => a.id === dragId)
    const to   = avatars.findIndex(a => a.id === targetId)
    if (from === -1 || to === -1) return

    const reordered = [...avatars]
    const [moved]   = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    const items = reordered.map((a, i) => ({ id: a.id, order: i + 1 }))
    setAvatars(reordered.map((a, i) => ({ ...a, order: i + 1 })))
    api.patch('/superadmin/avatars/reorder', { items }).catch(() => load())
    setDragId(null)
    setDragOver(false)
  }

  // ── Mover con flechas ─────────────────────────────────────────────────────

  async function move(id, direction) {
    const idx = avatars.findIndex(a => a.id === id)
    const swap = direction === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= avatars.length) return
    const reordered = [...avatars]
    ;[reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]]
    const items = reordered.map((a, i) => ({ id: a.id, order: i + 1 }))
    setAvatars(reordered.map((a, i) => ({ ...a, order: i + 1 })))
    api.patch('/superadmin/avatars/reorder', { items }).catch(() => load())
  }

  const active   = avatars.filter(a => a.active)
  const inactive = avatars.filter(a => !a.active)
  const inUse    = avatars.filter(a => (a.usageCount ?? 0) > 0).length

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>

  return (
    <div className="space-y-6">
      {/* Header + subir */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Fotos de perfil</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {active.length} activas · {inactive.length} inactivas · {avatars.length} total · {inUse} en uso
          </p>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleUpload}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            {uploading ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Subiendo...</>
            ) : (
              <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03L9.25 4.636v8.614z" />
                <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
              </svg>Subir imagen</>
            )}
          </button>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 text-right">PNG, JPG, WEBP o GIF · máx 2 MB</p>
        </div>
      </div>

      {/* Avatares activos */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Activas ({active.length})</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Arrastrá para reordenar, o usá las flechas</p>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {active.map((av, idx) => (
            <div
              key={av.id}
              draggable
              onDragStart={() => onDragStart(av.id)}
              onDragOver={e => { e.preventDefault(); setDragOver(av.id) }}
              onDrop={() => onDrop(av.id)}
              onDragLeave={() => setDragOver(false)}
              className={`flex items-center gap-4 px-5 py-3 transition-colors cursor-grab active:cursor-grabbing ${
                dragOver === av.id ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
              }`}
            >
              {/* Imagen */}
              <img
                src={avatarUrl(av.filename)}
                alt={av.label}
                className="w-12 h-12 rounded-full object-cover flex-shrink-0 ring-1 ring-gray-200 dark:ring-gray-600"
              />

              {/* Nombre editable */}
              <div className="flex-1 min-w-0">
                {editId === av.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveLabel(av.id); if (e.key === 'Escape') setEditId(null) }}
                      autoFocus
                      className="text-sm border border-primary-400 rounded-lg px-2 py-1 w-40 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <button onClick={() => saveLabel(av.id)} className="text-xs text-primary-600 font-medium hover:underline">Guardar</button>
                    <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:underline">Cancelar</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{av.label}</span>
                    <button
                      onClick={() => { setEditId(av.id); setEditLabel(av.label) }}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0"
                      title="Renombrar"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M13.488 2.513a1.75 1.75 0 00-2.475 0L6.75 6.774a2.75 2.75 0 00-.596.892l-.848 2.047a.75.75 0 00.98.98l2.047-.848a2.75 2.75 0 00.892-.596l4.261-4.263a1.75 1.75 0 000-2.474z" />
                        <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9a.75.75 0 011.5 0v2.25A2.75 2.75 0 0110.25 14h-6.5A2.75 2.75 0 011 11.25v-6.5A2.75 2.75 0 013.75 2H6a.75.75 0 010 1.5H3.75z" />
                      </svg>
                    </button>
                  </div>
                )}
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{av.filename}</p>
              </div>

              {/* Usuarios que lo usan ahora */}
              <span
                title={`${av.usageCount ?? 0} usuario${(av.usageCount ?? 0) !== 1 ? 's' : ''} usa${(av.usageCount ?? 0) !== 1 ? 'n' : ''} este avatar`}
                className={`flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 flex-shrink-0 ${
                  (av.usageCount ?? 0) > 0
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                  <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                </svg>
                {av.usageCount ?? 0}
              </span>

              {/* Orden + acciones */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => move(av.id, 'up')} disabled={idx === 0} title="Subir" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-gray-500">
                    <path fillRule="evenodd" d="M8 14a.75.75 0 01-.75-.75V4.56L4.03 7.78a.75.75 0 01-1.06-1.06l4.5-4.5a.75.75 0 011.06 0l4.5 4.5a.75.75 0 01-1.06 1.06L8.75 4.56v8.69A.75.75 0 018 14z" clipRule="evenodd" />
                  </svg>
                </button>
                <button onClick={() => move(av.id, 'down')} disabled={idx === active.length - 1} title="Bajar" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-gray-500">
                    <path fillRule="evenodd" d="M8 2a.75.75 0 01.75.75v8.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V2.75A.75.75 0 018 2z" clipRule="evenodd" />
                  </svg>
                </button>
                <button onClick={() => handleToggle(av.id)} title="Desactivar" className="p-1 rounded hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-500 transition-colors ml-1">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                    <path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
                    <path fillRule="evenodd" d="M1.38 8a6.5 6.5 0 1113.24 0A6.5 6.5 0 011.38 8zM8 3a5 5 0 100 10A5 5 0 008 3z" clipRule="evenodd" />
                  </svg>
                </button>
                <button onClick={() => setDeleteId(av.id)} title="Eliminar" className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.815 8.15A1.5 1.5 0 005.357 15h5.285a1.5 1.5 0 001.493-1.35l.815-8.15h.3a.75.75 0 000-1.5H11v-.75A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25zm2.25-.75a.75.75 0 00-.75.75V4h3v-.75a.75.75 0 00-.75-.75h-1.5zM6.05 6a.75.75 0 01.787.713l.275 5.5a.75.75 0 01-1.498.075l-.275-5.5A.75.75 0 016.05 6zm3.9 0a.75.75 0 01.712.787l-.275 5.5a.75.75 0 01-1.498-.075l.275-5.5a.75.75 0 01.786-.711z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
          {active.length === 0 && (
            <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">Sin avatares activos</div>
          )}
        </div>
      </div>

      {/* Avatares inactivos */}
      {inactive.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">Inactivas ({inactive.length})</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {inactive.map(av => (
              <div key={av.id} className="flex items-center gap-4 px-5 py-3 opacity-50">
                <img src={avatarUrl(av.filename)} alt={av.label} className="w-10 h-10 rounded-full object-cover flex-shrink-0 grayscale" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{av.label}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{av.filename}</p>
                </div>
                {(av.usageCount ?? 0) > 0 && (
                  <span
                    title={`${av.usageCount} usuario${av.usageCount !== 1 ? 's' : ''} todavía usa${av.usageCount !== 1 ? 'n' : ''} este avatar`}
                    className="flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 flex-shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                      <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                    </svg>
                    {av.usageCount}
                  </span>
                )}
                <button onClick={() => handleToggle(av.id)} className="text-xs text-primary-600 hover:underline font-medium">Reactivar</button>
                <button onClick={() => setDeleteId(av.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.815 8.15A1.5 1.5 0 005.357 15h5.285a1.5 1.5 0 001.493-1.35l.815-8.15h.3a.75.75 0 000-1.5H11v-.75A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25zm2.25-.75a.75.75 0 00-.75.75V4h3v-.75a.75.75 0 00-.75-.75h-1.5zM6.05 6a.75.75 0 01.787.713l.275 5.5a.75.75 0 01-1.498.075l-.275-5.5A.75.75 0 016.05 6zm3.9 0a.75.75 0 01.712.787l-.275 5.5a.75.75 0 01-1.498-.075l.275-5.5a.75.75 0 01.786-.711z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de confirmación de eliminación */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-80 mx-4">
            {(() => {
              const av = avatars.find(a => a.id === deleteId)
              return (
                <>
                  <div className="flex justify-center mb-4">
                    <img src={avatarUrl(av?.filename)} alt={av?.label} className="w-16 h-16 rounded-full object-cover" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white text-center mb-1">¿Eliminar avatar?</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-5">
                    <strong>{av?.label}</strong> será eliminado permanentemente. No se puede deshacer.
                  </p>
                  <div className="flex gap-3">
                    <button onClick={() => setDeleteId(null)} className="flex-1 text-sm border border-gray-200 dark:border-gray-600 rounded-lg py-2 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200">Cancelar</button>
                    <button onClick={() => handleDelete(deleteId)} className="flex-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 font-medium transition-colors">Eliminar</button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Section: Billing ────────────────────────────────────────────────────────

