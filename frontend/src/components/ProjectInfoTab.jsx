import { useState } from 'react'
import api from '../api/client'

const CONNECTIONS = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/usuario',    icon: '📸' },
  { key: 'tiktok',    label: 'TikTok',    placeholder: 'https://tiktok.com/@usuario',      icon: '🎵' },
  { key: 'linkedin',  label: 'LinkedIn',  placeholder: 'https://linkedin.com/company/...', icon: '💼' },
]

function parseConnections(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return {} }
}

export default function ProjectInfoTab({ project, onSave }) {
  const connections = parseConnections(project.connections)

  const [websiteUrl, setWebsiteUrl] = useState(project.websiteUrl ?? '')
  const [conns, setConns]           = useState(connections)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [error, setError]           = useState('')

  function isDirty() {
    if (websiteUrl.trim() !== (project.websiteUrl ?? '')) return true
    return CONNECTIONS.some(c => (conns[c.key] ?? '') !== (connections[c.key] ?? ''))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const body = {}
      if (websiteUrl.trim() !== (project.websiteUrl ?? '')) body.websiteUrl = websiteUrl.trim() || null
      body.connections = JSON.stringify(conns)
      const { data } = await api.put(`/projects/${project.id}`, body)
      onSave({ websiteUrl: data.websiteUrl, connections: data.connections })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-5">

      {/* Sitio web */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
          🌐 Sitio web
        </label>
        <input
          type="text"
          value={websiteUrl}
          onChange={e => setWebsiteUrl(e.target.value)}
          placeholder="https://ejemplo.com"
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <p className="text-xs text-gray-400 mt-1">Usado para análisis GEO en la sección Marketing</p>
      </div>

      {/* Redes y conexiones */}
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Redes y conexiones
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CONNECTIONS.map(c => (
            <div key={c.key}>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {c.icon} {c.label}
              </label>
              <input
                type="text"
                value={conns[c.key] ?? ''}
                onChange={e => setConns(prev => ({ ...prev, [c.key]: e.target.value }))}
                placeholder={c.placeholder}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSave}
          disabled={saving || !isDirty()}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
        >
          {saving ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar'}
        </button>
        {saved && <span className="text-sm text-emerald-500">Los cambios se guardaron correctamente</span>}
      </div>
    </div>
  )
}
