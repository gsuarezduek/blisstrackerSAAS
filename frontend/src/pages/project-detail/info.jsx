import ProjectInfoTab from '../../components/ProjectInfoTab'
import ClientPortalConfig from '../../components/ClientPortalConfig'
import ProjectAccesos from '../../components/ProjectAccesos'
import UserLink from '../../components/UserLink'
import { avatarUrl } from '../../utils/avatarUrl'
import RoleBadge from '../../components/RoleBadge'

export default function InfoTab({
  data, setData, encodedId, authUser,
  linkForm, setLinkForm, linkSaving, onAddLink, onDeleteLink,
  editingServices, setEditingServices, servicesDraft, setServicesDraft, allServices, servicesSaving,
  onOpenServicesEdit, onSaveServices, onOpenTeamEdit,
}) {
  return (
    <div className="space-y-4">

      {/* Links + Accesos */}
      {data.project.linksEnabled !== false && (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Links</p>
              {!linkForm && (
                <button
                  onClick={() => setLinkForm({ label: '', url: '' })}
                  className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
                >
                  + Agregar
                </button>
              )}
            </div>

            {(data.project.links ?? []).length === 0 && !linkForm && (
              <p className="text-sm text-gray-400 dark:text-gray-500">Sin links por el momento.</p>
            )}

            {(data.project.links ?? []).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {data.project.links.map(link => (
                  <div key={link.id} className="flex items-center gap-1 group">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/40 border border-primary-100 dark:border-primary-800 rounded-lg px-3 py-1.5 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
                        <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                        <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                      </svg>
                      {link.label}
                    </a>
                    <button
                      onClick={() => onDeleteLink(link.id)}
                      className="opacity-0 group-hover:opacity-100 ml-0.5 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-all rounded-full hover:bg-red-50 dark:hover:bg-red-900/20"
                      title="Eliminar link"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {linkForm && (
              <div className="mt-2 flex flex-wrap gap-2 items-end">
                <input
                  type="text"
                  placeholder="Nombre"
                  value={linkForm.label}
                  onChange={e => setLinkForm(p => ({ ...p, label: e.target.value }))}
                  className="flex-1 min-w-[120px] text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
                <input
                  type="url"
                  placeholder="https://..."
                  value={linkForm.url}
                  onChange={e => setLinkForm(p => ({ ...p, url: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && onAddLink()}
                  className="flex-[2] min-w-[180px] text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
                <button
                  onClick={onAddLink}
                  disabled={linkSaving || !linkForm.label.trim() || !linkForm.url.trim()}
                  className="text-sm px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                >
                  {linkSaving ? '...' : 'Guardar'}
                </button>
                <button
                  onClick={() => setLinkForm(null)}
                  className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>

          <ProjectAccesos projectId={encodedId} />
        </>
      )}

      {/* Servicios */}
      {(data.project.services?.length > 0 || authUser?.isAdmin) && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Servicios</p>
            {authUser?.isAdmin && !editingServices && (
              <button
                onClick={onOpenServicesEdit}
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
              >
                ✏️ Editar
              </button>
            )}
          </div>

          {editingServices && allServices ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {allServices.filter(s => s.active).map(s => (
                  <label key={s.id} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={servicesDraft.includes(s.id)}
                      onChange={() => setServicesDraft(prev =>
                        prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
                      )}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{s.name}</span>
                  </label>
                ))}
                {allServices.filter(s => s.active).length === 0 && (
                  <p className="text-sm text-gray-400 dark:text-gray-500">No hay servicios creados todavía.</p>
                )}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={onSaveServices}
                  disabled={servicesSaving}
                  className="text-sm px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                >
                  {servicesSaving ? 'Guardando...' : 'Guardar'}
                </button>
                <button
                  onClick={() => setEditingServices(false)}
                  className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (data.project.services?.length ?? 0) > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {data.project.services.map(ps => (
                <span key={ps.service.id} className="text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 border border-primary-100 dark:border-primary-800 rounded-full px-2.5 py-0.5 font-medium">
                  {ps.service.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">Sin servicios asignados todavía.</p>
          )}
        </div>
      )}

      {/* Cliente — portal externo (informes + briefs + datos en vivo) */}
      <ClientPortalConfig
        projectId={data.project.id}
        canEdit={authUser?.isAdmin || (data.project.members ?? []).some(pm => pm.user.id === authUser?.id)}
      />

      {/* Equipo */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
            Equipo{(data.project.members?.length ?? 0) > 0 ? ` · ${data.project.members.length} persona${data.project.members.length !== 1 ? 's' : ''}` : ''}
          </p>
          {authUser?.isAdmin && (
            <button
              onClick={onOpenTeamEdit}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
            >
              ✏️ Editar equipo
            </button>
          )}
        </div>
        {(data.project.members?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Sin personas en el equipo.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {data.project.members.map(pm => (
              <UserLink
                key={pm.user.id}
                userId={pm.user.id}
                as="div"
                className="group relative aspect-square rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 hover:ring-2 hover:ring-primary-400 dark:hover:ring-primary-500 transition-all"
              >
                <img
                  src={avatarUrl(pm.user.avatar)}
                  alt={pm.user.name}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
                  <p className="text-white font-semibold text-sm leading-tight truncate drop-shadow">{pm.user.name}</p>
                  <div className="mt-1">
                    <RoleBadge role={pm.user.role} userId={pm.user.id} />
                  </div>
                </div>
              </UserLink>
            ))}
          </div>
        )}
      </div>

      {/* Info del proyecto */}
      <ProjectInfoTab project={data.project} onSave={updated => setData(prev => ({ ...prev, project: { ...prev.project, ...updated } }))} />
    </div>
  )
}

export function TeamModal({
  data, allUsers, teamQuery, setTeamQuery, syncTeam, teamSaving, onClose,
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b dark:border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Equipo del proyecto</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-xs">{data.project.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors ml-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5 overflow-y-auto">

          {/* Buscador */}
          <div className="relative">
            <input
              autoFocus
              value={teamQuery}
              onChange={e => setTeamQuery(e.target.value)}
              placeholder="Buscar persona por nombre..."
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 pr-9"
            />
            {teamQuery && (
              <button onClick={() => setTeamQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                  <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                </svg>
              </button>
            )}
            {teamQuery && (() => {
              const currentIds = new Set(data.project.members.map(pm => pm.user.id))
              const suggestions = allUsers.filter(u =>
                !currentIds.has(u.id) && u.name.toLowerCase().includes(teamQuery.toLowerCase())
              )
              return (
                <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                  {suggestions.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                      {allUsers.filter(u => !currentIds.has(u.id)).length === 0
                        ? 'Todos los usuarios ya están en este proyecto'
                        : 'No se encontraron resultados'}
                    </p>
                  ) : suggestions.map(u => (
                    <div key={u.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 border-b dark:border-gray-600 last:border-b-0 transition-colors">
                      <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{u.name}</p>
                        <RoleBadge role={u.teamRole || u.role} userId={u.id} className="inline-block mt-0.5" />
                      </div>
                      <button
                        onClick={() => {
                          syncTeam([...data.project.members.map(pm => pm.user), u])
                          setTeamQuery('')
                        }}
                        disabled={teamSaving}
                        className="text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0 ml-3"
                      >
                        + Agregar
                      </button>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>

          {/* Miembros actuales */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              En el proyecto · {data.project.members.length} persona{data.project.members.length !== 1 ? 's' : ''}
            </p>
            {data.project.members.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4 border border-dashed border-gray-200 dark:border-gray-600 rounded-xl">
                Sin equipo asignado todavía
              </p>
            ) : (
              <div className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
                {data.project.members.map(pm => (
                  <div key={pm.user.id} className="flex items-center justify-between px-4 py-2.5 border-b dark:border-gray-600 last:border-b-0">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{pm.user.name}</p>
                      <RoleBadge role={pm.user.teamRole || pm.user.role} userId={pm.user.id} className="inline-block mt-0.5" />
                    </div>
                    <button
                      onClick={() => syncTeam(data.project.members.filter(m => m.user.id !== pm.user.id).map(m => m.user))}
                      disabled={teamSaving}
                      title="Quitar del proyecto"
                      className="text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors disabled:opacity-50 ml-3 flex-shrink-0"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t dark:border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl py-2.5 text-sm transition-colors"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}
