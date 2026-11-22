import { useState, useEffect } from 'react'
import api from '../../api/client'
import { invalidateMyAgents } from '../../hooks/useMyAgents'
import { AgentChannels, WakeConfigCard } from '../../components/preferences/agentChannels'

const MCP_URL = `${import.meta.env.VITE_API_URL}/api/mcp`

// Cada cuánto, como mucho, se le recuerda al agente que registre en qué está
// trabajando si no tiene ninguna tarea en curso (backend: mcp/workReminder.js).
const REMINDER_OPTIONS = [
  { value: 15,  label: 'cada 15 min' },
  { value: 30,  label: 'cada 30 min' },
  { value: 60,  label: 'cada 1 h' },
  { value: 120, label: 'cada 2 h' },
  { value: 240, label: 'cada 4 h' },
  { value: 0,   label: 'nunca' },
]

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

// Avisa cuando un token no está entrando. Son dos situaciones distintas y la
// diferencia es lo que hay que hacer:
//   - revocado con intentos: el conector sigue apuntando a un token dado de baja.
//   - activo que nunca entró: lo más común es que se haya pegado mal al copiarlo.
// Un token que recibe rechazos por un valor que no coincide con ninguno NO aparece acá:
// ese rechazo llega sin identidad y no cuelga de ninguna fila (ver mcp/auth.js).
function TokenAlert({ token }) {
  const failure = token.authFailures?.[0]

  if (token.revokedAt && failure) {
    return (
      <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md px-2 py-1.5">
        Un conector sigue intentando entrar con este token revocado:{' '}
        <strong>{failure.attempts} {failure.attempts === 1 ? 'intento' : 'intentos'}</strong>, el último {timeAgo(failure.lastAt)}
        {failure.ip ? ` desde ${failure.ip}` : ''}. Generá uno nuevo y pegalo en su configuración.
      </p>
    )
  }

  if (!token.revokedAt && !token.lastUsedAt) {
    return (
      <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-2 py-1.5">
        Todavía no se conectó ninguna vez. Si ya lo configuraste, revisá que esté pegado completo
        en el conector — un token incompleto se rechaza igual que uno inexistente.
      </p>
    )
  }

  return null
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
  const [rotatingId, setRotatingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [showRevoked, setShowRevoked] = useState(false)
  const [savingId,   setSavingId]   = useState(null)

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
      invalidateMyAgents()
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
      invalidateMyAgents()
      load()
    } finally {
      setRevokingId(null)
    }
  }

  // Rotar ≠ revocar: la credencial cambia pero el agente sigue siendo el mismo (mismo
  // nombre, mismos proyectos, mismo historial). Es la opción correcta para un token que
  // se filtró; revocar es para dar de baja al agente.
  async function handleRotate(t) {
    const nombre = t.label || 'este agente'
    if (!confirm(`¿Generar un token nuevo para «${nombre}»?\n\nEl token actual deja de funcionar de inmediato y vas a tener que pegar el nuevo en tu cliente MCP. El agente conserva su nombre, sus proyectos y su historial.`)) return
    setRotatingId(t.id)
    setError('')
    try {
      const { data } = await api.post(`/agents/${t.id}/rotate`)
      setRevealed({ token: data.token, label: data.label })
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo rotar el token.')
    } finally {
      setRotatingId(null)
    }
  }

  // Borrar la fila del agente. El trabajo que hizo NO se borra (las FKs son SetNull):
  // queda en el historial, en las métricas y en el informe al cliente, pero sin su
  // nombre. Por eso se avisa con el número exacto antes de preguntar.
  async function handleDelete(t) {
    const nombre = t.label || 'este agente'
    const n = t.historyCount ?? 0
    const aviso = n > 0
      ? `\n\nSu trabajo NO se borra: ${n} ${n === 1 ? 'registro' : 'registros'} (tareas y comentarios) quedan en el historial, pero van a aparecer como "Agente eliminado" en vez de con su nombre.`
      : '\n\nNo tiene nada cargado, así que no se pierde ningún dato.'
    if (!confirm(`¿Borrar «${nombre}» de la lista?${aviso}\n\nEsto no se puede deshacer.`)) return
    setDeletingId(t.id)
    setError('')
    try {
      await api.delete(`/mcp-tokens/${t.id}`)
      invalidateMyAgents()
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo borrar.')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleReminderChange(id, workReminderMins) {
    setSavingId(id)
    try {
      const { data } = await api.patch(`/mcp-tokens/${id}`, { workReminderMins })
      setTokens(prev => prev.map(t => (t.id === id ? { ...t, workReminderMins: data.workReminderMins } : t)))
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el recordatorio.')
    } finally {
      setSavingId(null)
    }
  }

  const activos   = tokens.filter(t => !t.revokedAt)
  const revocados = tokens.filter(t => t.revokedAt)

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
        {/* Es la pregunta que aparece sola la primera vez que alguien vuelve a esta
            pantalla buscando un token que ya pegó en otro lado. Mejor que la responda
            acá que dejarlo buscando un botón que no existe. */}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
          <strong className="text-gray-600 dark:text-gray-300">¿Perdiste un token?</strong> No se puede volver a ver:
          guardamos solo un hash, nunca el valor. Usá <strong className="text-gray-600 dark:text-gray-300">Rotar token</strong> en
          el agente que corresponda — te da uno nuevo y el agente conserva su nombre, sus proyectos y su historial.
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
            {/* Los revocados se esconden detrás de un toggle: son historial, no agentes
                del equipo, y con el tiempo son la mayoría de la lista. */}
            {activos.map(t => (
              <div key={t.id} className="py-2.5 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
               <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{t.label || '(sin nombre)'}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Creado {fmtDate(t.createdAt)} · Último uso: {timeAgo(t.lastUsedAt)}
                  </p>
                  {!t.revokedAt && (
                    <label className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-gray-500 dark:text-gray-400"
                      title="Si el agente usa BlissTracker sin tener ninguna tarea en curso, se le recuerda que registre en qué está trabajando">
                      Recordarle registrar lo que hace
                      <select
                        value={t.workReminderMins ?? 30}
                        onChange={e => handleReminderChange(t.id, Number(e.target.value))}
                        disabled={savingId === t.id}
                        className="text-xs px-1.5 py-0.5 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                      >
                        {REMINDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                  )}
                  <TokenAlert token={t} />
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {t.revokedAt ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Revocado</span>
                  ) : (
                    <>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">Activo</span>
                      <button onClick={() => handleRotate(t)} disabled={rotatingId === t.id}
                        title="Le da una credencial nueva sin perder su nombre, sus proyectos ni su historial"
                        className="text-xs px-2.5 py-1 rounded-lg font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50">
                        {rotatingId === t.id ? '...' : 'Rotar token'}
                      </button>
                      <button onClick={() => handleRevoke(t.id)} disabled={revokingId === t.id}
                        className="text-xs px-2.5 py-1 rounded-lg font-medium bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50">
                        {revokingId === t.id ? '...' : 'Revocar'}
                      </button>
                    </>
                  )}
                </div>
               </div>
                {!t.revokedAt && (
                  <AgentChannels
                    token={t}
                    onSaved={updated => setTokens(prev => prev.map(x => (x.id === updated.id ? updated : x)))}
                  />
                )}
              </div>
            ))}

            {activos.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                No tenés agentes activos. Generá un token arriba para conectar uno.
              </p>
            )}

            {revocados.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowRevoked(v => !v)}
                  className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {showRevoked ? 'Ocultar' : 'Ver'} revocados · {revocados.length}
                </button>
                {showRevoked && (
                  <div className="space-y-2 mt-2">
                    {revocados.map(t => (
                      <div key={t.id} className="py-2.5 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 opacity-70">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{t.label || '(sin nombre)'}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              Creado {fmtDate(t.createdAt)} · Revocado {fmtDate(t.revokedAt)}
                              {(t.historyCount ?? 0) > 0 && ` · ${t.historyCount} ${t.historyCount === 1 ? 'registro' : 'registros'} en el historial`}
                            </p>
                            <TokenAlert token={t} />
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Revocado</span>
                            <button onClick={() => handleDelete(t)} disabled={deletingId === t.id}
                              title={(t.historyCount ?? 0) > 0
                                ? 'Lo saca de la lista. Su trabajo queda en el historial, pero sin su nombre.'
                                : 'Lo saca de la lista. No tiene nada cargado.'}
                              className="text-xs px-2.5 py-1 rounded-lg font-medium bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50">
                              {deletingId === t.id ? '...' : 'Borrar'}
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
        )}
      </div>

      <WakeConfigCard />

      {/* Modal: token revelado una sola vez */}
      {revealed && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Token generado</h3>
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
              Copialo ahora — por seguridad, <strong className="font-semibold">no vas a poder volver a verlo</strong>:
              de este token guardamos solo un hash, así que ni nosotros podemos recuperarlo. Si lo perdés,
              usá "Rotar token" en la lista de abajo y te damos uno nuevo sin perder el agente.
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
