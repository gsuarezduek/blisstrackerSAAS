import { useState, useEffect } from 'react'
import api from '../../api/client'
import { X, ShieldCheck } from 'lucide-react'
import { Icon } from '../ui/Icon'

export default function ProtectedUrlsModal({ projectId, onClose }) {
  const [urls, setUrls] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const { data } = await api.get(`/marketing/projects/${projectId}/cannibal/protected-urls`)
        if (!cancelled) setUrls(data.urls ?? [])
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  function add() {
    const v = draft.trim()
    if (!v || urls.includes(v)) { setDraft(''); return }
    setUrls(prev => [...prev, v])
    setDraft('')
  }

  function remove(idx) {
    setUrls(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await api.put(`/marketing/projects/${projectId}/cannibal/protected-urls`, { urls })
      onClose()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Error al guardar')
    }
    setSaving(false)
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 text-center"><Icon as={ShieldCheck} size={32} className="inline-block text-primary-500" /></div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center mb-2">
          URLs protegidas
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-4">
          El análisis de canibalización nunca recomienda 301 ni noindex para estas URLs.
        </p>

        {loading ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">Cargando…</p>
        ) : (
          <>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
                placeholder="https://ejemplo.com/pagina"
                className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                type="button"
                onClick={add}
                className="px-3 py-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg"
              >
                Agregar
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1.5 mb-4">
              {urls.length === 0 ? (
                <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-3">Sin URLs protegidas todavía.</p>
              ) : (
                urls.map((u, i) => (
                  <div key={`${u}-${i}`} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-1.5">
                    <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 break-all">{u}</span>
                    <button type="button" onClick={() => remove(i)} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 flex-shrink-0">
                      <Icon as={X} size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {error && <p className="text-xs text-red-600 dark:text-red-400 mb-3 text-center">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
