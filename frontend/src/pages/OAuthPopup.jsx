/**
 * Página intermediaria para Google OAuth en contexto multi-tenant.
 * Siempre se sirve desde el dominio raíz (blisstracker.app), que es
 * el único origen registrado en Google Cloud Console.
 *
 * Flujo:
 *   1. Login2 abre window.open('blisstracker.app/oauth?workspace=slug')
 *   2. Esta página muestra el botón de Google y ejecuta el Sign-In
 *   3. Obtiene el ID token → llama al backend con X-Workspace: slug
 *   4. Recibe el JWT → postMessage al opener → cierra el popup
 */
import { useSearchParams } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import axios from 'axios'

export default function OAuthPopup() {
  const [searchParams] = useSearchParams()
  const workspace = searchParams.get('workspace') || ''

  async function handleSuccess({ credential }) {
    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/auth/google`,
        { credential },
        { headers: { 'X-Workspace': workspace } }
      )
      window.opener?.postMessage(
        { type: 'GOOGLE_AUTH_SUCCESS', token: data.token, user: data.user },
        '*'
      )
    } catch (err) {
      window.opener?.postMessage(
        { type: 'GOOGLE_AUTH_ERROR', error: err.response?.data?.error || 'Error al iniciar sesión con Google' },
        '*'
      )
    } finally {
      window.close()
    }
  }

  function handleError() {
    window.opener?.postMessage(
      { type: 'GOOGLE_AUTH_ERROR', error: 'No se pudo iniciar sesión con Google' },
      '*'
    )
    window.close()
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-gray-900 gap-6">
      <img src="/blisstracker_logo.svg" alt="BlissTracker" className="w-12 h-12" />
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Iniciando sesión con Google…
      </p>
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={handleError}
        useOneTap={false}
        text="continue_with"
        locale="es"
      />
    </div>
  )
}
