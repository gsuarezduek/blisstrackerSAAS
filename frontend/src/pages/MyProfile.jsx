import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import AvatarLightbox from '../components/AvatarLightbox'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import useRoles from '../hooks/useRoles'

const AVATARS = [
  { file: '1babee.png',        label: 'Baby Bee' },
  { file: '2bee.png',          label: 'Bee' },
  { file: '10beemate.png',     label: 'Bee Mate' },
  { file: '11beeartist.png',   label: 'Bee Artista' },
  { file: '12beecoffee.png',   label: 'Bee Coffee' },
  { file: '13beecorp.png',     label: 'Bee Corp' },
  { file: '14beefitness.png',  label: 'Bee Fitness' },
  { file: '15futbee.png',      label: 'Fut Bee' },
  { file: '16beeloween.png',   label: 'Bee-loween' },
  { file: '17beepunk.png',     label: 'Bee Punk' },
  { file: '18golfbee.png',     label: 'Golf Bee' },
  { file: '19beenfluencer.png',label: 'Bee-nfluencer' },
  { file: '20beecypher.png',   label: 'Bee Cypher' },
  { file: '21beegamer.png',    label: 'Bee Gamer' },
  { file: '22beehacker.png',   label: 'Bee Hacker' },
  { file: '23beeJ.png',        label: 'Bee J' },
  { file: '30harleybee.png',   label: 'Harley Bee' },
  { file: '31beezen.png',      label: 'Bee Zen' },
  { file: '32beezombie.png',   label: 'Bee Zombie' },
  { file: '33darthbee.png',    label: 'Darth Bee' },
  { file: '34beeBorg.png',     label: 'Bee Borg' },
  { file: '35beempire.png',    label: 'Bee-mpire' },
  { file: '36beecodelica.png', label: 'Bee-codelica' },
]

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, type = 'text', placeholder }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
    />
  )
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
    >
      <option value="">— Sin especificar —</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

const MARITAL_OPTIONS = [
  { value: 'soltero', label: 'Soltero/a' },
  { value: 'casado', label: 'Casado/a' },
  { value: 'divorciado', label: 'Divorciado/a' },
  { value: 'viudo', label: 'Viudo/a' },
  { value: 'union_convivencial', label: 'Unión convivencial' },
]

const EDUCATION_OPTIONS = [
  { value: 'primario', label: 'Primario' },
  { value: 'secundario', label: 'Secundario' },
  { value: 'terciario', label: 'Terciario' },
  { value: 'universitario', label: 'Universitario' },
  { value: 'posgrado', label: 'Posgrado' },
]

const BLOOD_OPTIONS = [
  'A+','A-','B+','B-','AB+','AB-','O+','O-'
].map(v => ({ value: v, label: v }))

