import { TriangleAlert } from 'lucide-react'
import { Icon } from '../../ui/Icon'

// ─── Panel de error de Search Console (con acciones inline) ──────────────────
export default function GscErrorPanel({ error, loading, saving, siteUrlInput, setSiteUrlInput, onReconnect, onSaveSiteUrl }) {
  const code = error.code
  const type = error.type

  // Tipos donde mostramos botón de reconectar OAuth
  const canReconnect = ['no_integration', 'no_access', 'revoked', 'api_disabled'].includes(type)
  // Tipos donde mostramos opción de cambiar Site URL
  const canEditSiteUrl = ['no_access', 'bad_url', 'no_site_url'].includes(type)

  const title = {
    no_integration: 'Search Console no conectado',
    no_access:      'Sin acceso a esta propiedad',
    revoked:        'Token de Google expirado',
    bad_url:        'URL de sitio inválida',
    no_site_url:    'Falta configurar el Site URL',
    api_disabled:   'API de Search Console deshabilitada',
    generic:        'Error al cargar Search Console',
  }[type] ?? 'Error al cargar Search Console'

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 mt-0.5"><Icon as={TriangleAlert} size={18} className="inline-block text-amber-500" /></span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">{title}</p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">{error.msg}</p>
          {error.siteUrl && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Site URL probado: <span className="font-mono">{error.siteUrl}</span>
            </p>
          )}
        </div>
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap gap-2 pl-8">
        {canReconnect && (
          <button
            onClick={onReconnect}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {loading ? 'Conectando…' : type === 'no_integration' ? 'Conectar Search Console' : 'Reconectar con otra cuenta'}
          </button>
        )}
        {canEditSiteUrl && siteUrlInput === null && (
          <button
            onClick={() => setSiteUrlInput(error.siteUrl ?? '')}
            className="px-3 py-1.5 text-xs font-medium border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-200 rounded-lg transition-colors"
          >
            Cambiar Site URL
          </button>
        )}
      </div>

      {/* Input inline para Site URL */}
      {siteUrlInput !== null && (
        <div className="pl-8 space-y-2">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Probá una variante: con/sin <code className="font-mono">www</code>, con barra final, o como{' '}
            <code className="font-mono">sc-domain:ejemplo.com</code> (Domain property).
          </p>
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={siteUrlInput}
              onChange={e => setSiteUrlInput(e.target.value)}
              placeholder="https://ejemplo.com/ o sc-domain:ejemplo.com"
              className="flex-1 border border-amber-300 dark:border-amber-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
              onKeyDown={e => { if (e.key === 'Enter' && siteUrlInput.trim()) onSaveSiteUrl(siteUrlInput) }}
            />
            <button
              onClick={() => onSaveSiteUrl(siteUrlInput)}
              disabled={saving || !siteUrlInput.trim()}
              className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {saving ? '…' : 'Guardar'}
            </button>
            <button
              onClick={() => setSiteUrlInput(null)}
              className="px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300 hover:text-amber-900 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {code === 'TOKEN_EXPIRED' && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 pl-8">
          Si esto te pasa con frecuencia, verificá que la app OAuth de Google esté publicada (no en "Testing") — Google expira refresh tokens cada 7 días en modo Testing.
        </p>
      )}
    </div>
  )
}
