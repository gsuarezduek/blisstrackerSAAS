import { useState, useEffect } from 'react'
import api from '../../api/client'

// Canales de SALIDA hacia un agente de IA — Preferencias → Agentes IA.
//
// Un agente conectado por MCP solo actúa cuando lo invocás: no recibe avisos. Si le
// destrabás una tarea o le dejás un comentario, se entera recién la próxima vez que lo
// uses. Estas dos opciones son las que cambian eso, y las dos son opt-in por agente:
//   · Webhook: le avisamos a una URL tuya (sirve si el agente corre en algún lado que
//     pueda recibir un POST: n8n, un script, un bot propio).
//   · Despertador: BlissTracker invoca al agente por la API del proveedor. Es el único
//     que funciona solo, y consume la API key del workspace.

function fmtWhen(dateStr) {
  if (!dateStr) return null
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60) return 'hace un momento'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

// "200" es la única respuesta buena; el resto (timeout, 500, url-no-permitida) se pinta
// en rojo con el texto tal cual lo guardó el backend.
function DeliveryStatus({ at, status, okLabel = 'Entregado' }) {
  if (!at) return null
  const ok = /^2\d\d$/.test(status || '') || status === 'ok'
  return (
    <p className={`text-xs mt-1 ${ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
      {ok ? okLabel : `Falló: ${status}`} · {fmtWhen(at)}
    </p>
  )
}

export function AgentChannels({ token, onSaved }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(token.webhookUrl || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(patch) {
    setSaving(true)
    setError('')
    try {
      const { data } = await api.patch(`/mcp-tokens/${token.id}`, patch)
      onSaved(data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  const active = [token.webhookUrl && 'webhook', token.wakeEnabled && 'despertador'].filter(Boolean)

  return (
    <div className="mt-2 border-t border-gray-200 dark:border-gray-600 pt-2">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400">
        {open ? '▾' : '▸'} Avisarle cuando hay novedades
        {active.length > 0 && <span className="ml-1 text-primary-600 dark:text-primary-400">({active.join(' + ')})</span>}
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          <div>
            <label htmlFor={`wh-${token.id}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Webhook <span className="font-normal text-gray-400">(opcional)</span>
            </label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 mb-1.5 leading-relaxed">
              Le mandamos un POST a esta URL cuando hay una novedad para este agente. Sirve si tenés algo escuchando (n8n, un script, un bot propio) que después pida el detalle con <code>tasks_agent_updates</code>, por MCP y con el token de este agente (ese token no sirve contra la API REST). El aviso no incluye el contenido del trabajo, a propósito. Grok en grok.com no puede recibirlo.
            </p>
            <div className="flex items-center gap-2">
              <input
                id={`wh-${token.id}`}
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button type="button" onClick={() => save({ webhookUrl: url })} disabled={saving || url === (token.webhookUrl || '')}
                className="flex-shrink-0 text-xs px-2.5 py-1.5 rounded-lg font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40">
                Guardar
              </button>
            </div>
            <DeliveryStatus at={token.webhookLastAt} status={token.webhookLastStatus} />
            {token.webhookSecret && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 break-all">
                Firma: cada POST lleva el header <code>X-Bliss-Signature: sha256=HMAC(body)</code> con este secret —{' '}
                <code className="text-gray-500 dark:text-gray-400">{token.webhookSecret}</code>
              </p>
            )}
          </div>

          <div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!token.wakeEnabled}
                onChange={e => save({ wakeEnabled: e.target.checked })}
                disabled={saving}
                className="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-xs">
                <span className="font-medium text-gray-700 dark:text-gray-300">Despertarlo automáticamente</span>
                <span className="block text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">
                  BlissTracker invoca al agente por la API del proveedor y le pasa la novedad, con las mismas tools y permisos que tiene en el chat. Es el único que funciona sin que lo uses. Ojo: el agente que corre así es uno nuevo por API — no tiene la configuración ni la memoria del de grok.com — y gasta la API key del workspace.
                </span>
              </span>
            </label>
            <DeliveryStatus at={token.wakeLastAt} status={token.wakeLastStatus} okLabel="Despertado" />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}
    </div>
  )
}

// API key del proveedor, a nivel workspace: la paga el workspace y la configura un
// admin, a diferencia del resto de esta pantalla que es self-service. La key nunca
// vuelve del backend — solo si está puesta o no.
export function WakeConfigCard() {
  const [cfg, setCfg] = useState(null)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.get('/mcp-tokens/wake-config').then(({ data }) => {
      setCfg(data)
      setModel(data.model || '')
    }).catch(() => setCfg({ configured: false, canEdit: false }))
  }, [])

  async function save(patch) {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await api.put('/mcp-tokens/wake-config', patch)
      const { data } = await api.get('/mcp-tokens/wake-config')
      setCfg(data)
      setApiKey('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  if (!cfg) return null
  // Sin permiso y sin key configurada no hay nada que contar: el bloque solo confundiría.
  if (!cfg.canEdit && !cfg.configured) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Despertador de agentes</h2>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 leading-relaxed">
        Para que BlissTracker pueda invocar a un agente cuando hay novedades para él, hace falta una API key del proveedor (xAI). Es del workspace y la comparten todos los agentes con el despertador activado. Se guarda cifrada y no se puede volver a ver.
      </p>

      <p className={`text-xs mb-4 ${cfg.configured ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
        {cfg.configured ? `Configurada · modelo: ${cfg.model}` : 'Sin configurar: el despertador no va a poder arrancar.'}
      </p>

      {cfg.canEdit ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={cfg.configured ? 'Reemplazar la API key…' : 'API key de xAI (xai-…)'}
              autoComplete="off"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button type="button" onClick={() => save({ apiKey })} disabled={saving || !apiKey.trim()}
              className="flex-shrink-0 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl px-4 py-2 transition-colors">
              Guardar
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder={cfg.defaultModel}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button type="button" onClick={() => save({ model })} disabled={saving || model === (cfg.model || '')}
              className="flex-shrink-0 text-sm px-4 py-2 rounded-xl font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40">
              Guardar modelo
            </button>
          </div>
          {cfg.configured && (
            <button type="button" onClick={() => save({ apiKey: '' })} disabled={saving}
              className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50">
              Borrar la API key guardada
            </button>
          )}
          {saved && <p className="text-xs text-green-600 dark:text-green-400">Guardado ✓</p>}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      ) : (
        <p className="text-xs text-gray-400 dark:text-gray-500">La configura un admin del workspace.</p>
      )}
    </div>
  )
}
