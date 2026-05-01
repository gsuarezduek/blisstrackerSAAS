import { useState, useEffect } from 'react'
import api from '../api/client'

const CONNECTIONS = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/usuario',    icon: '📸' },
  { key: 'tiktok',    label: 'TikTok',    placeholder: 'https://tiktok.com/@usuario',      icon: '🎵' },
  { key: 'linkedin',  label: 'LinkedIn',  placeholder: 'https://linkedin.com/company/...', icon: '💼' },
  { key: 'youtube',   label: 'YouTube',   placeholder: 'https://youtube.com/@canal',       icon: '▶️' },
]

const GOOGLE_INTEGRATIONS = [
  {
    key:   'google_analytics',
    label: 'Google Analytics (GA4)',
    icon:  '📊',
    desc:  'Ver sesiones, usuarios y páginas en Marketing → Web',
  },
  {
    key:   'google_search_console',
    label: 'Google Search Console',
    icon:  '🔍',
    desc:  'Ver clicks, impresiones y palabras clave en Marketing → SEO',
  },
  {
    key:        'google_ads',
    label:      'Google Ads',
    icon:       '📣',
    desc:       'Ver impresiones, clics y conversiones',
    comingSoon: true,
  },
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

  // Integraciones Google
  const [integrations,  setIntegrations]  = useState([])
  const [integLoading,  setIntegLoading]  = useState({})
  const [propertyInput, setPropertyInput] = useState({})
  const [propSaving,    setPropSaving]    = useState({})

  // Cargar integraciones del proyecto
  useEffect(() => {
    api.get(`/marketing/projects/${project.id}/integrations`)
      .then(r => setIntegrations(r.data))
      .catch(() => {})
  }, [project.id])

  function getIntegration(type) {
    return integrations.find(i => i.type === type)
  }

  async function handleConnect(type) {
    setIntegLoading(prev => ({ ...prev, [type]: true }))
    try {
      const { data } = await api.get(
        `/marketing/integrations/google/auth-url?projectId=${project.id}&type=${type}`
      )

      // Si el workspace ya tiene tokens de otro proyecto, intentar reutilizarlos
      // Solo si no se está forzando reconexión (forceOAuth)
      if (data.hasExistingTokens && !data.forceOAuth) {
        try {
          const r = await api.post(
            `/marketing/projects/${project.id}/integrations/connect-existing?type=${type}`
          )
          setIntegrations(prev => {
            const others = prev.filter(i => i.type !== type)
            return [...others, r.data]
          })
          setIntegLoading(prev => ({ ...prev, [type]: false }))
          return
        } catch {
          // Si falla la reutilización, caer al flujo OAuth completo
        }
      }

      // Primera vez: flujo OAuth con popup
      localStorage.removeItem('__ga_oauth_result')
      window.open(data.url, 'google_oauth', 'width=520,height=660,left=200,top=80')

      const TIMEOUT_MS = 5 * 60 * 1000
      const startedAt  = Date.now()
      const poll = setInterval(() => {
        const stored = localStorage.getItem('__ga_oauth_result')
        if (stored) {
          clearInterval(poll)
          localStorage.removeItem('__ga_oauth_result')
          try {
            const result = JSON.parse(stored)
            setIntegLoading(prev => ({ ...prev, [type]: false }))
            if (result.success) {
              api.get(`/marketing/projects/${project.id}/integrations`)
                .then(r => setIntegrations(r.data))
                .catch(() => {})
            }
          } catch { /* ignorar JSON inválido */ }
          return
        }
        if (Date.now() - startedAt > TIMEOUT_MS) {
          clearInterval(poll)
          setIntegLoading(prev => ({ ...prev, [type]: false }))
        }
      }, 600)
    } catch {
      setIntegLoading(prev => ({ ...prev, [type]: false }))
    }
  }

  async function handleDisconnect(type) {
    setIntegLoading(prev => ({ ...prev, [type]: true }))
    try {
      await api.delete(`/marketing/projects/${project.id}/integrations/${type}`)
      setIntegrations(prev => prev.filter(i => i.type !== type))
    } finally {
      setIntegLoading(prev => ({ ...prev, [type]: false }))
    }
  }

  async function handleSavePropertyId(type) {
    const val = propertyInput[type]?.trim()
    if (!val) return
    setPropSaving(prev => ({ ...prev, [type]: true }))
    try {
      const { data } = await api.patch(
        `/marketing/projects/${project.id}/integrations/${type}`,
        { propertyId: val }
      )
      setIntegrations(prev => prev.map(i => i.type === type ? { ...i, ...data } : i))
      setPropertyInput(prev => ({ ...prev, [type]: '' }))
    } finally {
      setPropSaving(prev => ({ ...prev, [type]: false }))
    }
  }

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

      {/* Redes sociales */}
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Redes sociales
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

      {/* Integraciones Google */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Integraciones Google
        </p>
        <div className="space-y-3">
          {GOOGLE_INTEGRATIONS.map(integ => {
            const connected = getIntegration(integ.key)
            const isLoading = integLoading[integ.key]
            const hasError  = connected?.status === 'error'

            return (
              <div
                key={integ.key}
                className="border border-gray-200 dark:border-gray-600 rounded-xl p-4 space-y-3"
              >
                {/* Cabecera */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xl flex-shrink-0">{integ.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{integ.label}</p>
                      <p className="text-xs text-gray-400 truncate">{integ.desc}</p>
                    </div>
                  </div>

                  {integ.comingSoon ? (
                    <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-1 rounded-full flex-shrink-0">
                      próximamente
                    </span>
                  ) : connected ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {hasError ? (
                        <span className="text-xs text-red-500 font-medium flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                          Error
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                          Conectado
                        </span>
                      )}
                      <button
                        onClick={() => handleDisconnect(integ.key)}
                        disabled={isLoading}
                        className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                      >
                        {isLoading ? '…' : 'Desconectar'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleConnect(integ.key)}
                      disabled={isLoading}
                      className="px-3 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg transition-colors flex-shrink-0"
                    >
                      {isLoading ? 'Conectando…' : 'Conectar'}
                    </button>
                  )}
                </div>

                {/* Property ID para GA4 */}
                {connected && integ.key === 'google_analytics' && (
                  <div>
                    {connected.propertyId ? (
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-400">
                          Property ID:{' '}
                          <span className="font-mono text-gray-600 dark:text-gray-300">
                            {connected.propertyId}
                          </span>
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
                    {hasError && (
                      <p className="text-xs text-red-500 mt-1">
                        El token fue revocado. Desconectá y volvé a conectar.
                      </p>
                    )}
                  </div>
                )}

                {/* Site URL para Search Console (opcional; por defecto usa websiteUrl del proyecto) */}
                {connected && integ.key === 'google_search_console' && (
                  <div>
                    {connected.propertyId ? (
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-400">
                          Site URL:{' '}
                          <span className="font-mono text-gray-600 dark:text-gray-300 break-all">
                            {connected.propertyId}
                          </span>
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
                          <span className="font-mono ml-1 text-gray-500 dark:text-gray-400">
                            ({project.websiteUrl})
                          </span>
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
                    {hasError && (
                      <p className="text-xs text-red-500 mt-1">
                        El token fue revocado. Desconectá y volvé a conectar.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
