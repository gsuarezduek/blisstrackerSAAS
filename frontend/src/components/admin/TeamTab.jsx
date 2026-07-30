import { useState, useEffect } from 'react'
import api from '../../api/client'
import UserLink from '../UserLink'
import RoleBadge from '../RoleBadge'

const emptyInvite = { email: '', memberRole: 'member', teamRole: '' }

function AdminToggle({ value, onChange }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Administrador del workspace</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">Acceso al panel de admin, reportes y gestión del equipo</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(value === 'admin' ? 'member' : 'admin')}
        className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ml-4 ${
          value === 'admin' ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
          value === 'admin' ? 'translate-x-5' : 'translate-x-0'
        }`} />
      </button>
    </div>
  )
}

export default function TeamTab() {
  const [users, setUsers]           = useState([])
  const [roles, setRoles]           = useState([])
  const [invitations, setInvitations] = useState([])
  const [inviteForm, setInviteForm] = useState(emptyInvite)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError]     = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [editId, setEditId]         = useState(null)
  const [editForm, setEditForm]     = useState({ teamRole: '', memberRole: 'member' })
  const [editError, setEditError]   = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [deactivate, setDeactivate]     = useState(null) // { user, tasks, action, reassignTo, loading, error }

  useEffect(() => {
    api.get('/workspaces/current/members').then(r => setUsers(r.data)).catch(() => {})
    api.get('/roles').then(r => setRoles(r.data)).catch(() => {})
    api.get('/workspaces/current/invitations').then(r => setInvitations(r.data)).catch(() => {})
  }, [])

  // ── Invitaciones ──────────────────────────────────────────────────────────

  async function handleInvite(e) {
    e.preventDefault()
    setInviteError('')
    setInviteSuccess('')
    setInviteLoading(true)
    try {
      await api.post('/workspaces/current/invitations', inviteForm)
      setInviteSuccess(`Invitación enviada a ${inviteForm.email}`)
      setInviteForm(emptyInvite)
      const r = await api.get('/workspaces/current/invitations')
      setInvitations(r.data)
    } catch (err) {
      setInviteError(err.response?.data?.error || 'Error al enviar la invitación')
    } finally {
      setInviteLoading(false)
    }
  }

  async function handleCancelInvitation(id) {
    await api.delete(`/workspaces/current/invitations/${id}`)
    setInvitations(prev => prev.filter(i => i.id !== id))
  }

  // ── Editar miembro ────────────────────────────────────────────────────────

  function startEdit(u) {
    setEditId(u.id)
    setEditForm({
      teamRole: u.role || '',
      memberRole: u.memberRole || 'member',
      workStartTime: u.workStartTime || '',
      workEndTime: u.workEndTime || '',
    })
    setEditError('')
  }

  function cancelEdit() {
    setEditId(null)
    setEditError('')
  }

  async function handleEditSubmit(e) {
    e.preventDefault()
    setEditError('')
    setEditLoading(true)
    try {
      const { data } = await api.put(`/workspaces/current/members/${editId}`, {
        teamRole: editForm.teamRole,
        memberRole: editForm.memberRole,
        workStartTime: editForm.workStartTime || null,
        workEndTime: editForm.workEndTime || null,
      })
      setUsers(prev => prev.map(u => u.id === editId ? data : u))
      setEditId(null)
    } catch (err) {
      setEditError(err.response?.data?.error || 'Error al guardar')
    } finally {
      setEditLoading(false)
    }
  }

  // ── Activar / desactivar ──────────────────────────────────────────────────

  async function applyToggle(userId, body) {
    const { data } = await api.patch(
      `/workspaces/current/members/${userId}/toggle-active`,
      body || {},
    )
    setUsers(prev => prev.map(x => x.id === data.id ? data : x))
  }

  async function toggleActive(u) {
    // Activar es directo
    if (!u.active) {
      await applyToggle(u.id)
      return
    }
    // Desactivar: revisar primero si tiene tareas no-completadas
    try {
      const { data } = await api.get(`/workspaces/current/members/${u.id}/pending-tasks`)
      if (!data.length) {
        await applyToggle(u.id)
        return
      }
      setDeactivate({ user: u, tasks: data, action: 'reassign', reassignTo: '', loading: false, error: '' })
    } catch (err) {
      // Si el endpoint falla, fallback al flujo original
      await applyToggle(u.id)
    }
  }

  async function confirmDeactivate() {
    if (!deactivate) return
    const { user, action, reassignTo } = deactivate
    if (action === 'reassign' && !reassignTo) {
      setDeactivate(d => ({ ...d, error: 'Elegí un miembro destinatario' }))
      return
    }
    setDeactivate(d => ({ ...d, loading: true, error: '' }))
    try {
      const body = action === 'reassign'
        ? { taskAction: 'reassign', reassignToUserId: Number(reassignTo) }
        : { taskAction: 'complete' }
      await applyToggle(user.id, body)
      setDeactivate(null)
    } catch (err) {
      setDeactivate(d => ({
        ...d,
        loading: false,
        error: err.response?.data?.error || 'Error al desactivar',
      }))
    }
  }

  function labelFor(roleName) {
    return roles.find(r => r.name === roleName)?.label ?? roleName
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Equipo</h2>
        {users.length > 0 && (
          <span className="text-sm bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2.5 py-0.5 font-medium">
            {users.filter(u => u.active).length} miembros
          </span>
        )}
      </div>

      {/* ── Invitar por email (acción principal) ─────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
          ✉️ Invitar al equipo
        </h3>
        <form onSubmit={handleInvite} className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Email</label>
            <input
              required type="email" value={inviteForm.email}
              onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))}
              placeholder="nombre@empresa.com"
              className="mt-1 w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Rol en equipo (opcional)</label>
            <select
              value={inviteForm.teamRole}
              onChange={e => setInviteForm(p => ({ ...p, teamRole: e.target.value }))}
              className="mt-1 w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Sin rol</option>
              {roles.map(r => <option key={r.id} value={r.name}>{r.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <AdminToggle
              value={inviteForm.memberRole}
              onChange={v => setInviteForm(p => ({ ...p, memberRole: v }))}
            />
          </div>
          {inviteError   && <p className="col-span-2 text-red-500 text-sm">{inviteError}</p>}
          {inviteSuccess && <p className="col-span-2 text-green-600 dark:text-green-400 text-sm">{inviteSuccess}</p>}
          <div className="col-span-2">
            <button
              type="submit" disabled={inviteLoading}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-60"
            >
              {inviteLoading ? 'Enviando...' : 'Enviar invitación'}
            </button>
          </div>
        </form>

        {/* Invitaciones pendientes */}
        {invitations.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              Pendientes de aceptar
            </p>
            <div className="space-y-2">
              {invitations.map(inv => (
                <div key={inv.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-900/40 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{inv.email}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {inv.memberRole === 'admin' ? 'Admin' : 'Miembro'}
                      {inv.teamRole ? ` · ${inv.teamRole}` : ''}
                      {' · enviada por '}{inv.invitedBy}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCancelInvitation(inv.id)}
                    className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors ml-4 flex-shrink-0"
                  >
                    Cancelar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Lista de miembros activos ─────────────────────────────────────── */}
      <div className="space-y-2">
        {users.filter(u => u.active).map(u => {
          const isEditing = editId === u.id

          return (
            <div key={u.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden">
              {/* Fila principal */}
              <div className="flex items-center justify-between px-4 py-3">
                <UserLink userId={u.id} as="div" className="rounded-lg -m-1 p-1 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">{u.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{u.email}</p>
                </UserLink>
                <div className="flex items-center gap-3">
                  {u.isAdmin && (
                    <span className="text-xs px-2 py-1 rounded-full font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400">
                      Admin
                    </span>
                  )}
                  <RoleBadge role={u.role} />
                  {u.workStartTime && (
                    <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      🕒 {u.workStartTime}{u.workEndTime ? `–${u.workEndTime}` : ''}
                    </span>
                  )}
                  <button
                    onClick={() => isEditing ? cancelEdit() : startEdit(u)}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                  >
                    {isEditing ? 'Cancelar' : 'Editar'}
                  </button>
                  <button onClick={() => toggleActive(u)} className="text-xs text-red-500 hover:text-red-700">
                    Desactivar
                  </button>
                </div>
              </div>

              {/* Formulario de edición inline */}
              {isEditing && (
                <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-4 bg-gray-50 dark:bg-gray-900/40">
                  <form onSubmit={handleEditSubmit} className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Rol en equipo</label>
                      <select
                        value={editForm.teamRole}
                        onChange={e => setEditForm(p => ({ ...p, teamRole: e.target.value }))}
                        className="mt-1 w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">Sin rol</option>
                        {roles.map(r => <option key={r.id} value={r.name}>{r.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Inicio de jornada</label>
                      <input
                        type="time"
                        value={editForm.workStartTime}
                        onChange={e => setEditForm(p => ({ ...p, workStartTime: e.target.value }))}
                        className="mt-1 w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Fin de jornada</label>
                      <input
                        type="time"
                        value={editForm.workEndTime}
                        onChange={e => setEditForm(p => ({ ...p, workEndTime: e.target.value }))}
                        className="mt-1 w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <p className="col-span-2 text-xs text-gray-400 dark:text-gray-500 -mt-1">
                      Se usa para calcular tardanzas comparando con la hora de login. Dejalo vacío si la persona no tiene horario fijo.
                    </p>
                    <div className="col-span-2">
                      <AdminToggle
                        value={editForm.memberRole}
                        onChange={v => setEditForm(p => ({ ...p, memberRole: v }))}
                      />
                    </div>
                    {editError && <p className="col-span-2 text-red-500 text-sm">{editError}</p>}
                    <div className="col-span-2">
                      <button
                        type="submit" disabled={editLoading}
                        className="w-full bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-60"
                      >
                        {editLoading ? 'Guardando...' : 'Guardar cambios'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

            </div>
          )
        })}
      </div>

      {/* ── Modal de desactivación con tareas pendientes ─────────────────── */}
      {deactivate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Desactivar a {deactivate.user.name}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Tiene {deactivate.tasks.length} {deactivate.tasks.length === 1 ? 'tarea sin completar' : 'tareas sin completar'}. Elegí qué hacer antes de desactivar.
              </p>
            </div>

            <div className="px-5 py-4 overflow-y-auto flex-1">
              <div className="space-y-2 mb-4 max-h-40 overflow-y-auto pr-1">
                {deactivate.tasks.map(t => (
                  <div key={t.id} className="text-xs bg-gray-50 dark:bg-gray-900/40 rounded px-3 py-2">
                    <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{t.description}</p>
                    <p className="text-gray-400 dark:text-gray-500 mt-0.5">
                      {t.project?.name || 'Sin proyecto'} · {t.isBacklog ? 'Backlog' : t.status}
                    </p>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio" name="task-action" value="reassign"
                    checked={deactivate.action === 'reassign'}
                    onChange={() => setDeactivate(d => ({ ...d, action: 'reassign', error: '' }))}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Reasignar a otro miembro</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Las tareas pasan a otro miembro del equipo manteniendo su estado.</p>
                    {deactivate.action === 'reassign' && (
                      <select
                        value={deactivate.reassignTo}
                        onChange={e => setDeactivate(d => ({ ...d, reassignTo: e.target.value, error: '' }))}
                        className="mt-2 w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">Elegí un miembro…</option>
                        {users.filter(x => x.active && x.id !== deactivate.user.id).map(x => (
                          <option key={x.id} value={x.id}>{x.name} ({x.email})</option>
                        ))}
                      </select>
                    )}
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio" name="task-action" value="complete"
                    checked={deactivate.action === 'complete'}
                    onChange={() => setDeactivate(d => ({ ...d, action: 'complete', error: '' }))}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Pasar a completadas</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Todas las tareas se marcan como completadas con la fecha de hoy.</p>
                  </div>
                </label>
              </div>

              {deactivate.error && (
                <p className="mt-3 text-sm text-red-500">{deactivate.error}</p>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2">
              <button
                onClick={() => setDeactivate(null)}
                disabled={deactivate.loading}
                className="text-sm px-3 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeactivate}
                disabled={deactivate.loading}
                className="text-sm px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-60"
              >
                {deactivate.loading ? 'Procesando…' : 'Desactivar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Historial de usuarios inactivos ──────────────────────────────── */}
      {users.some(u => !u.active) && (
        <div className="mt-6">
          <button
            onClick={() => setShowInactive(v => !v)}
            className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors w-full"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
              className={`w-4 h-4 transition-transform duration-200 ${showInactive ? 'rotate-180' : ''}`}>
              <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">Historial de usuarios</span>
            <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 text-xs">
              {users.filter(u => !u.active).length}
            </span>
          </button>

          {showInactive && (
            <div className="mt-3 space-y-2">
              {users.filter(u => !u.active).map(u => (
                <div key={u.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl opacity-50">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{u.name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {u.isAdmin && (
                        <span className="text-xs px-2 py-1 rounded-full font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400">
                          Admin
                        </span>
                      )}
                      <RoleBadge role={u.role} />
                      <button onClick={() => toggleActive(u)} className="text-xs text-green-500 hover:text-green-700">
                        Activar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
