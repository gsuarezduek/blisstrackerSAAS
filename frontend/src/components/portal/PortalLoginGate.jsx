import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import { Icon, PrimaryButton, readableOn, withAlpha } from './portalUi'

const API = import.meta.env.VITE_API_URL || ''
const tokenKey = (slug) => `bliss_client_token_${slug}`

/**
 * Gatea contenido del portal de cliente detrás del login por código OTP.
 * Extraído de ClientPortal.jsx (donde vivía inline, acoplado al tab "Datos en
 * vivo") para que F7 pueda reusar el mismo flujo en el tab "Contenido" sin
 * duplicar el formulario de email/código.
 *
 * axios crudo + VITE_API_URL a propósito — NO api/client.js: ese inyecta el
 * JWT del EQUIPO y el header X-Workspace; acá el token es el del CLIENTE (JWT
 * de propósito acotado, `purpose: 'client-portal-live'`).
 *
 * `children` es una función: `(token, { requireReauth }) => ReactNode`.
 * `requireReauth()` limpia el token guardado y vuelve al formulario — la llama
 * tanto este componente (ante un 401 de un fetch del hijo) como, en F7, un
 * fetch que reciba `code: 'CONTACT_REQUIRED'` (token válido pero sin
 * `contactId` — emitido antes de la migración a multi-contacto).
 *
 * `magicToken` (?mt= en la URL, ver ClientPortal.jsx): viene del email
 * "Pedir aprobación" de Contenido y deja entrar sin código durante 72h desde
 * ese envío. Se intercambia una sola vez por la sesión normal de 30 días —
 * el login por email/código sigue siendo el único camino "de siempre", esto
 * es solo un atajo puntual para esa ventana. Si venció o es inválido, cae
 * directo al formulario de siempre (sin romper nada).
 */
const RESEND_COOLDOWN_S = 30

/**
 * Pantalla de ingreso (layout propio, a pantalla completa). En desktop, panel
 * de marca a la izquierda (banner del portal o gradiente de brandColors) y el
 * formulario a la derecha; en mobile, el panel se reduce a una franja.
 * `agencyName`/`logoUrl`/`bannerUrl`/`brandSecondary` son solo presentación.
 */
