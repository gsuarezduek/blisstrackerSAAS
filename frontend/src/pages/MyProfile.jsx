import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import AvatarLightbox from '../components/AvatarLightbox'
import LoadingSpinner from '../components/LoadingSpinner'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import useLegajoFields from '../hooks/useLegajoFields'
import LegajoFormFields from '../components/legajo/LegajoFormFields'
import RoleBadge from '../components/RoleBadge'
import { avatarUrl } from '../utils/avatarUrl'

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  )
}

const LEAVE_TYPES = [
  { value: 'vacaciones',  label: '🏖️ Vacaciones' },
  { value: 'estudio',     label: '📚 Estudio / examen' },
  { value: 'maternidad',  label: '🤱 Maternidad' },
  { value: 'paternidad',  label: '👶 Paternidad' },
  { value: 'enfermedad',  label: '🏥 Enfermedad / salud' },
  { value: 'duelo',       label: '🕯️ Duelo familiar' },
  { value: 'mudanza',     label: '📦 Mudanza' },
  { value: 'otro',        label: '📝 Otro' },
]

const STATUS_LABELS = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' }
const STATUS_COLORS = {
  pending:  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  approved: 'bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400',
  rejected: 'bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-400',
}

// Fecha mínima: 48 horas desde ahora (en formato YYYY-MM-DD), en la timezone del
// workspace — igual que el backend, así el mínimo que se muestra acá coincide
// exactamente con el que valida createRequest (evita mismatches cerca del límite
// cuando el navegador del usuario está en otra timezone que la del workspace).
function minStartDate(tz) {
  const d = new Date(Date.now() + 48 * 60 * 60 * 1000)
  return d.toLocaleDateString('en-CA', tz ? { timeZone: tz } : undefined) // 'en-CA' produce YYYY-MM-DD
}

