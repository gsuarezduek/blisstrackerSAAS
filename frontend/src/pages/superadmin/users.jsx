import { useState, useEffect } from 'react'
import api from '../../api/client'
import ConfirmModal from '../../components/ConfirmModal'
import { avatarUrl } from '../../utils/avatarUrl'
import { timeAgo } from './shared'
import { useAuth } from '../../context/AuthContext'

export const ROLE_BADGE = {
  owner:  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  admin:  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  member: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

export function SectionUsers() {
  const { user: me } = useAuth()
  const [users,    setUsers]    = useState([])
  const [total,    setTotal]    = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState('all')
  const [busyId,   setBusyId]   = useState(null)
  const [userToToggle,      setUserToToggle]      = useState(null) // user | null
  const [userToToggleSuper, setUserToToggleSuper]  = useState(null) // user | null
  const PAGE = 50

  async function load(reset = true) {
    setLoading(true)
    try {
      const offset = reset ? 0 : users.length
      const params = new URLSearchParams({ limit: PAGE, offset, status: filter })
      if (search.trim()) params.set('search', search.trim())
      const { data } = await api.get(`/superadmin/users?${params}`)
      setUsers(reset ? data.users : prev => [...prev, ...data.users])
      setTotal(data.total)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    const t = setTimeout(() => load(true), 250)
    return () => clearTimeout(t)
  }, [search, filter])

  async function handleToggleDailyInsight(user) {
    const desired = user.dailyInsightStatus !== 'on'
    const verb    = desired ? 'activar' : 'desactivar'
    const wsCount = user.totalMemberships
    const msg = desired
      ? `Activar insight diario para ${user.email} en ${wsCount} workspace(s)?`
      : `Desactivar insight diario (e insight memory + task quality) para ${user.email} en ${wsCount} workspace(s)?`
    if (!window.confirm(msg)) return

    setBusyId(`di-${user.id}`)
    try {
      await api.patch(`/superadmin/users/${user.id}/toggle-daily-insight`, { enabled: desired })
      setUsers(prev => prev.map(u => u.id === user.id
        ? {
            ...u,
            dailyInsightStatus: desired ? 'on' : 'off',
            workspaces: u.workspaces.map(w => ({ ...w, dailyInsightEnabled: desired })),
          }
        : u
      ))
    } catch (err) {
      window.alert(`Error al ${verb} insight diario: ${err.response?.data?.error || err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  async function handleToggleActive() {
    if (!userToToggle) return
    const user = userToToggle
    const desired = user.activeMemberships === 0
    const verb = desired ? 'reactivar' : 'desactivar'

    setBusyId(user.id)
    try {
      const { data } = await api.patch(`/superadmin/users/${user.id}/toggle-active`, { active: desired })
      setUsers(prev => prev.map(u => u.id === user.id
        ? {
            ...u,
            activeMemberships: desired ? u.totalMemberships : 0,
            workspaces: u.workspaces.map(w => ({ ...w, active: desired })),
          }
        : u
      ))
      if (data.affectedMemberships === 0 && desired) {
        window.alert('El usuario no tiene memberships para reactivar.')
      }
    } catch (err) {
      window.alert(`Error al ${verb}: ${err.response?.data?.error || err.message}`)
    } finally {
      setBusyId(null)
      setUserToToggle(null)
    }
  }

  async function handleToggleSuperAdmin() {
    if (!userToToggleSuper) return
    const user = userToToggleSuper
    const desired = !user.isSuperAdmin

    setBusyId(`super-${user.id}`)
    try {
      await api.patch(`/superadmin/users/${user.id}/toggle-superadmin`, { isSuperAdmin: desired })
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isSuperAdmin: desired } : u))
    } catch (err) {
      window.alert(`Error: ${err.response?.data?.error || err.message}`)
    } finally {
      setBusyId(null)
      setUserToToggleSuper(null)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-900 dark:text-white">Usuarios</h2>
          <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5">{total}</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por email o nombre…"
            className="text-xs border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg px-3 py-1.5 w-64 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <div className="flex gap-1">
            {[
              { id: 'all',      label: 'Todos' },
              { id: 'active',   label: 'Activos' },
              { id: 'inactive', label: 'Desactivados' },
              { id: 'orphan',   label: 'Sin workspace' },
            ].map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                  filter === f.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && users.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>
      ) : users.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm">
          {search ? `Sin resultados para "${search}"` : 'No hay usuarios para los filtros aplicados.'}
        </div>
      ) : (
        <>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {users.map(u => {
              const isDisabled = u.totalMemberships > 0 && u.activeMemberships === 0
              const isOrphan   = u.totalMemberships === 0
              return (
                <div key={u.id} className="px-5 py-4 flex items-start gap-3">
                  <img
                    src={avatarUrl(u.avatar)}
                    alt=""
                    className={`w-10 h-10 rounded-full object-cover flex-shrink-0 mt-0.5 ${isDisabled ? 'opacity-50 grayscale' : ''}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{u.name}</span>
                      {u.isSuperAdmin && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                          SUPER
                        </span>
                      )}
                      {isDisabled && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          Desactivado
                        </span>
                      )}
                      {isOrphan && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                          Sin workspace
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</p>

                    {u.workspaces.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {u.workspaces.map(w => (
                          <span key={w.id}
                            title={`${w.name} · ${w.role}${w.active ? '' : ' (inactiva)'}`}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                              w.active
                                ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                : 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 line-through'
                            }`}>
                            <span className="font-medium">{w.name}</span>
                            <span className={`text-[10px] font-semibold uppercase tracking-wider px-1 rounded ${ROLE_BADGE[w.role] || ROLE_BADGE.member}`}>
                              {w.role}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500">
                      <span>Alta {timeAgo(u.createdAt)}</span>
                      <span>·</span>
                      <span>
                        {u.lastLoginAt
                          ? `Último login ${timeAgo(u.lastLoginAt)}`
                          : 'Nunca ingresó'}
                      </span>
                      {u.totalMemberships > 0 && (
                        <>
                          <span>·</span>
                          <span>{u.activeMemberships}/{u.totalMemberships} activas</span>
                          <span>·</span>
                          <span
                            title={
                              u.dailyInsightStatus === 'on'    ? 'Insight diario activado en todos los workspaces' :
                              u.dailyInsightStatus === 'off'   ? 'Insight diario desactivado en todos los workspaces' :
                              u.dailyInsightStatus === 'mixed' ? 'Insight diario mixto entre workspaces' :
                                                                  'Sin workspaces'
                            }
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ${
                              u.dailyInsightStatus === 'on'    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                              u.dailyInsightStatus === 'off'   ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' :
                              u.dailyInsightStatus === 'mixed' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                                                                  'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                            }`}>
                            🧠 Insight {u.dailyInsightStatus === 'on' ? 'ON' : u.dailyInsightStatus === 'off' ? 'OFF' : u.dailyInsightStatus === 'mixed' ? 'mixto' : '—'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex-shrink-0 flex flex-col gap-1.5 items-stretch">
                    {!u.isSuperAdmin && u.totalMemberships > 0 && (
                      <>
                        <button
                          onClick={() => handleToggleDailyInsight(u)}
                          disabled={busyId === `di-${u.id}`}
                          title={u.dailyInsightStatus === 'on' ? 'Desactivar insight diario' : 'Activar insight diario'}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                            u.dailyInsightStatus === 'on'
                              ? 'bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200'
                              : 'bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900/30 dark:hover:bg-green-900/50 dark:text-green-300'
                          }`}>
                          {busyId === `di-${u.id}` ? '…' : u.dailyInsightStatus === 'on' ? 'IA: Desactivar' : 'IA: Activar'}
                        </button>
                        <button
                          onClick={() => setUserToToggle(u)}
                          disabled={busyId === u.id}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                            isDisabled
                              ? 'bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900/30 dark:hover:bg-green-900/50 dark:text-green-300'
                              : 'bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-300'
                          }`}>
                          {busyId === u.id ? '…' : isDisabled ? 'Reactivar' : 'Desactivar'}
                        </button>
                      </>
                    )}
                    {u.id === me?.id ? (
                      u.isSuperAdmin && (
                        <span
                          title="No podés quitarte a vos mismo el acceso de Super Admin"
                          className="text-[10px] text-gray-400 dark:text-gray-500 text-center px-2 py-1"
                        >
                          Super Admin (vos)
                        </span>
                      )
                    ) : (
                      <button
                        onClick={() => setUserToToggleSuper(u)}
                        disabled={busyId === `super-${u.id}`}
                        title={u.isSuperAdmin ? 'Quitar acceso de Super Admin' : 'Otorgar acceso de Super Admin'}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                          u.isSuperAdmin
                            ? 'bg-amber-100 hover:bg-amber-200 text-amber-700 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-300'
                            : 'bg-primary-100 hover:bg-primary-200 text-primary-700 dark:bg-primary-900/30 dark:hover:bg-primary-900/50 dark:text-primary-300'
                        }`}>
                        {busyId === `super-${u.id}` ? '…' : u.isSuperAdmin ? 'Quitar SuperAdmin' : 'Hacer SuperAdmin'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {users.length < total && (
            <div className="p-4 text-center border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => load(false)} disabled={loading}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50">
                {loading ? 'Cargando...' : `Cargar más (${total - users.length} restantes)`}
              </button>
            </div>
          )}
        </>
      )}

      <ConfirmModal
        open={!!userToToggle}
        title={userToToggle?.activeMemberships === 0 ? 'Reactivar usuario' : 'Desactivar usuario'}
        message={userToToggle?.activeMemberships === 0
          ? `Reactivar a ${userToToggle?.email} en todos sus workspaces (${userToToggle?.totalMemberships}).`
          : `Desactivar a ${userToToggle?.email} en TODOS sus workspaces. No podrá ingresar a ninguno hasta reactivarlo.`}
        confirmLabel={userToToggle?.activeMemberships === 0 ? 'Reactivar' : 'Desactivar'}
        danger={userToToggle?.activeMemberships !== 0}
        loading={busyId === userToToggle?.id}
        onConfirm={handleToggleActive}
        onCancel={() => setUserToToggle(null)}
      />

      <ConfirmModal
        open={!!userToToggleSuper}
        title={userToToggleSuper?.isSuperAdmin ? 'Quitar Super Admin' : 'Otorgar Super Admin'}
        message={userToToggleSuper?.isSuperAdmin
          ? `${userToToggleSuper?.email} va a perder el acceso al panel /superadmin.`
          : `${userToToggleSuper?.email} va a poder acceder al panel /superadmin con acceso completo a todos los workspaces, facturación, tokens y datos de la plataforma.`}
        confirmLabel={userToToggleSuper?.isSuperAdmin ? 'Quitar acceso' : 'Otorgar acceso'}
        danger
        loading={busyId === `super-${userToToggleSuper?.id}`}
        onConfirm={handleToggleSuperAdmin}
        onCancel={() => setUserToToggleSuper(null)}
      />
    </div>
  )
}

// ─── Section: Settings (global platform config) ──────────────────────────────