export default function PortalLoginGate({ slug, brandPrimary = '#f97316', brandSecondary, projectName, agencyName, logoUrl, bannerUrl, magicToken, children }) {
  const [token, setToken] = useState(() => localStorage.getItem(tokenKey(slug)))
  const [loginStep,  setLoginStep]  = useState('email') // 'email' | 'code'
  const [email,      setEmail]      = useState('')
  const [code,       setCode]       = useState('')
  const [loginBusy,  setLoginBusy]  = useState(false)
  const [loginError, setLoginError] = useState(null)
  const [exchangingMagic, setExchangingMagic] = useState(!!magicToken)
  const [resendIn,   setResendIn]   = useState(0)
  const codeRef = useRef(null)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  useEffect(() => {
    if (!magicToken) return
    // Saca ?mt= de la barra de direcciones apenas se intenta consumir, haya
    // salido bien o mal — no queda un token de acceso directo dando vueltas
    // en el historial/URL compartible.
    const url = new URL(window.location.href)
    url.searchParams.delete('mt')
    window.history.replaceState(null, '', url.toString())

    axios.post(`${API}/api/public/client-portal/${slug}/live/magic-login`, { token: magicToken })
      .then(r => {
        localStorage.setItem(tokenKey(slug), r.data.token)
        setToken(r.data.token)
      })
      .catch(() => {
        setLoginError('Ese link de acceso directo venció o ya no es válido. Ingresá tu email para pedir un código.')
      })
      .finally(() => setExchangingMagic(false))
    // Se dispara una sola vez al montar con el magic-token de la URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Estable (useCallback): los hijos lo usan como dependencia de sus fetch —
  // una identidad nueva en cada render los haría recargar en loop.
  const requireReauth = useCallback(() => {
    localStorage.removeItem(tokenKey(slug))
    setToken(null)
    setLoginStep('email')
  }, [slug])

  async function handleRequestCode(e) {
    e?.preventDefault()
    setLoginBusy(true); setLoginError(null)
    try {
      await axios.post(`${API}/api/public/client-portal/${slug}/live/request-code`, { email: email.trim() })
      setLoginStep('code')
      setCode('')
      setResendIn(RESEND_COOLDOWN_S)
      setTimeout(() => codeRef.current?.focus(), 0)
    } catch (err) {
      setLoginError(err.response?.data?.error || 'No se pudo enviar el código')
    } finally { setLoginBusy(false) }
  }

  async function handleVerifyCode(e) {
    e?.preventDefault()
    setLoginBusy(true); setLoginError(null)
    try {
      const r = await axios.post(`${API}/api/public/client-portal/${slug}/live/verify-code`, { email: email.trim(), code: code.trim() })
      localStorage.setItem(tokenKey(slug), r.data.token)
      setToken(r.data.token)
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Ese código no es válido. Revisalo o pedí uno nuevo.')
    } finally { setLoginBusy(false) }
  }

  if (token) return children(token, { requireReauth })

  const secondary = brandSecondary || withAlpha(brandPrimary, 0.55)
  const onBrand = readableOn(brandPrimary)

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">
      {/* Panel de marca */}
      <div className="relative lg:w-[46%] min-h-[180px] lg:min-h-screen overflow-hidden"
        style={{ background: `linear-gradient(140deg, ${brandPrimary}, ${secondary})` }}>
        {bannerUrl && (
          <>
            <img src={bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover" onError={e => { e.currentTarget.style.display = 'none' }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/10" />
          </>
        )}
        <div className="relative h-full flex flex-col justify-between p-6 sm:p-10" style={{ color: bannerUrl ? '#fff' : onBrand }}>
          {logoUrl ? (
            <img src={logoUrl} alt={agencyName} className="h-8 sm:h-10 max-w-[180px] object-contain object-left"
              style={{ filter: bannerUrl ? 'drop-shadow(0 1px 3px rgba(0,0,0,.4))' : undefined }}
              onError={e => { e.currentTarget.style.display = 'none' }} />
          ) : <p className="text-sm font-semibold opacity-90">{agencyName}</p>}
          <div className="mt-10 lg:mt-0">
            <p className="text-xs font-semibold uppercase tracking-[.18em] opacity-75">Portal de cliente</p>
            <h1 className="mt-2 text-2xl sm:text-4xl font-semibold tracking-tight leading-tight">{projectName}</h1>
            <p className="hidden lg:block mt-4 max-w-sm text-[15px] leading-relaxed opacity-85">
              Aprobá el contenido, leé tus informes y seguí el avance del proyecto, todo en un solo lugar.
            </p>
          </div>
        </div>
      </div>

      {/* Formulario */}
      <div className="flex-1 flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          {exchangingMagic ? (
            <div className="text-center">
              <div className="w-8 h-8 mx-auto mb-4 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: brandPrimary }} />
              <p className="text-sm text-gray-500">Abriendo tu portal…</p>
            </div>
          ) : loginStep === 'email' ? (
            <form onSubmit={handleRequestCode}>
              <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">Ingresá a tu portal</h2>
              <p className="mt-2 text-sm text-gray-500">Te mandamos un código de acceso por email. Sin contraseñas.</p>
              <label htmlFor="portal-email" className="block mt-7 text-sm font-medium text-gray-700">Tu email</label>
              <input id="portal-email" type="email" required autoComplete="email" autoFocus value={email}
                onChange={e => setEmail(e.target.value)} placeholder="nombre@empresa.com"
                className="mt-1.5 w-full px-4 py-3 border border-gray-300 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ '--tw-ring-color': brandPrimary }} />
              {loginError && <p className="mt-3 text-sm text-red-600" role="alert">{loginError}</p>}
              <PrimaryButton type="submit" brandPrimary={brandPrimary} disabled={loginBusy} className="mt-4 w-full !py-3 text-[15px]">
                {loginBusy ? 'Enviando…' : 'Enviarme el código'}
              </PrimaryButton>
              <p className="mt-6 flex items-start gap-2 text-xs text-gray-400">
                <Icon name="lock" className="w-4 h-4 shrink-0" />
                Solo pueden ingresar los emails que {agencyName || 'tu agencia'} habilitó para este proyecto. Si el tuyo no funciona, pediles acceso.
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode}>
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-5" style={{ backgroundColor: withAlpha(brandPrimary, 0.12), color: brandPrimary }}>
                <Icon name="mail" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">Revisá tu email</h2>
              <p className="mt-2 text-sm text-gray-500">
                Si <span className="font-medium text-gray-800">{email}</span> tiene acceso, te llegó un código de 6 dígitos. Vence en 10 minutos.
              </p>
              <label htmlFor="portal-code" className="block mt-7 text-sm font-medium text-gray-700">Código</label>
              <input id="portal-code" ref={codeRef} type="text" inputMode="numeric" autoComplete="one-time-code" required
                value={code} maxLength={6} placeholder="••••••"
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setCode(v)
                }}
                className="mt-1.5 w-full px-4 py-3 border border-gray-300 rounded-xl text-center text-2xl tracking-[0.5em] font-semibold focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ '--tw-ring-color': brandPrimary }} />
              {loginError && <p className="mt-3 text-sm text-red-600" role="alert">{loginError}</p>}
              <PrimaryButton type="submit" brandPrimary={brandPrimary} disabled={loginBusy || code.length < 6} className="mt-4 w-full !py-3 text-[15px]">
                {loginBusy ? 'Verificando…' : 'Ingresar'}
              </PrimaryButton>
              <div className="mt-5 flex items-center justify-between text-sm">
                <button type="button" onClick={() => { setLoginStep('email'); setLoginError(null) }} className="text-gray-500 hover:text-gray-800">
                  Usar otro email
                </button>
                <button type="button" onClick={() => handleRequestCode()} disabled={resendIn > 0 || loginBusy}
                  className="font-semibold disabled:text-gray-300" style={resendIn > 0 ? undefined : { color: brandPrimary }}>
                  {resendIn > 0 ? `Reenviar en ${resendIn}s` : 'Reenviar código'}
                </button>
              </div>
              <p className="mt-6 text-xs text-gray-400">¿No te llega? Revisá la carpeta de spam o promociones.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
