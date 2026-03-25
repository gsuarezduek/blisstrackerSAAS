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

const emptyForm = { name: '', email: '', password: '', role: '' }

export default function TeamTab() {
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
        const payload = { name: form.name, email: form.email, role: form.role }
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
    setForm({ name: u.name, email: u.email, password: '', role: u.role })
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
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{editId ? 'Editar miembro' : 'Agregar miembro del equipo'}</h2>

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
        {users.map(u => (
          <div key={u.id} className={`flex items-center justify-between bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-3 ${!u.active ? 'opacity-50' : ''}`}>
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{u.name}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{u.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleColor(u.role)}`}>
                {labelFor(u.role)}
              </span>
              <button onClick={() => startEdit(u)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400">Editar</button>
              <button onClick={() => toggleActive(u)}
                className={`text-xs ${u.active ? 'text-red-500 hover:text-red-700' : 'text-green-500 hover:text-green-700'}`}>
                {u.active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
