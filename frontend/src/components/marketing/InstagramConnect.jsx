import { useState, useRef } from 'react'
import api from '../../api/client'
import SocialIcon from './SocialIcon'

// ── Estado vacío (sin integración) ────────────────────────────────────────────

export default function ConnectPrompt({ projectId, onConnected }) {
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState(null)
  const [expanded,      setExpanded]      = useState('token') // 'official' | 'token' | 'scrape' | null
  const [manualToken,   setManualToken]   = useState('')
  const [manualLoading, setManualLoading] = useState(false)
  const [accounts,      setAccounts]      = useState(null) // lista cuando hay múltiples
  const [scrapeInput,   setScrapeInput]   = useState('')
  const [scrapeLoading, setScrapeLoading] = useState(false)
  const pollRef = useRef(null)

  const toggle = (key) => { setExpanded(prev => prev === key ? null : key); setError(null) }

  const handleScrapeConnect = async () => {
    if (!scrapeInput.trim()) { setError('Pegá el usuario o la URL del perfil.'); return }
    setScrapeLoading(true)
    setError(null)
    try {
      await api.post(
        `/marketing/projects/${projectId}/integrations/instagram/connect-scrape`,
        { url: scrapeInput.trim() },
      )
      onConnected()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo conectar por scraping.')
    } finally {
      setScrapeLoading(false)
    }
  }

  const handleConnect = async () => {
    if (!projectId) { setError('Seleccioná un proyecto primero.'); return }
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/marketing/integrations/meta/auth-url', { params: { projectId } })
      localStorage.removeItem('__ga_oauth_result')
      const popup = window.open(data.url, 'meta_oauth', 'width=520,height=660,left=200,top=100')

      let elapsed = 0
      pollRef.current = setInterval(async () => {
        elapsed += 600
        try {
          const raw = localStorage.getItem('__ga_oauth_result')
          if (raw) {
            const result = JSON.parse(raw)
            localStorage.removeItem('__ga_oauth_result')
            clearInterval(pollRef.current)
            setLoading(false)
            if (result.success && result.integrationType === 'instagram') onConnected()
            else setError(result.error || 'Error al conectar Instagram.')
            return
          }
        } catch { /* ignorar */ }
        if (popup?.closed) { clearInterval(pollRef.current); setLoading(false) }
        if (elapsed >= 5 * 60 * 1000) {
          clearInterval(pollRef.current); setLoading(false)
          setError('La conexión tardó demasiado. Intentá de nuevo.')
        }
      }, 600)
    } catch (err) {
      setLoading(false)
      setError(err.response?.data?.error || 'No se pudo iniciar la conexión.')
    }
  }

  const handleManualConnect = async (igAccountId = null) => {
    if (!manualToken.trim()) { setError('Pegá el token de acceso.'); return }
    setManualLoading(true)
    setError(null)
    try {
      const body = { accessToken: manualToken.trim() }
      if (igAccountId) body.igAccountId = igAccountId
      const { data } = await api.post(
        `/marketing/projects/${projectId}/integrations/instagram/connect-token`,
        body,
      )
      if (data.accounts) {
        // Múltiples cuentas — mostrar picker
        setAccounts(data.accounts)
      } else {
        onConnected()
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Token inválido o sin permisos suficientes.')
    } finally {
      setManualLoading(false)
    }
  }

  const chevron = (open) => (
    <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
  )

  return (
    <div className="max-w-lg mx-auto py-10">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center text-white mb-4 mx-auto"><SocialIcon network="instagram" className="w-8 h-8" /></div>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">Conectá Instagram</h3>
        <p className="text-sm text-gray-400 dark:text-gray-500">Elegí cómo querés traer los datos de la cuenta.</p>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-4 text-center">{error}</p>}
      {!projectId && <p className="text-xs text-gray-400 mb-4 text-center">Seleccioná un proyecto para continuar.</p>}

      <div className="space-y-3">

        {/* Método 1 — Conexión oficial (Instagram Business Login) */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="w-full flex items-center gap-3 px-4 py-3">
            <span className="text-xl shrink-0">🔗</span>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Conexión oficial</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Instagram Business Login — directo, sin tokens</p>
            </div>
          </div>
          <div className="px-4 pb-3 -mt-1">
            <button
              onClick={handleConnect}
              disabled={loading || !projectId}
              className="w-full py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? 'Conectando…' : 'Conectar con Instagram'}
            </button>
          </div>
        </div>

        {/* Método 2 — Token de Business Manager (recomendado) */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <button
            onClick={() => toggle('token')}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <span className="text-xl shrink-0">🔑</span>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Token de Business Manager</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">System User Token — datos completos vía API</p>
            </div>
            <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-2 py-1 rounded-full shrink-0">Recomendado</span>
            {chevron(expanded === 'token')}
          </button>

          {expanded === 'token' && (
            <div className="px-4 pb-4 pt-1 text-left space-y-3 border-t border-gray-100 dark:border-gray-700/50">
              {/* Picker de cuentas (paso 2 cuando hay múltiples) */}
              {accounts ? (
                <>
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                    Encontramos {accounts.length} cuentas. Elegí cuál conectar a este proyecto:
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {accounts.map(acc => (
                      <button
                        key={acc.id}
                        onClick={() => handleManualConnect(acc.id)}
                        disabled={manualLoading}
                        className="w-full flex items-center gap-2.5 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors text-left disabled:opacity-50"
                      >
                        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {(acc.username || acc.name || '?')[0].toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                            {acc.username ? `@${acc.username}` : acc.name || acc.id}
                          </p>
                          {acc.username && acc.name && acc.name !== acc.username && (
                            <p className="text-[10px] text-gray-400 truncate">{acc.name}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setAccounts(null)}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline underline-offset-2"
                  >
                    ← Usar otro token
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Cómo obtener el token desde Business Manager:</p>
                    <ol className="text-xs text-gray-500 dark:text-gray-400 list-decimal list-inside space-y-1 leading-relaxed">
                      <li>Abrí <span className="font-mono">business.facebook.com</span> → Configuración del negocio</li>
                      <li>Usuarios del sistema → Agregar usuario del sistema (rol: Empleado o Admin)</li>
                      <li>Asegurate de que las cuentas de Instagram estén asignadas al usuario del sistema</li>
                      <li>Hacé clic en el usuario del sistema → <strong>Generar nuevo token de acceso</strong></li>
                      <li>Seleccioná la app <strong>BlissTracker</strong> y activá: <span className="font-mono">business_management</span>, <span className="font-mono">instagram_basic</span>, <span className="font-mono">instagram_manage_insights</span>, <span className="font-mono">pages_show_list</span>. <strong>El permiso <span className="font-mono">business_management</span> es clave</strong> para ver las cuentas de clientes administradas vía Business Manager.</li>
                      <li>Copiá el token y pegalo abajo</li>
                    </ol>
                  </div>
                  <textarea
                    value={manualToken}
                    onChange={e => setManualToken(e.target.value)}
                    placeholder="EAABwz..."
                    rows={3}
                    className="w-full text-xs font-mono bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                  />
                  <button
                    onClick={() => handleManualConnect()}
                    disabled={manualLoading || !manualToken.trim()}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {manualLoading ? 'Verificando…' : 'Conectar con token'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Método 3 — Scraping */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <button
            onClick={() => toggle('scrape')}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <span className="text-xl shrink-0">🔎</span>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Scraping</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Sin conexión — datos públicos del perfil</p>
            </div>
            {chevron(expanded === 'scrape')}
          </button>

          {expanded === 'scrape' && (
            <div className="px-4 pb-4 pt-1 text-left space-y-3 border-t border-gray-100 dark:border-gray-700/50">
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Pegá el usuario o la URL del perfil <strong>público</strong>. Traemos seguidores, publicaciones e interacciones por scraping. Ideal cuando no podés usar la API. Las cuentas privadas no se pueden analizar.
              </p>
              <input
                type="text"
                value={scrapeInput}
                onChange={e => setScrapeInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleScrapeConnect() }}
                placeholder="@usuario o https://instagram.com/usuario"
                className="w-full text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <button
                onClick={handleScrapeConnect}
                disabled={scrapeLoading || !scrapeInput.trim()}
                className="w-full py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {scrapeLoading ? 'Analizando perfil…' : 'Conectar por scraping'}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
