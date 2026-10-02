import { useState } from 'react'
import api from '../../../api/client'
import { NetworkMark } from './ui'
import useOAuthPopup from './useOAuthPopup'

// Pantalla única de "conectar" para todas las redes y anuncios de Marketing:
// sello de la red + título + una tarjeta por método de conexión (OAuth oficial,
// token de Business Manager, scraping…). Con un solo método la tarjeta queda
// abierta; con varios funcionan como acordeón y arranca abierto el recomendado.

const BADGES = {
  recommended: { text: 'Recomendado',  cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  soon:        { text: 'Próximamente', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
}

/**
 * @param {object}   brand      entrada de BRANDS
 * @param {string}   title
 * @param {string}   [subtitle]
 * @param {object[]} methods    [{ key, title, description, badge?: 'recommended'|'soon', body }]
 */
export default function ConnectScreen({ brand, title, subtitle, methods }) {
  const usable = methods.filter(m => m.badge !== 'soon')
  const initial = (usable.find(m => m.badge === 'recommended') ?? usable[0])?.key ?? null
  const [open, setOpen] = useState(initial)
  const single = methods.length === 1

  return (
    <div className="max-w-xl mx-auto py-10">
      <div className="text-center mb-6">
        <NetworkMark brand={brand} size="lg" className="mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">{subtitle}</p>}
      </div>

      <div className="space-y-3">
        {methods.map(m => {
          const soon = m.badge === 'soon'
          const isOpen = !soon && (single || open === m.key)
          const badge = BADGES[m.badge]
          const head = (
            <>
              <span className="flex-1 min-w-0 text-left">
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{m.title}</span>
                  {badge && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.text}</span>}
                </span>
                {m.description && <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{m.description}</span>}
              </span>
            </>
          )
          return (
            <div key={m.key}
              className={`bg-white dark:bg-gray-800 border rounded-xl overflow-hidden ${isOpen && !single ? 'border-gray-300 dark:border-gray-600 shadow-sm' : 'border-gray-200 dark:border-gray-700'} ${soon ? 'opacity-60' : ''}`}>
              {single || soon ? (
                <div className="flex items-start gap-3 px-4 py-3">{head}</div>
              ) : (
                <button type="button" onClick={() => setOpen(isOpen ? null : m.key)} aria-expanded={isOpen}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                  {head}
                  <svg className={`w-4 h-4 mt-1 text-gray-400 transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
              {isOpen && m.body && (
                <div className={`px-4 pb-4 ${single ? '' : 'pt-3 border-t border-gray-100 dark:border-gray-700/60'}`}>{m.body}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Botón principal con el color de la marca.
export function BrandButton({ brand, onClick, disabled, loading, loadingLabel = 'Conectando…', type = 'button', className = '', children }) {
  const light = brand.markBorder
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading}
      className={`w-full px-4 py-2.5 text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity ${className}`}
      style={{ background: light ? brand.color : brand.mark }}>
      {loading ? loadingLabel : children}
    </button>
  )
}

export function FormError({ children }) {
  if (!children) return null
  return <p role="alert" className="text-xs text-red-600 dark:text-red-400">{children}</p>
}

export function TextField({ textarea = false, className = '', ...props }) {
  const cls = `w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 ${className}`
  return textarea ? <textarea rows={3} className={`${cls} font-mono text-xs resize-none`} {...props} /> : <input className={cls} {...props} />
}

/**
 * Cuerpo de un método OAuth: un texto opcional + botón que abre el popup.
 * `getAuthUrl` devuelve la URL de autorización (cada red tiene su endpoint).
 */
export function OAuthMethod({ brand, getAuthUrl, onConnected, cta, closedMessage, note }) {
  const { start, loading, error } = useOAuthPopup({
    getAuthUrl, integrationType: brand.integrationType, label: brand.label, onConnected, closedMessage,
  })
  return (
    <div className="space-y-2">
      {note && <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{note}</p>}
      <FormError>{error}</FormError>
      <BrandButton brand={brand} onClick={start} loading={loading}>{cta ?? `Conectar con ${brand.label}`}</BrandButton>
    </div>
  )
}

/**
 * Selector de cuenta para los flujos de token que encuentran varias cuentas
 * (páginas de Facebook, cuentas de Instagram, cuentas publicitarias de Meta).
 */
export function AccountPicker({ accounts, onPick, onBack, busy, renderSub }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Encontramos {accounts.length} cuentas. Elegí cuál conectar a este proyecto:</p>
      <div className="space-y-1.5 max-h-56 overflow-y-auto">
        {accounts.map(a => {
          const name = a.username ? `@${a.username}` : (a.name || a.id)
          const sub = renderSub ? renderSub(a) : (a.username && a.name && a.name !== a.username ? a.name : null)
          return (
            <button key={a.id} type="button" onClick={() => onPick(a.id)} disabled={busy}
              className="w-full flex items-center gap-2.5 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors text-left disabled:opacity-50">
              <span className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 text-xs font-bold shrink-0">
                {String(name).replace('@', '')[0]?.toUpperCase() ?? '?'}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{name}</span>
                {sub && <span className="block text-[11px] text-gray-400 truncate">{sub}</span>}
              </span>
            </button>
          )
        })}
      </div>
      <button type="button" onClick={onBack} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline underline-offset-2">← Usar otro token</button>
    </div>
  )
}

/**
 * Cuerpo de un método por token de Business Manager (System User Token).
 * Si el token ve varias cuentas, el backend devuelve `accounts` y se muestra el
 * selector; elegir una reenvía el token con `accountParam` = id elegido.
 */
export function TokenMethod({ brand, endpoint, accountParam, steps, onConnected, renderAccountSub }) {
  const [token,    setToken]    = useState('')
  const [accounts, setAccounts] = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  async function connect(accountId) {
    if (!token.trim()) { setError('Pegá el token de acceso.'); return }
    setLoading(true); setError(null)
    try {
      const body = { accessToken: token.trim() }
      if (accountId) body[accountParam] = accountId
      const { data } = await api.post(endpoint, body)
      if (data.accounts) { setAccounts(data.accounts); return }
      onConnected?.()
    } catch (err) {
      setError(err.response?.data?.error || 'Token inválido o sin permisos suficientes.')
    } finally { setLoading(false) }
  }

  if (accounts) return (
    <div className="space-y-2">
      <AccountPicker accounts={accounts} onPick={connect} busy={loading} renderSub={renderAccountSub}
        onBack={() => { setAccounts(null); setError(null) }} />
      <FormError>{error}</FormError>
    </div>
  )

  return (
    <form onSubmit={e => { e.preventDefault(); connect() }} className="space-y-3">
      {steps && (
        <details className="group text-xs text-gray-500 dark:text-gray-400">
          <summary className="cursor-pointer font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Cómo generar el token</summary>
          <div className="mt-2 leading-relaxed">{steps}</div>
        </details>
      )}
      <TextField textarea value={token} onChange={e => setToken(e.target.value)} placeholder="Pegá el System User Token (EAAB…)" aria-label="System User Token" />
      <FormError>{error}</FormError>
      <BrandButton brand={brand} type="submit" loading={loading} loadingLabel="Verificando…" disabled={!token.trim()}>Conectar con token</BrandButton>
    </form>
  )
}

/**
 * Cuerpo de un método por scraping: se pega el perfil público y el backend hace
 * un primer scrape para validarlo.
 */
export function ScrapeMethod({ brand, endpoint, placeholder, help, onConnected }) {
  const [value,   setValue]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  async function submit(e) {
    e.preventDefault()
    if (!value.trim()) { setError('Pegá el usuario o la URL del perfil.'); return }
    setLoading(true); setError(null)
    try {
      await api.post(endpoint, { url: value.trim() })
      onConnected?.()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo conectar por scraping.')
    } finally { setLoading(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <TextField value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} aria-label="Perfil público" />
      {help && <p className="text-[11px] text-gray-400 dark:text-gray-500">{help}</p>}
      <FormError>{error}</FormError>
      <BrandButton brand={brand} type="submit" loading={loading} loadingLabel="Analizando el perfil…" disabled={!value.trim()}>Conectar por scraping</BrandButton>
    </form>
  )
}

/**
 * Estado "la conexión venció": mismo aviso para todas las redes, con la acción
 * de reconectar adentro (normalmente un <OAuthMethod> con cta "Reconectar").
 */
export function ExpiredNotice({ brand, children, className = 'py-10' }) {
  return (
    <div className={`max-w-xl mx-auto ${className}`}>
      <div className="bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-800 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <NetworkMark brand={brand} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900 dark:text-white">La conexión con {brand.label} venció</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Mientras no la reconectes no entran datos nuevos (tampoco a los informes). Lo ya guardado se conserva.
            </p>
            {children && <div className="mt-4">{children}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
