import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import useRoles from '../hooks/useRoles'

const ROLE_COLORS_LIST = [
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-yellow-100 text-yellow-700',
  'bg-blue-100 text-blue-700',
  'bg-cyan-100 text-cyan-700',
  'bg-green-100 text-green-700',
  'bg-orange-100 text-orange-700',
]

function roleColor(name) {
  let hash = 0
  for (const c of (name || '')) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return ROLE_COLORS_LIST[hash % ROLE_COLORS_LIST.length]
}

function Avatar({ name }) {
  const initials = name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  const colors   = ['bg-indigo-500','bg-pink-500','bg-yellow-500','bg-green-500','bg-blue-500','bg-purple-500','bg-red-500','bg-cyan-500']
  const color    = colors[name.charCodeAt(0) % colors.length]
  return (
    <div className={`${color} text-white w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0`}>
      {initials}
    </div>
  )
}

export default function MyProjects() {
  const { user } = useAuth()
  const { labelFor } = useRoles()
  const [projects, setProjects] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    api.get('/projects')
      .then(r => setProjects(r.data))
      .finally(() => setLoading(false))
  }, [])

  const isAdmin = user?.role === 'ADMIN'

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Mis Proyectos</h1>
          <p className="text-gray-500 text-sm mt-1">
            {isAdmin ? `${projects.length} proyectos activos` : `Participás en ${projects.length} proyecto${projects.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {loading && <div className="text-center py-16 text-gray-400">Cargando...</div>}

        {!loading && projects.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📂</p>
            <p className="font-medium">No estás asignado a ningún proyecto todavía</p>
            <p className="text-sm mt-1">Pedile a un administrador que te agregue a un proyecto</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map(p => (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-4">

              {/* Project name */}
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                <h2 className="font-bold text-gray-900 text-lg leading-tight">{p.name}</h2>
              </div>

              {/* Services */}
              {p.services.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Servicios</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.services.map(ps => (
                      <span key={ps.service.id} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full px-3 py-1 font-medium">
                        {ps.service.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {p.services.length === 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Servicios</p>
                  <p className="text-xs text-gray-400 italic">Sin servicios asignados</p>
                </div>
              )}

              {/* Team */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Equipo · {p.members.length} persona{p.members.length !== 1 ? 's' : ''}
                </p>
                {p.members.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {p.members.map(pm => (
                      <div key={pm.user.id} className="flex items-center gap-2.5">
                        <Avatar name={pm.user.name} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 leading-tight">{pm.user.name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor(pm.user.role)}`}>
                            {labelFor(pm.user.role)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Sin equipo asignado</p>
                )}
              </div>

            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
