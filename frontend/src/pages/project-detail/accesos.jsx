import ProjectAccesos from '../../components/ProjectAccesos'

// Pestaña "Links y accesos" — lo que el equipo abre a diario para trabajar en la
// cuenta: links del cliente (drive, sitio, tableros) y credenciales cifradas.
export default function AccesosTab({ data, encodedId, linkForm, setLinkForm, linkSaving, onAddLink, onDeleteLink }) {
  return (
    <div className="space-y-4">
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
                      className="sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 ml-0.5 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-all rounded-full hover:bg-red-50 dark:hover:bg-red-900/20"
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
    </div>
  )
}
