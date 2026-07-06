import { useState, useEffect } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../../components/LoadingSpinner'

export const ANN_TYPES = [
  { value: 'info',        label: 'ℹ️ Información',   color: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  { value: 'feature',     label: '✨ Nueva función',  color: 'bg-primary-50 border-primary-200 dark:bg-primary-900/20 dark:border-primary-700', badge: 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300' },
  { value: 'warning',     label: '⚠️ Aviso',          color: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-700', badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  { value: 'maintenance', label: '🔧 Mantenimiento',  color: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-700',     badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
]

export function annType(value) {
  return ANN_TYPES.find(t => t.value === value) ?? ANN_TYPES[0]
}

export function AnnouncementForm({ initial, workspaces, onSave, onCancel }) {
  const [form, setForm] = useState({
    title:              initial?.title              ?? '',
    body:               initial?.body               ?? '',
    type:               initial?.type               ?? 'info',
    targetAll:          initial?.targetAll          ?? true,
    targetWorkspaceIds: initial ? (() => { try { return JSON.parse(initial.targetWorkspaceIds) } catch { return [] } })() : [],
    startsAt:           initial?.startsAt ? initial.startsAt.slice(0, 16) : '',
    endsAt:             initial?.endsAt   ? initial.endsAt.slice(0, 16)   : '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function toggleWs(id) {
    setForm(p => ({
      ...p,
      targetWorkspaceIds: p.targetWorkspaceIds.includes(id)
        ? p.targetWorkspaceIds.filter(x => x !== id)
        : [...p.targetWorkspaceIds, id],
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError('El título es requerido'); return }
    if (!form.body.trim())  { setError('El contenido es requerido'); return }
    if (!form.targetAll && form.targetWorkspaceIds.length === 0) {
      setError('Seleccioná al menos un workspace'); return
    }
    setSaving(true); setError('')
    try { await onSave(form) }
    catch (e) { setError(e.response?.data?.error || 'Error al guardar'); setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Tipo */}
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">Tipo</label>
        <div className="flex flex-wrap gap-2">
          {ANN_TYPES.map(t => (
            <button type="button" key={t.value}
              onClick={() => setForm(p => ({ ...p, type: t.value }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                form.type === t.value ? t.badge + ' border-current ring-1 ring-current' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
              }`}
            >{t.label}</button>
          ))}
        </div>
      </div>

      {/* Título */}
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
          Título <span className="text-red-500">*</span>
        </label>
        <input type="text" value={form.title} required
          onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
          placeholder="Ej: Nueva función: exportar reportes"
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Cuerpo */}
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
          Contenido <span className="text-red-500">*</span>
        </label>
        <textarea rows={4} value={form.body} required
          onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
          placeholder="Descripción del anuncio que verán los usuarios…"
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
        />
      </div>

      {/* Fechas */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Desde (opcional)</label>
          <input type="datetime-local" value={form.startsAt}
            onChange={e => setForm(p => ({ ...p, startsAt: e.target.value }))}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Hasta (opcional)</label>
          <input type="datetime-local" value={form.endsAt} min={form.startsAt}
            onChange={e => setForm(p => ({ ...p, endsAt: e.target.value }))}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Target */}
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">Destinatarios</label>
        <div className="flex gap-3 mb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={form.targetAll}
              onChange={() => setForm(p => ({ ...p, targetAll: true }))}
              className="accent-primary-600"
            />
            <span className="text-sm text-gray-800 dark:text-gray-200">Todos los workspaces</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={!form.targetAll}
              onChange={() => setForm(p => ({ ...p, targetAll: false }))}
              className="accent-primary-600"
            />
            <span className="text-sm text-gray-800 dark:text-gray-200">Workspaces específicos</span>
          </label>
        </div>
        {!form.targetAll && (
          <div className="max-h-36 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-xl p-3 space-y-1">
            {workspaces.length === 0
              ? <p className="text-xs text-gray-400">Sin workspaces disponibles</p>
              : workspaces.map(ws => (
                  <label key={ws.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 px-2 py-1 rounded-lg">
                    <input type="checkbox" checked={form.targetWorkspaceIds.includes(ws.id)}
                      onChange={() => toggleWs(ws.id)}
                      className="accent-primary-600"
                    />
                    <span className="text-sm text-gray-800 dark:text-gray-200">{ws.name}</span>
                    <span className="text-xs text-gray-400">{ws.slug}</span>
                  </label>
                ))
            }
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
          {saving ? 'Guardando…' : (initial ? 'Guardar cambios' : 'Crear anuncio')}
        </button>
      </div>
    </form>
  )
}

export function AnnouncementCard({ ann, workspaces, onToggle, onEdit, onDelete }) {
  const t = annType(ann.type)
  const wsIds = (() => { try { return JSON.parse(ann.targetWorkspaceIds) } catch { return [] } })()
  const wsNames = wsIds.map(id => workspaces.find(w => w.id === id)?.name ?? `#${id}`).join(', ')

  return (
    <div className={`rounded-2xl border-2 p-5 transition-all ${ann.active ? t.color : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-60'}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.badge}`}>{t.label}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ann.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
              {ann.active ? 'Activo' : 'Inactivo'}
            </span>
            {!ann.targetAll && <span className="text-xs text-gray-400 dark:text-gray-500">→ {wsNames || 'sin workspaces'}</span>}
            {ann.endsAt && <span className="text-xs text-gray-400 dark:text-gray-500">hasta {new Date(ann.endsAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span>}
          </div>
          <p className="font-semibold text-gray-900 dark:text-white">{ann.title}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">{ann.body}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => onToggle(ann)}
            title={ann.active ? 'Desactivar' : 'Activar'}
            className={`p-1.5 rounded-lg transition-colors ${ann.active ? 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {ann.active
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              }
            </svg>
          </button>
          <button onClick={() => onEdit(ann)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
          <button onClick={() => onDelete(ann)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export function SectionAnnouncements({ workspaces }) {
  const [announcements, setAnnouncements] = useState([])
  const [loading,       setLoading]       = useState(true)
  const [creating,      setCreating]      = useState(false)
  const [editing,       setEditing]       = useState(null)
  const [deleteTarget,  setDeleteTarget]  = useState(null)
  const [filter,        setFilter]        = useState('all')  // 'all' | 'active' | 'inactive'

  useEffect(() => {
    api.get('/superadmin/announcements')
      .then(r => setAnnouncements(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(form) {
    const { data } = await api.post('/superadmin/announcements', form)
    setAnnouncements(prev => [data, ...prev])
    setCreating(false)
  }

  async function handleEdit(form) {
    const { data } = await api.patch(`/superadmin/announcements/${editing.id}`, form)
    setAnnouncements(prev => prev.map(a => a.id === data.id ? data : a))
    setEditing(null)
  }

  async function handleToggle(ann) {
    const { data } = await api.patch(`/superadmin/announcements/${ann.id}/toggle`)
    setAnnouncements(prev => prev.map(a => a.id === data.id ? data : a))
  }

  async function handleDelete(ann) {
    await api.delete(`/superadmin/announcements/${ann.id}`)
    setAnnouncements(prev => prev.filter(a => a.id !== ann.id))
    setDeleteTarget(null)
  }

  const filtered = announcements.filter(a =>
    filter === 'all' ? true : filter === 'active' ? a.active : !a.active
  )
  const activeCount = announcements.filter(a => a.active).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Anuncios</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Publicá avisos que aparecen dentro de la app para todos los workspaces o para workspaces específicos.
          </p>
        </div>
        <button
          onClick={() => { setCreating(true); setEditing(null) }}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Nuevo anuncio
        </button>
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{announcements.length}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Total</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{activeCount}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Activos ahora</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
          <p className="text-2xl font-bold text-gray-400">{announcements.length - activeCount}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Inactivos</p>
        </div>
      </div>

      {/* Formulario de creación / edición */}
      {(creating || editing) && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <p className="font-semibold text-gray-900 dark:text-white mb-4">
            {creating ? 'Nuevo anuncio' : 'Editar anuncio'}
          </p>
          <AnnouncementForm
            initial={editing}
            workspaces={workspaces}
            onSave={creating ? handleCreate : handleEdit}
            onCancel={() => { setCreating(false); setEditing(null) }}
          />
        </div>
      )}

      {/* Filtros */}
      {announcements.length > 0 && (
        <div className="flex items-center gap-2">
          {[['all', 'Todos'], ['active', 'Activos'], ['inactive', 'Inactivos']].map(([v, l]) => (
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
                <p className="text-4xl mb-3">📢</p>
                <p className="font-medium text-gray-500 dark:text-gray-400">
                  {announcements.length === 0 ? 'No hay anuncios creados aún.' : 'Sin resultados para este filtro.'}
                </p>
                {announcements.length === 0 && (
                  <p className="text-sm mt-1">Usá "Nuevo anuncio" para comunicar novedades o mantenimientos.</p>
                )}
              </div>
            )
          : (
              <div className="space-y-3">
                {filtered.map(ann => (
                  <AnnouncementCard
                    key={ann.id}
                    ann={ann}
                    workspaces={workspaces}
                    onToggle={handleToggle}
                    onEdit={a => { setEditing(a); setCreating(false) }}
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
            <p className="text-lg font-semibold text-gray-900 dark:text-white mb-2">¿Eliminar anuncio?</p>
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

