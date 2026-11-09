import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import PasswordInput from '../components/PasswordInput'
import MfaCodeInput from '../components/MfaCodeInput'
import { TriangleAlert } from 'lucide-react'
import { Icon } from '../components/ui/Icon'
import BlissLogo from '../components/BlissLogo'
import { handoffUrl } from '../utils/authHandoff'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Cliente axios sin auth (rutas públicas)
const publicApi = axios.create({ baseURL: `${BASE_URL}/api` })

export default function JoinWorkspace() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [invitation, setInvitation]   = useState(null)
  const [loadingInv, setLoadingInv]   = useState(true)
  const [invError, setInvError]       = useState('')

  const [name, setName]               = useState('')
  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [formError, setFormError]     = useState('')
  // El GET de la invitación no dice si la cuenta tiene 2FA. El primer intento
  // con la contraseña correcta vuelve con MFA_REQUIRED y recién ahí se pide el código.
  const [needsCode, setNeedsCode]     = useState(false)
  const [code, setCode]               = useState('')

  useEffect(() => {
    if (!token) {
      setInvError('Token de invitación no encontrado.')
      setLoadingInv(false)
      return
    }
    publicApi.get(`/workspaces/invitations/${token}`)
      .then(r => { setInvitation(r.data); setLoadingInv(false) })
      .catch(err => {
        setInvError(err.response?.data?.error || 'Invitación inválida o expirada.')
        setLoadingInv(false)
      })
  }, [token])

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')

    if (invitation.hasAccount === false) {
      if (!name.trim()) return setFormError('El nombre es requerido')
      if (password.length < 8) return setFormError('La contraseña debe tener al menos 8 caracteres')
      if (password !== confirm) return setFormError('Las contraseñas no coinciden')
    } else if (!password) {
      return setFormError('Ingresá la contraseña de tu cuenta')
    }

    setSubmitting(true)
    try {
      const payload = { token, password }
      if (!invitation.hasAccount) {
        payload.name = name.trim()
      }
      if (code) payload.code = code

      const { data } = await publicApi.post('/workspaces/join', payload)
      window.location.assign(await handoffUrl(data.slug, data.token))
    } catch (err) {
      const res = err.response?.data
      if (res?.code === 'MFA_REQUIRED') setNeedsCode(true)
      setFormError(res?.error || 'Error al unirse al workspace')
      setSubmitting(false)
    }
  }

  // Loading
  if (loadingInv) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400 text-sm">Verificando invitación...</p>
      </div>
    )
  }

  // Error de invitación
  if (invError) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="mb-4"><Icon as={TriangleAlert} size={32} className="inline-block text-amber-500" /></div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Invitación inválida</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{invError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 max-w-sm w-full">
        {/* Logo / Marca */}
        <div className="text-center mb-6">
          <BlissLogo variant="lockup" className="h-8 w-auto mx-auto" />
        </div>

        {/* Info de la invitación */}
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Fuiste invitado a</p>
          <p className="font-bold text-gray-900 dark:text-white text-lg">{invitation.workspace.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            por <span className="font-medium text-gray-700 dark:text-gray-300">{invitation.invitedBy}</span>
            {' · '}
            <span className="capitalize">{invitation.memberRole}</span>
            {invitation.teamRole && ` · ${invitation.teamRole}`}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email (solo lectura) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              value={invitation.email}
              disabled
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 text-sm cursor-not-allowed"
            />
          </div>

          {/* Campos solo para usuarios nuevos */}
          {!invitation.hasAccount && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tu nombre
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Nombre completo"
                  autoFocus
                  required
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Contraseña
                </label>
                <PasswordInput
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Confirmar contraseña
                </label>
                <PasswordInput
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repetir contraseña"
                  required
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow"
                />
              </div>
            </>
          )}

          {invitation.hasAccount && (
            <>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 text-sm text-green-700 dark:text-green-300">
                Tu cuenta ya existe. Ingresá tu contraseña para sumarte a este workspace.
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Contraseña
                </label>
                <PasswordInput
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="La de tu cuenta"
                  autoFocus
                  required
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow"
                />
              </div>
              {needsCode && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Código de verificación
                  </label>
                  <MfaCodeInput autoFocus value={code} onChange={setCode} required />
                </div>
              )}
            </>
          )}

          {formError && (
            <p className="text-sm text-red-500 text-center">{formError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            {submitting ? 'Uniéndote...' : invitation.hasAccount ? 'Unirme al workspace' : 'Crear cuenta y unirme'}
          </button>
        </form>
      </div>
    </div>
  )
}