export default function MyProfile() {
  const { user, updateUser } = useAuth()
  const { labelFor } = useRoles()

  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState({ text: '', error: false })

  const [avatarSaving, setAvatarSaving] = useState(false)
  const [selectedAvatar, setSelectedAvatar] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null) // null = cerrado

  function openLightbox(file) {
    const idx = AVATARS.findIndex(a => a.file === file)
    setLightboxIndex(idx >= 0 ? idx : 0)
  }

  useEffect(() => {
    api.get('/profile').then(({ data }) => {
      setProfile(data)
      setSelectedAvatar(data.avatar ?? '2bee.png')
      setForm({
        phone:            data.phone ?? '',
        birthday:         data.birthday ? data.birthday.slice(0, 10) : '',
        address:          data.address ?? '',
        dni:              data.dni ?? '',
        cuit:             data.cuit ?? '',
        alias:            data.alias ?? '',
        bankName:         data.bankName ?? '',
        maritalStatus:    data.maritalStatus ?? '',
        children:         data.children ?? '',
        educationLevel:   data.educationLevel ?? '',
        educationTitle:   data.educationTitle ?? '',
        bloodType:        data.bloodType ?? '',
        medicalConditions: data.medicalConditions ?? '',
        healthInsurance:  data.healthInsurance ?? '',
        emergencyContact: data.emergencyContact ?? '',
      })
    })
  }, [])

  function set(field) {
    return val => setForm(prev => ({ ...prev, [field]: val }))
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
      const { data } = await api.patch('/profile', form)
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

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <div className="flex items-center justify-center py-20 text-gray-400">Cargando...</div>
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
                src={`/perfiles/${profile.avatar ?? '2bee.png'}`}
                alt="avatar"
                className="w-24 h-24 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600 hover:opacity-90 transition-opacity cursor-zoom-in"
              />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{profile.name}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{labelFor(profile.role)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">En Bliss desde el {joinDate}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{profile.email}</p>
            </div>
          </div>

          {/* Avatar picker */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Foto de perfil</p>
            <div className="flex items-end gap-3 flex-wrap">
              {AVATARS.map((a, i) => (
                <div key={a.file} className="relative group">
                  <button
                    onClick={() => setSelectedAvatar(a.file)}
                    title={a.label}
                    className={`rounded-full transition-all ${
                      selectedAvatar === a.file
                        ? 'ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-gray-800'
                        : 'opacity-60 hover:opacity-90'
                    }`}
                  >
                    <img
                      src={`/perfiles/${a.file}`}
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
              {selectedAvatar !== (profile.avatar ?? '2bee.png') && (
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
                  minLength={6}
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

        {/* Personal data */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Datos personales</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">Podés completar y actualizar estos datos en cualquier momento.</p>

          <form onSubmit={handleSavePersonal} className="space-y-5">

            {/* Contacto */}
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Contacto</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Celular">
                  <Input value={form.phone} onChange={set('phone')} placeholder="+54 9 11 1234-5678" />
                </Field>
                <Field label="Fecha de nacimiento">
                  <Input type="date" value={form.birthday} onChange={set('birthday')} />
                </Field>
                <Field label="Dirección">
                  <Input value={form.address} onChange={set('address')} placeholder="Av. Corrientes 1234, CABA" />
                </Field>
                <Field label="Contacto de emergencia">
                  <Input value={form.emergencyContact} onChange={set('emergencyContact')} placeholder="Nombre — Teléfono" />
                </Field>
              </div>
            </div>

            {/* Identidad */}
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Identidad y fiscal</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="DNI">
                  <Input value={form.dni} onChange={set('dni')} placeholder="12.345.678" />
                </Field>
                <Field label="CUIT">
                  <Input value={form.cuit} onChange={set('cuit')} placeholder="20-12345678-9" />
                </Field>
                <Field label="Alias CBU">
                  <Input value={form.alias} onChange={set('alias')} placeholder="nombre.alias.mp" />
                </Field>
                <Field label="Banco">
                  <Input value={form.bankName} onChange={set('bankName')} placeholder="Ej: Santander, Galicia, Naranja X" />
                </Field>
              </div>
            </div>

            {/* Personal */}
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Información personal</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Estado civil">
                  <Select value={form.maritalStatus} onChange={set('maritalStatus')} options={MARITAL_OPTIONS} />
                </Field>
                <Field label="Hijos">
                  <Input type="number" value={form.children} onChange={set('children')} placeholder="0" />
                </Field>
              </div>
            </div>

            {/* Educación */}
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Educación</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nivel de estudios">
                  <Select value={form.educationLevel} onChange={set('educationLevel')} options={EDUCATION_OPTIONS} />
                </Field>
                <Field label="Título">
                  <Input value={form.educationTitle} onChange={set('educationTitle')} placeholder="Lic. en Marketing..." />
                </Field>
              </div>
            </div>

            {/* Salud */}
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Salud</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Grupo sanguíneo">
                  <Select value={form.bloodType} onChange={set('bloodType')} options={BLOOD_OPTIONS} />
                </Field>
                <Field label="Obra social">
                  <Input value={form.healthInsurance} onChange={set('healthInsurance')} placeholder="OSDE, Swiss Medical..." />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Enfermedades, patologías o alergias">
                    <textarea
                      value={form.medicalConditions ?? ''}
                      onChange={e => set('medicalConditions')(e.target.value)}
                      placeholder="Ninguna / Describí si aplica..."
                      rows={2}
                      className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                    />
                  </Field>
                </div>
              </div>
            </div>

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
          avatars={AVATARS}
          index={lightboxIndex}
          onNavigate={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}
