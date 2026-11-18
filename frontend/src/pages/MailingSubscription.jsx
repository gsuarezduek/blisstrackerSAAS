// Páginas públicas del formulario de suscripción de Mailing:
//   /suscripcion?estado=revisa-tu-mail|listo|error  → a dónde vuelve el form HTML
//   /confirmar-suscripcion/:token                   → link del mail de doble opt-in
// La confirmación pide un clic: los antivirus de correo abren los links solos y
// confirmarían suscripciones que nadie pidió.
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || ''

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">{children}</div>
    </div>
  )
}

function Thanks() {
  const [params] = useSearchParams()
  const estado = params.get('estado')
  useEffect(() => { document.title = 'Suscripción' }, [])
  if (estado === 'error') {
    return (
      <Shell>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">No pudimos suscribirte</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{params.get('mensaje') || 'Probá de nuevo en unos minutos.'}</p>
      </Shell>
    )
  }
  return (
    <Shell>
      {estado === 'revisa-tu-mail' ? (
        <>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Revisá tu mail</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Te mandamos un mail para confirmar la suscripción. Hasta que no la confirmes, no vas a recibir nada. Si no lo ves, buscalo en spam o promociones.</p>
        </>
      ) : (
        <>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">¡Listo, ya estás suscripto/a!</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Vas a empezar a recibir nuestras novedades. Podés darte de baja cuando quieras desde el pie de cualquier mail.</p>
        </>
      )}
    </Shell>
  )
}

function Confirm({ token }) {
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const url = `${API}/api/public/mailing/confirm/${encodeURIComponent(token)}`

  useEffect(() => {
    document.title = 'Confirmar suscripción'
    axios.get(url)
      .then(r => { setInfo(r.data); if (r.data.confirmed) setDone(true) })
      .catch(err => setError(err?.response?.data?.error || 'No pudimos cargar la información.'))
  }, [url])

  async function confirm() {
    setBusy(true); setError('')
    try { await axios.post(url); setDone(true) }
    catch (err) { setError(err?.response?.data?.error || 'No pudimos confirmar. Probá de nuevo.') }
    finally { setBusy(false) }
  }

  if (!info) return <Shell><p className="text-sm text-gray-700 dark:text-gray-300">{error || 'Cargando…'}</p></Shell>
  if (done) {
    return (
      <Shell>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">¡Suscripción confirmada!</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{info.email} va a recibir las novedades{info.sender ? <> de <b>{info.sender}</b></> : ''}.</p>
      </Shell>
    )
  }
  if (info.expired) {
    return (
      <Shell>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">El link venció</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Volvé a suscribirte desde el formulario para recibir un link nuevo.</p>
      </Shell>
    )
  }
  return (
    <Shell>
      <h1 className="text-lg font-bold text-gray-900 dark:text-white">Confirmá tu suscripción</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Vas a recibir en <b>{info.email}</b> las novedades{info.sender ? <> de <b>{info.sender}</b></> : ''}.</p>
      {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
      <button onClick={confirm} disabled={busy}
        className="mt-5 w-full rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 py-2.5 text-sm font-medium disabled:opacity-60">
        {busy ? 'Un momento…' : 'Confirmar suscripción'}
      </button>
    </Shell>
  )
}

export default function MailingSubscription() {
  const { token } = useParams()
  return token ? <Confirm token={token} /> : <Thanks />
}
