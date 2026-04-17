import { useState, useEffect } from 'react'
import api from '../../api/client'

const ROLE_COLORS = [
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-yellow-100 text-yellow-700',
  'bg-blue-100 text-blue-700',
  'bg-cyan-100 text-cyan-700',
  'bg-green-100 text-green-700',
  'bg-orange-100 text-orange-700',
  'bg-rose-100 text-rose-700',
]

function roleColor(roleName) {
  let hash = 0
  for (const c of roleName) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return ROLE_COLORS[hash % ROLE_COLORS.length]
}

const emptyForm = { name: '', email: '', password: '', role: '', isAdmin: false }

const MARITAL_LABELS = {
  soltero: 'Soltero/a', casado: 'Casado/a', divorciado: 'Divorciado/a',
  viudo: 'Viudo/a', union_convivencial: 'Unión convivencial',
}
const EDUCATION_LABELS = {
  primario: 'Primario', secundario: 'Secundario', terciario: 'Terciario',
  universitario: 'Universitario', posgrado: 'Posgrado',
}

function DataField({ label, value }) {
  if (!value && value !== 0) return null
  return (
    <div>
      <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">{value}</p>
    </div>
  )
}

export default function TeamTab() {
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data))
    api.get('/roles').then(r => {
      setRoles(r.data)
      setForm(p => ({ ...p, role: r.data[0]?.name || '' }))
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (editId) {
        const payload = { name: form.name, email: form.email, role: form.role, isAdmin: form.isAdmin }
        if (form.password) payload.password = form.password
        const { data } = await api.put(`/users/${editId}`, payload)
        setUsers(prev => prev.map(u => u.id === data.id ? data : u))
      } else {
        const { data } = await api.post('/users', form)
        setUsers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      }
      setForm({ ...emptyForm, role: roles[0]?.name || '' })
      setEditId(null)
    } catch (err) {
      setError(err.response?.data?.error || 'Error')
    } finally {
      setLoading(false)
    }
  }

  function startEdit(u) {
    setEditId(u.id)
    setForm({ name: u.name, email: u.email, password: '', role: u.role, isAdmin: u.isAdmin ?? false })
  }

  async function toggleActive(u) {
    const { data } = await api.put(`/users/${u.id}`, { active: !u.active })
    setUsers(prev => prev.map(x => x.id === data.id ? data : x))
  }

  function labelFor(roleName) {
    return roles.find(r => r.name === roleName)?.label ?? roleName
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editId ? 'Editar miembro' : 'Equipo'}</h2>
        {!editId && users.length > 0 && (
          <span className="text-sm bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2.5 py-0.5 font-medium">
            {users.filter(u => u.active).length} miembros
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-4 mb-6 grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Nombre</label>
          <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="mt-1 w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Email</label>
          <input required type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            className="mt-1 w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{editId ? 'Nueva contraseña (opcional)' : 'Contraseña'}</label>
          <input type="password" required={!editId} value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
            className="mt-1 w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Rol</label>
          <select required value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
            className="mt-1 w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
            {roles.map(r => <option key={r.id} value={r.name}>{r.label}</option>)}
          </select>
        </div>
        <div className="col-span-2 flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Administrador</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Acceso al panel de admin, reportes y gestión del equipo</p>
          </div>
          <button
            type="button"
            onClick={() => setForm(p => ({ ...p, isAdmin: !p.isAdmin }))}
            className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
              form.isAdmin ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
              form.isAdmin ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>
        {error && <p className="col-span-2 text-red-500 text-sm">{error}</p>}
        <div className="col-span-2 flex gap-3">
          {editId && (
            <button type="button" onClick={() => { setEditId(null); setForm({ ...emptyForm, role: roles[0]?.name || '' }) }}
              className="border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg px-4 py-2 text-sm">Cancelar</button>
          )}
          <button type="submit" disabled={loading}
            className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-60">
            {loading ? 'Guardando...' : editId ? 'Actualizar' : 'Agregar al equipo'}
          </button>
        </div>
      </form>

      <div className="space-y-2">
        {users.filter(u => u.active).map(u => {
          const isExpanded = expandedId === u.id
          const birthday = u.birthday
            ? new Date(u.birthday).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
            : null
          const hasPersonalData = u.phone || u.birthday || u.address || u.dni || u.cuit || u.alias || u.bankName ||
            u.maritalStatus || u.children !== null || u.educationLevel || u.educationTitle ||
            u.bloodType || u.medicalConditions || u.healthInsurance || u.emergencyContact

          return (
            <div key={u.id} className={`bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden ${!u.active ? 'opacity-50' : ''}`}>
              {/* Main row */}
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
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleColor(u.role)}`}>
                    {labelFor(u.role)}
                  </span>
                  <button onClick={() => startEdit(u)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400">Editar</button>
                  <button onClick={() => toggleActive(u)} className="text-xs text-red-500 hover:text-red-700">
                    Desactivar
                  </button>
                  {/* Expand toggle */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : u.id)}
                    title={isExpanded ? 'Ocultar datos personales' : 'Ver datos personales'}
                    className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors p-0.5"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                      className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    >
                      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Personal data panel */}
              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-4 bg-gray-50 dark:bg-gray-900/40">
                  {!hasPersonalData ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500 italic">Este usuario no completó sus datos personales todavía.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">

                      {/* Contacto */}
                      <DataField label="Celular" value={u.phone} />
                      <DataField label="Fecha de nacimiento" value={birthday} />
                      <DataField label="Dirección" value={u.address} />
                      <DataField label="Contacto de emergencia" value={u.emergencyContact} />

                      {/* Identidad */}
                      <DataField label="DNI" value={u.dni} />
                      <DataField label="CUIT" value={u.cuit} />
                      <DataField label="Alias CBU" value={u.alias} />
                      <DataField label="Banco" value={u.bankName} />

                      {/* Personal */}
                      <DataField label="Estado civil" value={MARITAL_LABELS[u.maritalStatus] ?? u.maritalStatus} />
                      <DataField label="Hijos" value={u.children !== null ? String(u.children) : null} />

                      {/* Educación */}
                      <DataField label="Nivel de estudios" value={EDUCATION_LABELS[u.educationLevel] ?? u.educationLevel} />
                      <DataField label="Título" value={u.educationTitle} />

                      {/* Salud */}
                      <DataField label="Grupo sanguíneo" value={u.bloodType} />
                      <DataField label="Obra social" value={u.healthInsurance} />
                      {u.medicalConditions && (
                        <div className="col-span-2 sm:col-span-3">
                          <DataField label="Enfermedades / Alergias" value={u.medicalConditions} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Historial de usuarios inactivos */}
      {users.some(u => !u.active) && (
        <div className="mt-6">
          <button
            onClick={() => setShowInactive(v => !v)}
            className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors w-full"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
              className={`w-4 h-4 transition-transform duration-200 ${showInactive ? 'rotate-180' : ''}`}
            >
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
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleColor(u.role)}`}>
                        {labelFor(u.role)}
                      </span>
                      <button
                        onClick={() => toggleActive(u)}
                        className="text-xs text-green-500 hover:text-green-700"
                      >
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
