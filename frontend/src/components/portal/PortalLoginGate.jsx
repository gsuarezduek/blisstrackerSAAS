import { useState } from 'react'
import axios from 'axios'

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
 */
export default function PortalLoginGate({ slug, brandPrimary = '#f97316', children }) {
  const [token, setToken] = useState(() => localStorage.getItem(tokenKey(slug)))
  const [loginStep,  setLoginStep]  = useState('email') // 'email' | 'code'
  const [email,      setEmail]      = useState('')
  const [code,       setCode]       = useState('')
  const [loginBusy,  setLoginBusy]  = useState(false)
  const [loginError, setLoginError] = useState(null)

  function requireReauth() {
    localStorage.removeItem(tokenKey(slug))
    setToken(null)
    setLoginStep('email')
  }

  async function handleRequestCode(e) {
    e.preventDefault()
    setLoginBusy(true); setLoginError(null)
    try {
      await axios.post(`${API}/api/public/client-portal/${slug}/live/request-code`, { email: email.trim() })
      setLoginStep('code')
    } catch (err) {
      setLoginError(err.response?.data?.error || 'No se pudo enviar el código')
    } finally { setLoginBusy(false) }
  }

  async function handleVerifyCode(e) {
    e.preventDefault()
    setLoginBusy(true); setLoginError(null)
    try {
      const r = await axios.post(`${API}/api/public/client-portal/${slug}/live/verify-code`, { email: email.trim(), code: code.trim() })
      localStorage.setItem(tokenKey(slug), r.data.token)
      setToken(r.data.token)
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Código inválido')
    } finally { setLoginBusy(false) }
  }

  if (token) return children(token, { requireReauth })

  return (
    <div className="max-w-sm mx-auto">
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Ingresá para continuar</h2>
      <p className="text-sm text-gray-500 mb-4">Te vamos a enviar un código a tu email.</p>
      {loginStep === 'email' ? (
        <form onSubmit={handleRequestCode} className="space-y-3">
          <input
            type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          {loginError && <p className="text-sm text-red-600">{loginError}</p>}
          <button type="submit" disabled={loginBusy}
            className="w-full px-4 py-2 rounded-lg text-white font-semibold text-sm disabled:opacity-50"
            style={{ backgroundColor: brandPrimary }}>
            {loginBusy ? 'Enviando…' : 'Enviar código'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyCode} className="space-y-3">
          <p className="text-sm text-gray-600">Revisá <strong>{email}</strong> y pegá el código de 6 dígitos.</p>
          <input
            type="text" required value={code} onChange={e => setCode(e.target.value)}
            placeholder="000000" maxLength={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-center tracking-[0.3em] font-semibold"
          />
          {loginError && <p className="text-sm text-red-600">{loginError}</p>}
          <button type="submit" disabled={loginBusy}
            className="w-full px-4 py-2 rounded-lg text-white font-semibold text-sm disabled:opacity-50"
            style={{ backgroundColor: brandPrimary }}>
            {loginBusy ? 'Verificando…' : 'Verificar'}
          </button>
          <button type="button" onClick={() => setLoginStep('email')} className="w-full text-xs text-gray-400 hover:underline">
            Cambiar email
          </button>
        </form>
      )}
    </div>
  )
}
