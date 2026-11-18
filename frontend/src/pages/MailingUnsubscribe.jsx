// Página pública de baja de Mailing (`/baja/:token`), el link del pie de cada
// mail. Pide confirmación con un botón (no da de baja al abrir: los antivirus de
// correo abren todos los links de un mail y darían de baja a gente que no lo pidió).
// El botón "Darse de baja" de Gmail/Yahoo no pasa por acá: va directo al POST
// one-click del backend (header List-Unsubscribe).
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || ''

const REASONS = [
  'Recibo demasiados mails',
  'El contenido no me interesa',
  'Nunca me suscribí',
  'Otro motivo',
]

export default function MailingUnsubscribe() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = 'Darse de baja'
    axios.get(`${API}/api/public/mailing/u/${encodeURIComponent(token)}`)
      .then(r => { setInfo(r.data); if (r.data.unsubscribed) setDone(true) })
      .catch(err => setError(err?.response?.data?.error || 'No pudimos cargar la información.'))
  }, [token])

  async function confirm() {
    setBusy(true); setError('')
    try {
      await axios.post(`${API}/api/public/mailing/u/${encodeURIComponent(token)}`, { reason: reason || null })
      setDone(true)
    } catch (err) {
      setError(err?.response?.data?.error || 'No pudimos procesar la baja. Probá de nuevo.')
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        {error && !info ? (
          <p className="text-sm text-gray-700 dark:text-gray-300">{error}</p>
        ) : !info ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : done ? (
          <>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Listo, te diste de baja</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              {info.email} no va a recibir más mails{info.sender ? <> de <b>{info.sender}</b></> : ''}.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">¿Querés dejar de recibir estos mails?</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Vas a dar de baja <b>{info.email}</b>{info.sender ? <> de los mails de <b>{info.sender}</b></> : ''}.
            </p>
            <fieldset className="mt-4 space-y-1.5">
              <legend className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Motivo (opcional)</legend>
              {REASONS.map(r => (
                <label key={r} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /> {r}
                </label>
              ))}
            </fieldset>
            {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
            <button onClick={confirm} disabled={busy}
              className="mt-5 w-full rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 py-2.5 text-sm font-medium disabled:opacity-60">
              {busy ? 'Un momento…' : 'Darme de baja'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
