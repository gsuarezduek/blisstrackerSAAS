import { useState } from 'react'
import api from '../../api/client'
import PasswordInput from '../PasswordInput'
import MfaCodeInput from '../MfaCodeInput'

// Sección "Verificación en dos pasos" de Mi Perfil. Opt-in personal: nadie se lo
// activa a nadie. Cada operación pide la contraseña como re-autenticación, igual
// que cambiar contraseña y cambiar email (la del alta importa tanto como la de la
// baja: con una sesión robada, activar un 2FA ajeno dejaría al dueño afuera de su
// cuenta, porque el reset de contraseña también exige el código).
//
// Pasos: idle → password → qr → codes (y, ya activa, disable / regenerate).

const CARD = 'bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6'
const INPUT = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const PRIMARY = 'bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg px-5 py-2 transition-colors'
const SECONDARY = 'border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 rounded-lg px-4 py-2 transition-colors disabled:opacity-60'

function Label({ children }) {
  return <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{children}</label>
}

// Los códigos se muestran UNA sola vez (en la DB sólo vive su hash), así que la
// pantalla insiste en guardarlos antes de cerrarla.
function RecoveryCodes({ codes, onDone }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-lg px-4 py-3">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-300">Guardá estos códigos ahora</p>
        <p className="text-xs text-amber-800 dark:text-amber-400 mt-1">
          Es la única vez que se muestran. Son tu forma de entrar si perdés el teléfono — cada uno sirve una sola vez.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {codes.map(code => (
          <code key={code} className="font-mono text-sm text-center tracking-wider bg-gray-50 dark:bg-gray-700/50 border dark:border-gray-600 rounded-lg py-2 text-gray-800 dark:text-gray-100">
            {code}
          </code>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={copy} className={SECONDARY}>
          {copied ? 'Copiados' : 'Copiar los 10'}
        </button>
        <button type="button" onClick={onDone} className={PRIMARY}>Ya los guardé</button>
      </div>
    </div>
  )
}

export default function MfaSection({ profile, onChange }) {
  const [step,    setStep]    = useState('idle')
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState('')
  const [password, setPassword] = useState('')
  const [code,    setCode]    = useState('')
  const [setupData, setSetupData] = useState(null) // { qr, secret, otpauthUri }
  const [codes,   setCodes]   = useState(null)

  const enabled = profile.mfaEnabled
  const codesLeft = profile.mfaRecoveryCodesLeft ?? 0

  function reset() {
    setStep('idle'); setBusy(false); setError('')
    setPassword(''); setCode(''); setSetupData(null); setCodes(null)
  }

  async function run(fn) {
    setError('')
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo completar la operación')
    } finally {
      setBusy(false)
    }
  }

  const startSetup = () => run(async () => {
    const { data } = await api.post('/profile/mfa/setup', { password })
    setSetupData(data)
    setPassword('')
    setStep('qr')
  })

  const confirmSetup = () => run(async () => {
    const { data } = await api.post('/profile/mfa/confirm', { code })
    setCodes(data.recoveryCodes)
    setCode('')
    setStep('codes')
    onChange({ mfaEnabled: true, mfaPendingSetup: false, mfaRecoveryCodesLeft: data.recoveryCodesLeft })
  })

  const doDisable = () => run(async () => {
    const { data } = await api.post('/profile/mfa/disable', { password, code })
    onChange({ mfaEnabled: false, mfaPendingSetup: false, mfaRecoveryCodesLeft: data.recoveryCodesLeft })
    reset()
  })

  const doRegenerate = () => run(async () => {
    const { data } = await api.post('/profile/mfa/recovery-codes', { password })
    setCodes(data.recoveryCodes)
    setPassword('')
    setStep('codes')
    onChange({ mfaRecoveryCodesLeft: data.recoveryCodesLeft })
  })

  const errorBox = error && (
    <p className="text-sm rounded-lg px-3 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400">{error}</p>
  )

  // ── Paso: confirmar la contraseña antes de seguir ──────────────────────────
  if (step === 'password' || step === 'regenerate') {
    const isRegen = step === 'regenerate'
    return (
      <div className={CARD}>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
          {isRegen ? 'Generar códigos nuevos' : 'Activar la verificación en dos pasos'}
        </h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          {isRegen
            ? 'Los códigos actuales dejan de servir, usados o no. Confirmá con tu contraseña.'
            : 'Confirmá con tu contraseña para empezar.'}
        </p>
        <form onSubmit={e => { e.preventDefault(); isRegen ? doRegenerate() : startSetup() }} className="space-y-3">
          <div>
            <Label>Contraseña actual</Label>
            <PasswordInput required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className={INPUT} />
          </div>
          {errorBox}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={reset} className={SECONDARY}>Cancelar</button>
            <button type="submit" disabled={busy} className={PRIMARY}>{busy ? 'Verificando…' : 'Continuar'}</button>
          </div>
        </form>
      </div>
    )
  }

  // ── Paso: escanear el QR y validar el primer código ───────────────────────
  if (step === 'qr' && setupData) {
    return (
      <div className={CARD}>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Escaneá el código</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          Abrí tu app de autenticación (Google Authenticator, 1Password, Authy…), escaneá el QR y escribí el código que aparece.
        </p>

        <div className="flex flex-col sm:flex-row gap-5">
          <img src={setupData.qr} alt="Código QR para la app de autenticación" className="w-[180px] h-[180px] rounded-lg border dark:border-gray-600 bg-white self-start" />
          <div className="flex-1 space-y-3">
            <div>
              <Label>¿No podés escanear?</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Cargá esta clave a mano:</p>
              <code className="block font-mono text-xs break-all bg-gray-50 dark:bg-gray-700/50 border dark:border-gray-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-200">
                {setupData.secret}
              </code>
            </div>
            <form onSubmit={e => { e.preventDefault(); confirmSetup() }} className="space-y-3">
              <div>
                <Label>Código de 6 dígitos</Label>
                <MfaCodeInput required autoFocus value={code} onChange={setCode} className="!rounded-lg !py-2" />
              </div>
              {errorBox}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={reset} className={SECONDARY}>Cancelar</button>
                <button type="submit" disabled={busy || !code.trim()} className={PRIMARY}>{busy ? 'Activando…' : 'Activar'}</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // ── Paso: los códigos de recuperación, una sola vez ───────────────────────
  if (step === 'codes' && codes) {
    return (
      <div className={CARD}>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Códigos de recuperación</h2>
        <RecoveryCodes codes={codes} onDone={reset} />
      </div>
    )
  }

  // ── Paso: desactivar (pide los dos factores) ──────────────────────────────
  if (step === 'disable') {
    return (
      <div className={CARD}>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Desactivar la verificación en dos pasos</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          Tu cuenta volverá a entrar sólo con email y contraseña. Pedimos los dos factores que estás por desactivar.
        </p>
        <form onSubmit={e => { e.preventDefault(); doDisable() }} className="space-y-3">
          <div>
            <Label>Contraseña actual</Label>
            <PasswordInput required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className={INPUT} />
          </div>
          <div>
            <Label>Código de verificación</Label>
            <MfaCodeInput required value={code} onChange={setCode} className="!rounded-lg !py-2" />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              El de tu app, o uno de recuperación si perdiste el dispositivo.
            </p>
          </div>
          {errorBox}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={reset} className={SECONDARY}>Cancelar</button>
            <button type="submit" disabled={busy}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg px-5 py-2 transition-colors">
              {busy ? 'Desactivando…' : 'Desactivar'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  // ── Estado base ───────────────────────────────────────────────────────────
  return (
    <div className={CARD}>
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Verificación en dos pasos</h2>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
        Suma un código de tu teléfono al email y la contraseña. Con esto, una contraseña filtrada no alcanza para entrar a tu cuenta.
      </p>

      {enabled ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-500" /> Activa
            </span>
            <div className="flex items-center gap-3">
              <button onClick={() => { setError(''); setStep('regenerate') }} className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">
                Generar códigos nuevos
              </button>
              <button onClick={() => { setError(''); setStep('disable') }} className="text-sm font-medium text-red-600 dark:text-red-400 hover:underline">
                Desactivar
              </button>
            </div>
          </div>
          <p className={`text-xs ${codesLeft <= 2 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}`}>
            {codesLeft === 0
              ? 'No te quedan códigos de recuperación. Generá nuevos antes de perder el dispositivo.'
              : `Te ${codesLeft === 1 ? 'queda 1 código' : `quedan ${codesLeft} códigos`} de recuperación sin usar.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {profile.mfaPendingSetup && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Habías empezado a activarla y no la confirmaste. Volvé a generar el QR para terminar.
            </p>
          )}
          {errorBox}
          <button onClick={() => { setError(''); setStep('password') }} className={PRIMARY}>Activar</button>
        </div>
      )}
    </div>
  )
}
