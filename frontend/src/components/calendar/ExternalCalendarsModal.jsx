import { useCallback, useEffect, useState } from 'react'
import { X, RefreshCw, Trash2, TriangleAlert, Link2, Eye, EyeOff } from 'lucide-react'
import { Icon } from '../ui/Icon'
import api from '../../api/client'
import GoogleCalendarConnectButton from './GoogleCalendarConnectButton'

// "Mis calendarios": lo que BlissTracker trae de AFUERA para mostrar (y para que
// tape huecos al buscar un horario) — ver ExternalCalendar en el backend. Dos
// fuentes:
//   · el Google que ya está conectado, que aparece solo (no hay que agregar nada);
//   · cualquier calendario por su URL iCal — Google, Outlook, Apple, el de un
//     cliente. Es la vía para todo lo que no sea la cuenta de Google propia.
// Son de cada persona: lo que se agrega acá no lo ve ni lo administra nadie más.

const COLORS = ['#4285F4', '#0F9D58', '#DB4437', '#F4B400', '#8E24AA', '#00ACC1', '#F06292', '#5C6BC0']

function fmtWhen(iso) {
  if (!iso) return 'nunca'
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  if (mins < 60 * 24) return `hace ${Math.round(mins / 60)} h`
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function CalendarRow({ cal, onChange, onRemove }) {
  const [busy, setBusy] = useState(false)
  const isGoogle = cal.source === 'google'

  async function patch(data) {
    setBusy(true)
    try {
      const res = await api.patch(`/calendar/external-calendars/${cal.id}`, data)
      onChange(res.data)
    } catch { /* el estado anterior sigue siendo el visible */ }
    finally { setBusy(false) }
  }

  async function sync() {
    setBusy(true)
    try {
      const res = await api.post(`/calendar/external-calendars/${cal.id}/sync`, {})
      onChange(res.data)
    } catch { /* el error queda en lastSyncError del próximo GET */ }
    finally { setBusy(false) }
  }

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span className="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cal.color || '#9CA3AF' }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{cal.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {isGoogle ? 'Tu cuenta de Google' : cal.icsHost || 'URL iCal'}
            {' · '}{cal.eventCount ?? 0} evento{cal.eventCount === 1 ? '' : 's'}
            {' · '}actualizado {fmtWhen(cal.lastSyncAt)}
          </p>
          {cal.lastSyncError && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400 flex items-start gap-1">
              <Icon as={TriangleAlert} size={13} className="mt-0.5" />
              <span className="min-w-0">{cal.lastSyncError}</span>
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
              <input type="checkbox" checked={cal.active} disabled={busy} onChange={e => patch({ active: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
              Mostrar en mi calendario
            </label>
            <button type="button" onClick={() => patch({ showDetails: !cal.showDetails })} disabled={busy}
              title={cal.showDetails
                ? 'El equipo ve el título de estos eventos'
                : 'El equipo ve el horario ocupado, pero no de qué se trata'}
              className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              <Icon as={cal.showDetails ? Eye : EyeOff} size={13} />
              {cal.showDetails ? 'El equipo ve de qué se trata' : 'El equipo solo ve "Ocupado"'}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => patch({ color: c })} disabled={busy} aria-label={`Color ${c}`}
                className={`w-4 h-4 rounded-full border transition-transform ${cal.color === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <button type="button" onClick={sync} disabled={busy} title="Actualizar ahora"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">
            <Icon as={RefreshCw} size={15} className={busy ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={() => onRemove(cal)} disabled={busy}
            title={isGoogle ? 'Dejar de traer los eventos de Google (la cuenta sigue conectada)' : 'Quitar este calendario'}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
            <Icon as={Trash2} size={15} />
          </button>
        </div>
      </div>
    </li>
  )
}

function AddByUrlForm({ onAdded }) {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!url.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      const res = await api.post('/calendar/external-calendars', { url: url.trim(), name: name.trim() || undefined })
      setUrl(''); setName('')
      onAdded(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo agregar el calendario.')
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        type="text" value={url} onChange={e => setUrl(e.target.value)}
        placeholder="https://… .ics  (o webcal://…)"
        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
      />
      <div className="flex gap-2">
        <input
          type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="Nombre (opcional)"
          className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        <button type="submit" disabled={saving || !url.trim()}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50">
          {saving ? 'Agregando…' : 'Agregar'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
        En Google Calendar: Configuración del calendario → <span className="font-medium">Integrar calendario</span> → “Dirección secreta en formato iCal”.
        En Outlook: Configuración → Calendarios compartidos → Publicar un calendario.
        {' '}Guardamos esa dirección cifrada y no se vuelve a mostrar — es la llave de tu agenda.
        {' '}Tené en cuenta que Google actualiza ese archivo cada varias horas, así que un evento recién creado puede tardar en aparecer.
      </p>
    </form>
  )
}

export default function ExternalCalendarsModal({ onClose, onChanged }) {
  const [cals, setCals] = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(null)

  const load = useCallback(() => {
    api.get('/calendar/external-calendars')
      .then(r => setCals(r.data || []))
      .catch(() => setCals([]))
  }, [])

  useEffect(() => { load() }, [load])

  function replace(updated) {
    setCals(prev => (prev || []).map(c => (c.id === updated.id ? updated : c)))
    onChanged?.()
  }

  async function remove(cal) {
    try {
      await api.delete(`/calendar/external-calendars/${cal.id}`)
      setCals(prev => (prev || []).filter(c => c.id !== cal.id))
      onChanged?.()
    } catch { /* queda como estaba */ }
    finally { setConfirmRemove(null) }
  }

  const googleCals = (cals || []).filter(c => c.source === 'google')
  const urlCals = (cals || []).filter(c => c.source === 'ics')

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Cerrar"
          className="absolute top-3 right-3 z-10 p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
          <Icon as={X} size={20} />
        </button>

        <div className="flex-1 overflow-y-auto p-6 pr-10 space-y-5">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Mis calendarios</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Lo que traigas acá se ve en tu calendario y ocupa tu tiempo cuando alguien busca un horario para una reunión.
              Son tuyos: nadie más los administra.
            </p>
          </div>

          {cals === null ? (
            <p className="text-sm text-gray-400">Cargando…</p>
          ) : (
            <>
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Google Calendar</h4>
                {googleCals.length === 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Conectá tu cuenta y tus eventos de Google aparecen acá — y las reuniones que agendes en BlissTracker se empujan allá.
                    </p>
                    <GoogleCalendarConnectButton />
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                    {googleCals.map(c => <CalendarRow key={c.id} cal={c} onChange={replace} onRemove={setConfirmRemove} />)}
                  </ul>
                )}
              </section>

              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                  <Icon as={Link2} size={13} /> Agregados por URL
                </h4>
                {urlCals.length > 0 && (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700 mb-3">
                    {urlCals.map(c => <CalendarRow key={c.id} cal={c} onChange={replace} onRemove={setConfirmRemove} />)}
                  </ul>
                )}
                <AddByUrlForm onAdded={cal => { setCals(prev => [...(prev || []), cal]); onChanged?.() }} />
              </section>
            </>
          )}
        </div>

        {confirmRemove && (
          <div className="absolute inset-0 bg-white/95 dark:bg-gray-800/95 rounded-2xl flex items-center justify-center p-6">
            <div className="text-center">
              <p className="text-sm font-medium text-gray-900 dark:text-white">¿Quitar “{confirmRemove.name}”?</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {confirmRemove.source === 'google'
                  ? 'Dejás de ver sus eventos acá. Tu cuenta de Google sigue conectada y las reuniones que agendes se van a seguir empujando a Google.'
                  : 'Se borra la suscripción y sus eventos. Podés volver a agregarla con la misma URL.'}
              </p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <button type="button" onClick={() => setConfirmRemove(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                  Cancelar
                </button>
                <button type="button" onClick={() => remove(confirmRemove)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white">
                  Quitar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