function VacationRequestModal({ onClose, onCreated }) {
  const { workspace } = useWorkspace()
  const [form, setForm] = useState({ startDate: '', endDate: '', type: '', observation: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const minDate = minStartDate(workspace?.timezone)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.type) { setError('Seleccioná el tipo de licencia'); return }
    if (form.startDate < minDate) { setError('La fecha de inicio debe ser con al menos 48 hs de anticipación'); return }
    if (form.startDate > form.endDate) { setError('La fecha de inicio debe ser anterior a la de fin'); return }
    setSaving(true); setError('')
    try {
      const { data } = await api.post('/vacation/my/request', form)
      onCreated(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al enviar la solicitud')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <p className="font-semibold text-gray-900 dark:text-white">Solicitar días</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Tipo */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
              Tipo de licencia <span className="text-red-500">*</span>
            </label>
            <select
              value={form.type} required
              onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">— Seleccionar —</option>
              {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Nota 48hs */}
          <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-lg px-3 py-2.5">
            <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
            <p className="text-xs text-amber-700 dark:text-amber-400">Las solicitudes requieren un mínimo de <strong>48 horas de anticipación</strong>.</p>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
                Desde <span className="text-red-500">*</span>
              </label>
              <input type="date" required value={form.startDate}
                min={minDate}
                onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
                Hasta <span className="text-red-500">*</span>
              </label>
              <input type="date" required value={form.endDate}
                min={form.startDate}
                onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Observación */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Observación (opcional)</label>
            <textarea
              rows={3} value={form.observation}
              onChange={e => setForm(p => ({ ...p, observation: e.target.value }))}
              placeholder="Algún detalle adicional para el equipo…"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Enviando…' : 'Enviar solicitud'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function MyProfile() {
  const { user, updateUser } = useAuth()

  const { fields: legajoFields } = useLegajoFields()
  const [profile, setProfile] = useState(null)
  const [values, setValues] = useState({})   // { [field.key]: value } — builtin + custom
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState({ text: '', error: false })

  const [emailForm, setEmailForm] = useState({ newEmail: '', password: '' })
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailMsg, setEmailMsg] = useState({ text: '', error: false })

  const [googleBusy, setGoogleBusy] = useState(false)
  const [googleMsg, setGoogleMsg] = useState({ text: '', error: false })

  const [avatars, setAvatars] = useState([])  // lista desde API: [{ id, filename, label }]
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [selectedAvatar, setSelectedAvatar] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null) // null = cerrado

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue]     = useState('')
  const [nameSaving, setNameSaving]   = useState(false)
  const [nameError, setNameError]     = useState('')

  const [vacData, setVacData]           = useState(null)   // { vacationDays, adjustments, requests }
  const [vacHistoryOpen, setVacHistoryOpen] = useState(false)
  const [vacRequestOpen, setVacRequestOpen] = useState(false)

  function openLightbox(file) {
    const idx = avatars.findIndex(a => a.filename === file)
    setLightboxIndex(idx >= 0 ? idx : 0)
  }

  useEffect(() => {
    api.get('/avatars').then(({ data }) => setAvatars(data)).catch(() => {})
  }, [])

  useEffect(() => {
    api.get('/vacation/my').then(r => setVacData(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    api.get('/profile').then(({ data }) => {
      setProfile(data)
      setSelectedAvatar(data.avatar ?? '2bee.png')
    })
  }, [])

  // Construye los valores del formulario desde el perfil + la config de campos.
  // Builtin → columna de User; custom → profile.legajoData. Se recalcula al cargar/guardar.
  useEffect(() => {
    if (!profile || legajoFields.length === 0) return
    const v = {}
    for (const f of legajoFields) {
      const raw = f.builtin ? profile[f.key] : profile.legajoData?.[f.key]
      v[f.key] = f.type === 'date' && raw ? String(raw).slice(0, 10) : (raw ?? '')
    }
    setValues(v)
  }, [profile, legajoFields])

  function setValue(key, val) {
    setValues(prev => ({ ...prev, [key]: val }))
  }

  function startEditName() {
    setNameValue(profile.name)
    setNameError('')
    setEditingName(true)
  }

  async function handleSaveName() {
    if (!nameValue.trim()) { setNameError('El nombre no puede estar vacío'); return }
    if (nameValue.trim() === profile.name) { setEditingName(false); return }
    setNameSaving(true); setNameError('')
    try {
      const { data } = await api.patch('/profile', { name: nameValue.trim() })
      setProfile(prev => ({ ...prev, name: data.name }))
      updateUser({ name: data.name })
      setEditingName(false)
    } catch (err) {
      setNameError(err.response?.data?.error || 'Error al guardar')
    } finally { setNameSaving(false) }
  }

  async function handleSaveAvatar() {
    if (!selectedAvatar || selectedAvatar === profile.avatar) return
    setAvatarSaving(true)
    try {
      const { data } = await api.patch('/profile/avatar', { avatar: selectedAvatar })
      setProfile(prev => ({ ...prev, avatar: data.avatar }))
      updateUser({ avatar: data.avatar })
    } catch (_) {}
    finally { setAvatarSaving(false) }
  }

  async function handleSavePersonal(e) {
    e.preventDefault()
    setSaving(true)
    setSaveMsg('')
    try {
      // Builtin → campos top-level (columnas de User); custom → legajoData.
      const body = { legajoData: {} }
      for (const f of legajoFields) {
        if (f.enabled === false) continue
        const val = values[f.key]
        if (f.builtin) body[f.key] = val === '' ? null : val
        else body.legajoData[f.key] = val
      }
      const { data } = await api.patch('/profile', body)
      setProfile(data)
      setSaveMsg('Datos guardados correctamente.')
      setTimeout(() => setSaveMsg(''), 3000)
    } catch (err) {
      setSaveMsg(err.response?.data?.error || 'Error al guardar.')
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwMsg({ text: 'Las contraseñas no coinciden.', error: true })
      return
    }
    setPwSaving(true)
    setPwMsg({ text: '', error: false })
    try {
      await api.post('/profile/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      })
      setPwMsg({ text: 'Contraseña actualizada correctamente.', error: false })
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setPwMsg({ text: err.response?.data?.error || 'Error al cambiar la contraseña.', error: true })
    } finally {
      setPwSaving(false)
    }
  }

  async function handleRequestEmailChange(e) {
    e.preventDefault()
    setEmailSaving(true)
    setEmailMsg({ text: '', error: false })
    try {
      const { data } = await api.post('/profile/change-email', {
        newEmail: emailForm.newEmail.trim(),
        password: emailForm.password,
      })
      setEmailMsg({ text: data.message || 'Te enviamos un correo de confirmación.', error: false })
      setEmailForm({ newEmail: '', password: '' })
    } catch (err) {
      setEmailMsg({ text: err.response?.data?.error || 'No se pudo solicitar el cambio de email.', error: true })
    } finally {
      setEmailSaving(false)
    }
  }

  // El botón de Google (GIS) solo funciona en el origen registrado en Google Cloud
  // (el dominio raíz). Como el perfil corre en el subdominio del workspace, abrimos
  // un popup a /oauth servido desde la raíz. El popup hace la vinculación contra el
  // backend usando un token corto (no dependemos de window.opener, que COOP corta
  // entre subdominios distintos). Acá detectamos el cierre del popup y refrescamos.
  async function connectGoogleViaPopup() {
    setGoogleMsg({ text: '', error: false })
    setGoogleBusy(true)

    let linkToken
    try {
      const { data } = await api.post('/profile/google-link-token')
      linkToken = data.linkToken
    } catch {
      setGoogleBusy(false)
      setGoogleMsg({ text: 'No se pudo iniciar la conexión. Intentá de nuevo.', error: true })
      return
    }

    const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
    const onAppDomain = window.location.hostname === appDomain || window.location.hostname.endsWith(`.${appDomain}`)
    const base = onAppDomain ? `https://${appDomain}` : ''
    const oauthUrl = `${base}/oauth?link=${encodeURIComponent(linkToken)}`

    const popup = window.open(oauthUrl, 'bliss-google-connect', 'width=500,height=620')
    if (!popup) {
      setGoogleBusy(false)
      setGoogleMsg({ text: 'Tu navegador bloqueó la ventana emergente. Permitila e intentá de nuevo.', error: true })
      return
    }

    const timer = setInterval(async () => {
      if (!popup.closed) return
      clearInterval(timer)
      try {
        const { data } = await api.get('/profile')
        if (data.googleConnected) {
          setProfile(p => ({ ...p, googleConnected: true }))
          setGoogleMsg({ text: 'Cuenta de Google conectada. Ya podés iniciar sesión con Google.', error: false })
        } else {
          setGoogleMsg({ text: 'No se completó la conexión con Google.', error: false })
        }
      } catch { /* ignore */ }
      finally { setGoogleBusy(false) }
    }, 800)
  }

  async function handleDisconnectGoogle() {
    setGoogleBusy(true)
    setGoogleMsg({ text: '', error: false })
    try {
      await api.delete('/profile/connect-google')
      setProfile(p => ({ ...p, googleConnected: false }))
      setGoogleMsg({ text: 'Cuenta de Google desconectada.', error: false })
    } catch (err) {
      setGoogleMsg({ text: err.response?.data?.error || 'No se pudo desconectar la cuenta de Google.', error: true })
    } finally {
      setGoogleBusy(false)
    }
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <LoadingSpinner className="py-20" />
      </div>
    )
  }

  const joinDate = new Date(profile.createdAt).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Identity card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
          <div className="flex items-center gap-5 mb-5">
            <button onClick={() => openLightbox(profile.avatar ?? '2bee.png')} className="flex-shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
              <img
                src={avatarUrl(profile.avatar)}
                alt="avatar"
                className="w-24 h-24 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600 hover:opacity-90 transition-opacity cursor-zoom-in"
              />
            </button>
            <div>
              {/* Nombre editable */}
              {editingName ? (
                <div className="flex items-center gap-2 mb-1">
                  <input
                    autoFocus
                    value={nameValue}
                    onChange={e => setNameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                    className="text-xl font-bold bg-transparent border-b-2 border-primary-500 text-gray-900 dark:text-white focus:outline-none w-48"
                  />
                  <button onClick={handleSaveName} disabled={nameSaving}
                    className="text-primary-600 hover:text-primary-700 disabled:opacity-50 transition-colors"
                    title="Guardar">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </button>
                  <button onClick={() => setEditingName(false)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    title="Cancelar">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">{profile.name}</h1>
                  <button onClick={startEditName}
                    className="text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 transition-colors"
                    title="Editar nombre">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a4 4 0 01-1.414.93l-3.536.707.707-3.536A4 4 0 019 13z" /></svg>
                  </button>
                </div>
              )}
              {nameError && <p className="text-xs text-red-500 mb-1">{nameError}</p>}
              {profile.role && <div className="mt-1"><RoleBadge role={profile.role} /></div>}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">En Bliss desde el {joinDate}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{profile.email}</p>
            </div>
          </div>

          {/* Avatar picker */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Foto de perfil</p>
            <div className="flex items-end gap-3 flex-wrap">
              {avatars.map((a, i) => (
                <div key={a.filename} className="relative group">
                  <button
                    onClick={() => setSelectedAvatar(a.filename)}
                    title={a.label}
                    className={`rounded-full transition-all ${
                      selectedAvatar === a.filename
                        ? 'ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-gray-800'
                        : 'opacity-60 hover:opacity-90'
                    }`}
                  >
                    <img
                      src={avatarUrl(a.filename)}
                      alt={a.label}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  </button>
                  {/* Botón de zoom */}
                  <button
                    onClick={() => setLightboxIndex(i)}
                    title={`Ver ${a.label}`}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-gray-800/80 hover:bg-gray-700 rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                      <path d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" />
                    </svg>
                  </button>
                </div>
              ))}
              {selectedAvatar && selectedAvatar !== (profile.avatar ?? '2bee.png') && (
                <button
                  onClick={handleSaveAvatar}
                  disabled={avatarSaving}
                  className="ml-2 text-sm bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-2 transition-colors"
                >
                  {avatarSaving ? 'Guardando...' : 'Guardar foto'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Vacaciones */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">🏖️ Vacaciones</h2>
            <button
              onClick={() => setVacRequestOpen(true)}
              className="flex items-center gap-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Solicitar días
            </button>
          </div>

          {/* Días disponibles */}
          <div className="flex items-center gap-6 mb-4">
            <div className="text-center">
              <p className="text-4xl font-bold text-primary-600 dark:text-primary-400">
                {vacData?.vacationDays ?? '—'}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">días disponibles</p>
            </div>
            <button
              onClick={() => setVacHistoryOpen(v => !v)}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium flex items-center gap-1"
            >
              {vacHistoryOpen ? '▲' : '▼'} Ver historial de cambios
              {vacData?.adjustments && <span className="text-gray-400">({vacData.adjustments.length})</span>}
            </button>
          </div>

          {/* Historial de ajustes */}
          {vacHistoryOpen && (
            <div className="mb-4 max-h-48 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
              {!vacData?.adjustments?.length
                ? <p className="text-xs text-gray-400 text-center py-4">Sin historial de cambios</p>
                : vacData.adjustments.map(adj => (
                    <div key={adj.id} className="flex items-start gap-3 px-4 py-3 text-xs">
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-700 dark:text-gray-200">{adj.description}</p>
                        <p className="text-gray-400 dark:text-gray-500 mt-0.5">
                          {new Date(adj.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <span className={`flex-shrink-0 font-bold ${adj.newDays >= adj.prevDays ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                        {adj.prevDays} → {adj.newDays}
                      </span>
                    </div>
                  ))
              }
            </div>
          )}

          {/* Solicitudes */}
          {vacData?.requests?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Mis solicitudes</p>
              <div className="space-y-2">
                {vacData.requests.map(req => {
                  const typeLabel = LEAVE_TYPES.find(t => t.value === req.type)?.label ?? req.type
                  return (
                    <div key={req.id} className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{typeLabel}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[req.status]}`}>
                            {STATUS_LABELS[req.status]}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {req.startDate === req.endDate
                            ? new Date(req.startDate + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
                            : `${new Date(req.startDate + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} → ${new Date(req.endDate + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}`
                          }
                        </p>
                        {req.observation && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic">{req.observation}</p>}
                        {req.reviewNote && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Nota: {req.reviewNote}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {vacRequestOpen && (
          <VacationRequestModal
            onClose={() => setVacRequestOpen(false)}
            onCreated={req => {
              setVacData(prev => prev ? ({ ...prev, requests: [req, ...(prev.requests ?? [])] }) : prev)
              setVacRequestOpen(false)
            }}
          />
        )}

        {/* Change password */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Cambiar contraseña</h2>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <Field label="Contraseña actual">
              <input
                type="password"
                required
                value={pwForm.currentPassword}
                onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))}
                placeholder="••••••••"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nueva contraseña">
                <input
                  type="password"
                  required
                  minLength={8}
                  value={pwForm.newPassword}
                  onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
                  placeholder="••••••••"
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </Field>
              <Field label="Confirmar contraseña">
                <input
                  type="password"
                  required
                  value={pwForm.confirmPassword}
                  onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
                  placeholder="••••••••"
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </Field>
            </div>

            {pwMsg.text && (
              <p className={`text-sm rounded-lg px-3 py-2 ${
                pwMsg.error
                  ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              }`}>
                {pwMsg.text}
              </p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={pwSaving}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg px-5 py-2 transition-colors"
              >
                {pwSaving ? 'Guardando...' : 'Cambiar contraseña'}
              </button>
            </div>
          </form>
        </div>

        {/* Email de la cuenta */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Email de la cuenta</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            Email actual: <strong className="text-gray-600 dark:text-gray-300">{profile.email}</strong>. Te enviaremos un link de confirmación al nuevo correo antes de aplicar el cambio.
          </p>
          <form onSubmit={handleRequestEmailChange} className="space-y-3">
            <Field label="Nuevo email">
              <input
                type="email"
                required
                value={emailForm.newEmail}
                onChange={e => setEmailForm(f => ({ ...f, newEmail: e.target.value }))}
                placeholder="nuevo@email.com"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </Field>
            <Field label="Contraseña actual">
              <input
                type="password"
                required
                value={emailForm.password}
                onChange={e => setEmailForm(f => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </Field>

            {emailMsg.text && (
              <p className={`text-sm rounded-lg px-3 py-2 ${
                emailMsg.error
                  ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              }`}>
                {emailMsg.text}
              </p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={emailSaving}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg px-5 py-2 transition-colors"
              >
                {emailSaving ? 'Enviando...' : 'Cambiar email'}
              </button>
            </div>
          </form>
        </div>

        {/* Iniciar sesión con Google */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Iniciar sesión con Google</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            Conectá tu cuenta de Google para poder iniciar sesión con un clic. Funciona aunque el email de Google sea distinto a tu email primario.
          </p>

          {profile.googleConnected ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                <span className="w-2 h-2 rounded-full bg-green-500" /> Cuenta de Google conectada
              </span>
              <button
                onClick={handleDisconnectGoogle}
                disabled={googleBusy}
                className="text-sm font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-60"
              >
                {googleBusy ? 'Procesando...' : 'Desconectar'}
              </button>
            </div>
          ) : (
            <button
              onClick={connectGoogleViaPopup}
              disabled={googleBusy}
              className="inline-flex items-center gap-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-sm font-medium text-gray-700 dark:text-gray-100 rounded-lg px-4 py-2 transition-colors disabled:opacity-60"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
              </svg>
              {googleBusy ? 'Conectando...' : 'Conectar con Google'}
            </button>
          )}

          {googleMsg.text && (
            <p className={`mt-3 text-sm rounded-lg px-3 py-2 ${
              googleMsg.error
                ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
            }`}>
              {googleMsg.text}
            </p>
          )}
        </div>

        {/* Personal data */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Datos personales</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">Podés completar y actualizar estos datos en cualquier momento.</p>

          <form onSubmit={handleSavePersonal} className="space-y-5">

            <LegajoFormFields fields={legajoFields} values={values} onChange={setValue} />

            {saveMsg && (
              <p className="text-sm bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg px-3 py-2">
                {saveMsg}
              </p>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={saving}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg px-5 py-2 transition-colors"
              >
                {saving ? 'Guardando...' : 'Guardar datos'}
              </button>
            </div>
          </form>
        </div>

      </main>

      {lightboxIndex !== null && (
        <AvatarLightbox
          avatars={avatars.map(a => ({ file: a.filename, label: a.label }))}
          index={lightboxIndex}
          onNavigate={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}
