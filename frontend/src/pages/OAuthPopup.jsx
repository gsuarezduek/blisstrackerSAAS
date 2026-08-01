/**
 * Página intermediaria para vincular una cuenta de Google (?link=<token>) desde
 * MyProfile.jsx. Siempre se sirve desde el dominio raíz (blisstracker.app), que
 * es el único origen registrado en Google Cloud Console. Hace la llamada al
 * backend directamente (POST /auth/connect-google con { linkToken, credential }) —
 * no depende de window.opener, que COOP puede cortar entre subdominios distintos.
 */
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { GoogleLogin } from '@react-oauth/google'

export default function OAuthPopup() {
  const [params] = useSearchParams()
  const linkToken = params.get('link')
  const [status, setStatus] = useState('') // '' | 'ok' | 'err'
  const [errMsg, setErrMsg] = useState('')

  async function handleSuccess({ credential }) {
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/connect-google`, { linkToken, credential })
      setStatus('ok')
      setTimeout(() => window.close(), 1200)
    } catch (err) {
      setStatus('err')
      setErrMsg(err.response?.data?.error || 'No se pudo conectar la cuenta de Google.')
    }
  }

  function handleError() {
    setStatus('err')
    setErrMsg('No se pudo iniciar sesión con Google.')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-gray-900 gap-6 px-6 text-center">
      <img src="/blisstracker_logo.svg" alt="BlissTracker" className="w-12 h-12" />

      {status === 'ok' ? (
        <p className="text-sm text-green-600 dark:text-green-400 font-medium">
          ✅ Cuenta de Google conectada. Podés cerrar esta ventana.
        </p>
      ) : !linkToken ? (
        <p className="text-sm text-red-600 dark:text-red-400 max-w-xs">Link inválido o incompleto.</p>
      ) : (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400">Elegí la cuenta de Google a conectar</p>
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={handleError}
            useOneTap={false}
            text="continue_with"
            locale="es"
          />
          {status === 'err' && (
            <p className="text-sm text-red-600 dark:text-red-400 max-w-xs">{errMsg}</p>
          )}
        </>
      )}
    </div>
  )
}
