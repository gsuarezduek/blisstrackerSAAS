import { useState } from 'react'
import api from '../api/client'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { useGoogleIntegration } from '../hooks/useGoogleIntegration'

// Integraciones Google (OAuth compartido vía useGoogleIntegration) — deben reflejar
// 1 a 1 lo que soporta Marketing (GA4, Search Console, Ads, YouTube).
const GOOGLE_INTEGRATIONS = [
  {
    key:   'google_analytics',
    label: 'Google Analytics',
    icon:  '📊',
    desc:  'Ver sesiones, usuarios y páginas en Marketing → Web',
    requiredField: 'propertyId',
  },
  {
    key:   'google_search_console',
    label: 'Search Console',
    icon:  '🔍',
    desc:  'Ver clicks, impresiones y palabras clave en Marketing → SEO',
  },
  {
    key:   'google_ads',
    label: 'Google Ads',
    icon:  '📣',
    desc:  'Ver campañas, clics y conversiones en Marketing → Anuncios',
    requiredField: 'customerId',
  },
  {
    key:   'google_youtube',
    label: 'YouTube',
    icon:  '▶️',
    desc:  'Suscriptores, vistas y videos en Marketing → YouTube',
  },
]

// Integraciones de Redes Sociales (popup OAuth propio, fuera del flujo de Google) —
// deben reflejar 1 a 1 lo que soporta Marketing (Instagram, Facebook, TikTok, LinkedIn, Meta Ads).
const SOCIAL_INTEGRATIONS = [
  {
    key:      'instagram',
    label:    'Instagram',
    icon:     '📸',
    desc:     'Seguidores, engagement y métricas de publicaciones',
    authPath: (projectId) => `/marketing/integrations/meta/auth-url?projectId=${projectId}`,
    popup:    'instagram_oauth',
  },
  {
    key:      'facebook',
    label:    'Facebook',
    icon:     '📘',
    desc:     'Seguidores y métricas de la Página',
    authPath: (projectId) => `/marketing/integrations/facebook/auth-url?projectId=${projectId}`,
    popup:    'facebook_oauth',
  },
  {
    key:      'linkedin',
    label:    'LinkedIn',
    icon:     '💼',
    desc:     'Seguidores y métricas de la Company Page',
    authPath: (projectId) => `/marketing/integrations/linkedin/auth-url?projectId=${projectId}`,
    popup:    'linkedin_oauth',
  },
  {
    key:      'tiktok',
    label:    'TikTok',
    icon:     '🎵',
    desc:     'Seguidores, vistas y métricas de videos',
    authPath: (projectId) => `/marketing/integrations/tiktok/auth-url?projectId=${projectId}`,
    popup:    'tiktok_oauth',
  },
  {
    key:      'meta_ads',
    label:    'Meta Ads',
    icon:     '📣',
    desc:     'Campañas de Facebook e Instagram Ads',
    authPath: (projectId) => `/marketing/integrations/meta-ads/auth-url?projectId=${projectId}`,
    popup:    'metaads_oauth',
  },
]

// Estado visual de una integración: 'off' (gris, click para conectar) · 'on' (verde,
// conectada y funcionando) · 'warn' (ámbar — expirada/error, o conectada pero le falta
// un campo obligatorio como el Property ID de GA4).
function integrationState(integ, connected) {
  if (!connected) return { state: 'off' }
  if (connected.status === 'expired') return { state: 'warn', reason: 'expired' }
  if (connected.status === 'error')   return { state: 'warn', reason: 'error' }
  if (integ.requiredField && !connected[integ.requiredField]) return { state: 'warn', reason: 'missingConfig' }
  return { state: 'on' }
}

const CHIP_STATE_CLASS = {
  on:   'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400',
  warn: 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400',
  off:  'bg-gray-50 dark:bg-gray-700/40 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 opacity-70 hover:opacity-100',
}

const DOT_STATE_CLASS = {
  on:   'bg-emerald-500',
  warn: 'bg-amber-400',
  off:  'bg-gray-300 dark:bg-gray-500',
}

// Chip compacto — reemplaza la vieja card de ancho completo. Desconectado = gris
// opaco y un click conecta directo; conectado/con problema = coloreado y un click
// expande el panel de detalle debajo.
function IntegrationChip({ integ, state, loading, expanded, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={integ.desc}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-wait ${CHIP_STATE_CLASS[state]} ${expanded ? 'ring-2 ring-primary-400 ring-offset-1 ring-offset-white dark:ring-offset-gray-800' : ''}`}
    >
      <span className="text-sm leading-none">{integ.icon}</span>
      <span>{integ.label}</span>
      {loading ? (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full inline-block ${DOT_STATE_CLASS[state]}`} />
      )}
    </button>
  )
}

