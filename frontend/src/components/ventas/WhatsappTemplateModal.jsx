import { useEffect, useState } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../LoadingSpinner'

// Elegir una plantilla aprobada + completar sus variables para reabrir una
// conversación fuera de la ventana de 24hs (Fase 5 del plan) — único caso en
// el que WhatsApp permite mandar algo sin texto libre. Las plantillas en sí
// se crean/aprueban en el dashboard de Chakra, acá solo se leen (botón
// "Sincronizar" trae el catálogo actualizado, solo admin/owner).
export default function WhatsappTemplateModal({ onClose, onSend }) {
  const { user } = useAuth()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [variables, setVariables] = useState([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/whatsapp/templates', { params: { status: 'APPROVED' } })
      setTemplates(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const selected = templates.find(t => t.id === Number(selectedId))

  function selectTemplate(id) {
    setSelectedId(id)
    const t = templates.find(x => x.id === Number(id))
    setVariables(t ? Array(t.variableCount).fill('') : [])
  }

  async function handleSync() {
    setSyncing(true)
    setError(null)
    try {
      const { data } = await api.post('/whatsapp/templates/sync')
      setTemplates(data.templates.filter(t => t.status === 'APPROVED'))
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo sincronizar el catálogo')
    } finally {
      setSyncing(false)
    }
  }

  async function handleSend() {
    if (!selected) return
    setSending(true)
    setError(null)
    try {
      await onSend(selected.id, variables)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo enviar la plantilla')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">🔄 Reabrir con plantilla</h2>
          {user?.isAdmin && (
            <button onClick={handleSync} disabled={syncing} className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-50">
              {syncing ? 'Sincronizando…' : '↻ Sincronizar'}
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Pasaron más de 24hs desde el último mensaje del contacto — WhatsApp solo permite reabrir con una plantilla ya aprobada por Meta.
        </p>

        {loading ? (
          <LoadingSpinner size="sm" className="py-6" />
        ) : templates.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-4">
            {user?.isAdmin
              ? 'Todavía no hay plantillas aprobadas sincronizadas. Creá y aprobá una en el dashboard de Chakra y después tocá "Sincronizar".'
              : 'Todavía no hay plantillas disponibles — pedile a un admin que las sincronice desde el dashboard de Chakra.'}
          </p>
        ) : (
          <div className="space-y-3">
            <select
              value={selectedId}
              onChange={e => selectTemplate(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Elegí una plantilla…</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.language})</option>
              ))}
            </select>

            {selected && (
              <>
                {selected.bodyText && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 whitespace-pre-wrap">
                    {selected.bodyText}
                  </p>
                )}
                {variables.map((v, i) => (
                  <input
                    key={i}
                    value={v}
                    onChange={e => setVariables(vs => vs.map((x, idx) => idx === i ? e.target.value : x))}
                    placeholder={`Variable {{${i + 1}}}`}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                  />
                ))}
              </>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400 mt-3">{error}</p>}

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">
            Cancelar
          </button>
          <button
            onClick={handleSend}
            disabled={!selected || sending || variables.some(v => !v.trim())}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-xl"
          >
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}
