import { useState, useEffect } from 'react'
import api from '../../api/client'

const MCP_URL = `${import.meta.env.VITE_API_URL}/api/mcp`

function fmtDate(d) {
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function timeAgo(dateStr) {
  if (!dateStr) return 'nunca'
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60) return 'hace un momento'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  if (diff < 86400 * 7) return `hace ${Math.floor(diff / 86400)} día${Math.floor(diff / 86400) > 1 ? 's' : ''}`
  return fmtDate(dateStr)
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard no disponible */ }
  }
  return (
    <button onClick={handleCopy}
      className="flex-shrink-0 text-xs px-2.5 py-1 rounded-lg font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
      {copied ? 'Copiado ✓' : 'Copiar'}
    </button>
  )
}

export default function AgentsTab() {
  const [tokens,     setTokens]     = useState([])
  const [loading,    setLoading]    = useState(true)
  const [label,      setLabel]      = useState('')
  const [creating,   setCreating]   = useState(false)
  const [revealed,   setRevealed]   = useState(null) // { token, label }
  const [error,      setError]      = useState('')
  const [revokingId, setRevokingId] = useState(null)

  function load() {
    setLoading(true)
    api.get('/mcp-tokens').then(({ data }) => setTokens(data)).finally(() => setLoading(false))
  }
  useEffect(load, [])

  async function handleCreate() {
    setCreating(true)
    setError('')
    try {
      const { data } = await api.post('/mcp-tokens', { label: label.trim() })
      setRevealed({ token: data.token, label: data.label })
      setLabel('')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo generar el token.')
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id) {
    if (!confirm('¿Revocar este token? El agente conectado con él dejará de funcionar de inmediato.')) return
    setRevokingId(id)
    try {
      await api.patch(`/mcp-tokens/${id}/revoke`)
      load()
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <>
      {/* Explicación + URL del servidor */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Conectar un asistente de IA</h2>
          <span className="text-xs bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 rounded-full px-2 py-0.5 font-medium">MCP</span>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-5 leading-relaxed">
          Conectá Grok (u otro asistente compatible con MCP) a tu cuenta para que pueda leer y crear información en BlissTracker en tu nombre — tareas, marketing, contenido, ventas — con exactamente los mismos permisos que ya tenés en la app.
        </p>
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900/40 border dark:border-gray-700 rounded-xl px-3 py-2">
          <code className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate">{MCP_URL}</code>
          <CopyButton text={MCP_URL} />
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 leading-relaxed">
          En tu cliente de IA, agregá un conector remoto de tipo MCP con esta URL y, como autenticación, un token <strong className="text-gray-600 dark:text-gray-300">Bearer</strong> — generalo abajo.
        </p>
      </div>

      {/* Tokens */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Tus tokens</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">
          Cada token identifica a un asistente conectado con tu usuario. Podés generar varios (uno por asistente) y revocarlos cuando quieras.
        </p>

        <div className="flex items-center gap-2 mb-5">
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Nombre del agente (ej: Grok)"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button onClick={handleCreate} disabled={creating}
            className="flex-shrink-0 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl px-4 py-2 transition-colors">
            {creating ? 'Generando...' : '+ Generar token'}
          </button>
        </div>
        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

        {loading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Todavía no generaste ningún token.</p>
        ) : (
          <div className="space-y-2">
            {tokens.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{t.label || '(sin nombre)'}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Creado {fmtDate(t.createdAt)} · Último uso: {timeAgo(t.lastUsedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {t.revokedAt ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Revocado</span>
                  ) : (
                    <>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">Activo</span>
                      <button onClick={() => handleRevoke(t.id)} disabled={revokingId === t.id}
                        className="text-xs px-2.5 py-1 rounded-lg font-medium bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50">
                        {revokingId === t.id ? '...' : 'Revocar'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: token revelado una sola vez */}
      {revealed && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Token generado</h3>
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
              Copialo ahora — por seguridad, no vas a poder volver a verlo.
            </p>
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900/40 border dark:border-gray-700 rounded-xl px-3 py-2 mb-4">
              <code className="flex-1 text-xs text-gray-700 dark:text-gray-300 break-all">{revealed.token}</code>
              <CopyButton text={revealed.token} />
            </div>
            <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-4 text-xs text-gray-500 dark:text-gray-400 leading-relaxed space-y-1 mb-5">
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Cómo conectarlo en Grok:</p>
              <p>1. En grok.com/connectors (o Configuración → Plugins), elegí "Agregar conector personalizado".</p>
              <p>2. Pegá la URL del servidor de arriba.</p>
              <p>3. Como autenticación, elegí Bearer Token y pegá este token.</p>
            </div>
            <button onClick={() => setRevealed(null)}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl px-4 py-2 transition-colors">
              Listo, ya lo copié
            </button>
          </div>
        </div>
      )}
    </>
  )
}