export default function ProjectInfoTab({ project, onSave }) {
  const { enabled: marketingEnabled } = useFeatureFlag('marketing')

  const [websiteUrl, setWebsiteUrl] = useState(project.websiteUrl ?? '')
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [error, setError]           = useState('')

  // Integraciones (Google + Sociales — misma lista de la API)
  const {
    integrations,
    loading: integLoading,
    propSaving,
    getIntegration,
    reload: reloadIntegrations,
    connect: connectGoogle,
    disconnect: disconnectIntegration,
    savePropertyId,
    saveCustomerId,
  } = useGoogleIntegration(project.id, { enabled: marketingEnabled })

  const [propertyInput, setPropertyInput] = useState({})
  const [managerInput,  setManagerInput]  = useState({})   // Google Ads: Manager/MCC ID
  const [socialLoading, setSocialLoading] = useState({})
  const [expandedKey,   setExpandedKey]   = useState(null) // key de la única integración expandida

  async function handleConnect(type) {
    await connectGoogle(type)
  }

  async function handleDisconnect(type) {
    await disconnectIntegration(type)
    setExpandedKey(null)
  }

  async function handleConnectSocial(integ) {
    setSocialLoading(prev => ({ ...prev, [integ.key]: true }))
    try {
      const { data } = await api.get(integ.authPath(project.id))
      localStorage.removeItem('__ga_oauth_result')
      window.open(data.url, integ.popup, 'width=520,height=660,left=200,top=80')

      const TIMEOUT_MS = 5 * 60 * 1000
      const startedAt  = Date.now()
      const poll = setInterval(() => {
        const stored = localStorage.getItem('__ga_oauth_result')
        if (stored) {
          clearInterval(poll)
          localStorage.removeItem('__ga_oauth_result')
          try {
            const result = JSON.parse(stored)
            setSocialLoading(prev => ({ ...prev, [integ.key]: false }))
            if (result.success) reloadIntegrations()
          } catch { /* ignorar */ }
          return
        }
        if (Date.now() - startedAt > TIMEOUT_MS) {
          clearInterval(poll)
          setSocialLoading(prev => ({ ...prev, [integ.key]: false }))
        }
      }, 600)
    } catch {
      setSocialLoading(prev => ({ ...prev, [integ.key]: false }))
    }
  }

  // Click en un chip: desconectado → conecta directo; conectado/con problema → expande el detalle.
  function handleChipClick(integ, kind) {
    const connected = getIntegration(integ.key)
    if (!connected) {
      kind === 'google' ? handleConnect(integ.key) : handleConnectSocial(integ)
    } else {
      setExpandedKey(k => k === integ.key ? null : integ.key)
    }
  }

  async function handleSavePropertyId(type) {
    const val = propertyInput[type]?.trim()
    if (!val) return
    const res = await savePropertyId(type, val)
    if (res.ok) setPropertyInput(prev => ({ ...prev, [type]: '' }))
  }

  async function handleSaveCustomerId(type) {
    const val = propertyInput[type]?.trim()
    if (!val) return
    const res = await saveCustomerId(type, val)
    if (res.ok) setPropertyInput(prev => ({ ...prev, [type]: undefined }))
  }

  async function handleSaveManagerId(type) {
    const val = managerInput[type]?.trim()
    const res = await savePropertyId(type, val || null)
    if (res.ok) setManagerInput(prev => ({ ...prev, [type]: undefined }))
  }

  function isDirty() {
    return websiteUrl.trim() !== (project.websiteUrl ?? '')
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const { data } = await api.patch(`/projects/${project.id}/info`, { websiteUrl: websiteUrl.trim() || null })
      onSave({ websiteUrl: data.websiteUrl })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  // Renderiza el panel de detalle de UNA integración (debajo de la fila de chips del
  // grupo al que pertenece), solo si es la que está expandida. `kind` distingue el
  // flujo de conexión (Google vs. popup social) y qué campos extra mostrar.
  function renderDetail(integ, kind) {
    if (expandedKey !== integ.key) return null
    const connected = getIntegration(integ.key)
    if (!connected) return null
    const { state, reason } = integrationState(integ, connected)
    const isLoading = kind === 'google' ? integLoading[integ.key] : (socialLoading[integ.key] || integLoading[integ.key])
    const reconnect = () => kind === 'google' ? handleConnect(integ.key) : handleConnectSocial(integ)

    return (
      <div className="w-full border border-gray-200 dark:border-gray-600 rounded-xl p-4 space-y-3 mt-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl flex-shrink-0">{integ.icon}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{integ.label}</p>
              <p className="text-xs text-gray-400 truncate">{integ.desc}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {reason === 'expired' && (
              <button onClick={reconnect} disabled={isLoading} className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50">
                {isLoading ? 'Reconectando…' : 'Reconectar (expiró)'}
              </button>
            )}
            {reason === 'error' && (
              <button onClick={reconnect} disabled={isLoading} className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50">
                {isLoading ? 'Reconectando…' : 'Reconectar (error)'}
              </button>
            )}
            <button
              onClick={() => handleDisconnect(integ.key)}
              disabled={isLoading}
              className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors"
            >
              {isLoading ? '…' : 'Desconectar'}
            </button>
            <button
              onClick={() => setExpandedKey(null)}
              className="text-gray-300 hover:text-gray-500 dark:hover:text-gray-300 transition-colors"
              title="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Property ID para GA4 */}
        {integ.key === 'google_analytics' && (
          <div>
            {connected.propertyId ? (
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Property ID: <span className="font-mono text-gray-600 dark:text-gray-300">{connected.propertyId}</span>
                </p>
                <button
                  onClick={() => setPropertyInput(prev => ({ ...prev, [integ.key]: connected.propertyId }))}
                  className="text-xs text-gray-400 hover:text-primary-500 transition-colors"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Ingresá el GA4 Property ID para ver los datos
              </p>
            )}
            {(propertyInput[integ.key] !== undefined || !connected.propertyId) && (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={propertyInput[integ.key] ?? ''}
                  onChange={e => setPropertyInput(prev => ({ ...prev, [integ.key]: e.target.value }))}
                  placeholder="349398319  (solo el número)"
                  className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  onClick={() => handleSavePropertyId(integ.key)}
                  disabled={propSaving[integ.key] || !propertyInput[integ.key]?.trim()}
                  className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  {propSaving[integ.key] ? '…' : 'Guardar'}
                </button>
                {connected.propertyId && (
                  <button
                    onClick={() => setPropertyInput(prev => ({ ...prev, [integ.key]: undefined }))}
                    className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Customer ID + Manager ID para Google Ads */}
        {integ.key === 'google_ads' && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Customer ID <span className="text-red-400">*</span>
              </p>
              {connected.customerId ? (
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-gray-600 dark:text-gray-300">{connected.customerId}</span>
                  <button
                    onClick={() => setPropertyInput(prev => ({ ...prev, [integ.key]: connected.customerId }))}
                    className="text-xs text-gray-400 hover:text-primary-500 transition-colors"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Requerido — ID de la cuenta cliente (ej: 123-456-7890)
                </p>
              )}
              {(propertyInput[integ.key] !== undefined || !connected.customerId) && (
                <div className="flex gap-2 mt-1.5">
                  <input
                    type="text"
                    value={propertyInput[integ.key] ?? ''}
                    onChange={e => setPropertyInput(prev => ({ ...prev, [integ.key]: e.target.value }))}
                    placeholder="123-456-7890"
                    className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    onClick={() => handleSaveCustomerId(integ.key)}
                    disabled={propSaving[integ.key] || !propertyInput[integ.key]?.trim()}
                    className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                  >
                    {propSaving[integ.key] ? '…' : 'Guardar'}
                  </button>
                  {connected.customerId && (
                    <button
                      onClick={() => setPropertyInput(prev => ({ ...prev, [integ.key]: undefined }))}
                      className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Manager ID <span className="text-gray-400 font-normal">(MCC — si la cuenta cliente está bajo un Manager Account)</span>
              </p>
              {connected.propertyId ? (
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-gray-600 dark:text-gray-300">{connected.propertyId}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setManagerInput(prev => ({ ...prev, [integ.key]: connected.propertyId }))}
                      className="text-xs text-gray-400 hover:text-primary-500 transition-colors"
                    >
                      Cambiar
                    </button>
                    <button
                      onClick={() => savePropertyId(integ.key, null)}
                      disabled={propSaving[integ.key]}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Sin Manager ID — la cuenta es directa o ya tenés acceso sin MCC
                </p>
              )}
              {managerInput[integ.key] !== undefined && (
                <div className="flex gap-2 mt-1.5">
                  <input
                    type="text"
                    value={managerInput[integ.key] ?? ''}
                    onChange={e => setManagerInput(prev => ({ ...prev, [integ.key]: e.target.value }))}
                    placeholder="123-456-7890  (ID del Manager Account)"
                    className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    onClick={() => handleSaveManagerId(integ.key)}
                    disabled={propSaving[integ.key]}
                    className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                  >
                    {propSaving[integ.key] ? '…' : 'Guardar'}
                  </button>
                  <button
                    onClick={() => setManagerInput(prev => ({ ...prev, [integ.key]: undefined }))}
                    className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              )}
              {managerInput[integ.key] === undefined && !connected.propertyId && (
                <button
                  onClick={() => setManagerInput(prev => ({ ...prev, [integ.key]: '' }))}
                  className="mt-1 text-xs text-primary-600 dark:text-primary-400 hover:underline"
                >
                  + Agregar Manager ID
                </button>
              )}
            </div>
          </div>
        )}

        {/* Site URL para Search Console (opcional; por defecto usa websiteUrl del proyecto) */}
        {integ.key === 'google_search_console' && (
          <div>
            {connected.propertyId ? (
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Site URL: <span className="font-mono text-gray-600 dark:text-gray-300 break-all">{connected.propertyId}</span>
                </p>
                <button
                  onClick={() => setPropertyInput(prev => ({ ...prev, [integ.key]: connected.propertyId }))}
                  className="text-xs text-gray-400 hover:text-primary-500 transition-colors ml-2 flex-shrink-0"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                Site URL: se usa la URL del sitio del proyecto
                {project.websiteUrl && (
                  <span className="font-mono ml-1 text-gray-500 dark:text-gray-400">({project.websiteUrl})</span>
                )}
              </p>
            )}
            {propertyInput[integ.key] !== undefined && (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={propertyInput[integ.key] ?? ''}
                  onChange={e => setPropertyInput(prev => ({ ...prev, [integ.key]: e.target.value }))}
                  placeholder="https://ejemplo.com/ o sc-domain:ejemplo.com"
                  className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  onClick={() => handleSavePropertyId(integ.key)}
                  disabled={propSaving[integ.key] || !propertyInput[integ.key]?.trim()}
                  className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  {propSaving[integ.key] ? '…' : 'Guardar'}
                </button>
                <button
                  onClick={() => setPropertyInput(prev => ({ ...prev, [integ.key]: undefined }))}
                  className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            )}
            {!connected.propertyId && propertyInput[integ.key] === undefined && (
              <button
                onClick={() => setPropertyInput(prev => ({ ...prev, [integ.key]: '' }))}
                className="text-xs text-primary-500 hover:text-primary-600 mt-1 transition-colors"
              >
                Usar una URL diferente
              </button>
            )}
          </div>
        )}

        {/* Info simple (ID + fecha) para las integraciones sin config propia */}
        {!['google_analytics', 'google_ads', 'google_search_console'].includes(integ.key) && connected.propertyId && (
          <p className="text-xs text-gray-400">
            ID: <span className="font-mono text-gray-500 dark:text-gray-400">{connected.propertyId}</span>
            {connected.connectedAt && (
              <span className="ml-2">· conectado {new Date(connected.connectedAt).toLocaleDateString('es-AR')}</span>
            )}
          </p>
        )}
      </div>
    )
  }

  // Todo lo que gestiona este componente (sitio web para GEO + integraciones) es
  // parte de Marketing — sin el flag no hay nada útil que mostrar acá.
  if (!marketingEnabled) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-6">

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

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !isDirty()}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
        >
          {saving ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar'}
        </button>
        {saved && <span className="text-sm text-emerald-500">Los cambios se guardaron correctamente</span>}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Integraciones Google
        </p>
        <div className="flex flex-wrap gap-2">
          {GOOGLE_INTEGRATIONS.map(integ => {
            const connected = getIntegration(integ.key)
            const { state } = integrationState(integ, connected)
            return (
              <IntegrationChip
                key={integ.key}
                integ={integ}
                state={state}
                loading={integLoading[integ.key]}
                expanded={expandedKey === integ.key}
                onClick={() => handleChipClick(integ, 'google')}
              />
            )
          })}
        </div>
        {GOOGLE_INTEGRATIONS.map(integ => <div key={integ.key}>{renderDetail(integ, 'google')}</div>)}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Integraciones Redes Sociales
        </p>
        <div className="flex flex-wrap gap-2">
          {SOCIAL_INTEGRATIONS.map(integ => {
            const connected = getIntegration(integ.key)
            const { state } = integrationState(integ, connected)
            const loading = socialLoading[integ.key] || integLoading[integ.key]
            return (
              <IntegrationChip
                key={integ.key}
                integ={integ}
                state={state}
                loading={loading}
                expanded={expandedKey === integ.key}
                onClick={() => handleChipClick(integ, 'social')}
              />
            )
          })}
        </div>
        {SOCIAL_INTEGRATIONS.map(integ => <div key={integ.key}>{renderDetail(integ, 'social')}</div>)}
      </div>

    </div>
  )
}
