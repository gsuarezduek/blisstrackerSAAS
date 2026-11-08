import { useState, useEffect } from 'react'
import { Pencil, X, Copy, Check } from 'lucide-react'
import api from '../api/client'
import { Icon } from './ui/Icon'
import ConfirmModal from './ConfirmModal'
import ProjectAccessHistory from './ProjectAccessHistory'
import { fmtCreatedAt } from '../utils/format'

const EMPTY_FORM = {
  id: null, account: '', username: '', password: '', twofa: '', extra: '',
  // Solo en edición: marcar un secreto para borrarlo. Hace falta porque un campo
  // vacío significa "dejala como está", no "borrala" — ver handleSave().
  clearPassword: false, clearTwofa: false, hasPassword: false, hasTwofa: false,
}

// Un acceso editado muestra desde cuándo. Se compara contra el alta con un
// margen de 1s porque create y update se escriben en el mismo instante.
const wasEdited = (a) =>
  a.updatedAt && a.createdAt && new Date(a.updatedAt) - new Date(a.createdAt) > 1000

// "Cargado por Ana · editado por Juan hoy" — de quién es el dato y quién lo tocó
// último, la pregunta que se hace cuando una credencial dejó de funcionar. Los
// accesos cargados antes de que esto existiera no tienen autor: ahí se muestra
// sólo la parte que se sabe, nunca se adivina.
function attribution(a) {
  const parts = []
  if (a.createdBy) parts.push(`cargado por ${a.createdBy.name}`)
  if (wasEdited(a)) {
    const when = fmtCreatedAt(a.updatedAt)
    parts.push(a.updatedBy ? `editado por ${a.updatedBy.name} ${when}` : `editado ${when}`)
  }
  if (parts.length === 0) return null
  const line = parts.join(' · ')
  return line.charAt(0).toUpperCase() + line.slice(1)
}

const ART = 'America/Argentina/Buenos_Aires'
const longDate = (iso) =>
  new Date(iso).toLocaleString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: ART,
  })

function attributionTitle(a) {
  const parts = [`Cargado el ${longDate(a.createdAt)}`]
  if (wasEdited(a)) parts.push(`editado el ${longDate(a.updatedAt)}`)
  return parts.join(' · ')
}

export default function ProjectAccesos({ projectId }) {
  const [accesses, setAccesses] = useState([])
  const [loading, setLoading]   = useState(true)
  const [forbidden, setForbidden] = useState(false)

  const [form, setForm]         = useState(null)   // null = oculto; form.id = editando ese acceso
  const [saving, setSaving]     = useState(false)
  const [formError, setFormError] = useState('')
  const [logsKey, setLogsKey]   = useState(0)      // sube al guardar/borrar: refresca el historial abierto

  const [revealed, setRevealed]     = useState({}) // { [`${id}:${field}`]: plaintext }
  const [revealingKey, setRevealingKey] = useState(null)
  const [copied, setCopied]         = useState(null) // `${id}:${field}`
  const [accessToDelete, setAccessToDelete] = useState(null) // id | null
  const [deleting, setDeleting]     = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    api.get(`/projects/${projectId}/accesos`)
      .then(r => { if (active) { setAccesses(r.data); setForbidden(false) } })
      .catch(err => { if (active && err.response?.status === 403) setForbidden(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId])

  function openAdd() {
    setForm({ ...EMPTY_FORM })
    setFormError('')
  }

  // En edición los secretos NO se traen: el campo arranca vacío y vacío significa
  // "sin cambios", así corregir un usuario no obliga a revelar antes la contraseña.
  function openEdit(a) {
    setForm({
      ...EMPTY_FORM,
      id: a.id,
      account:  a.account  ?? '',
      username: a.username ?? '',
      extra:    a.extra    ?? '',
      hasPassword: a.hasPassword,
      hasTwofa:    a.hasTwofa,
    })
    setFormError('')
  }

  function closeForm() {
    setForm(null)
    setFormError('')
  }

  // Saca de la pantalla lo que se había revelado de un acceso: después de
  // editarlo o borrarlo, el texto en claro que quedaba a la vista ya no vale.
  function dropRevealed(id) {
    setRevealed(prev => {
      const next = {}
      for (const [k, v] of Object.entries(prev)) if (!k.startsWith(`${id}:`)) next[k] = v
      return next
    })
  }

  async function handleSave() {
    const trim = (v) => v.trim()
    if (!form.id && !['account', 'username', 'password', 'twofa', 'extra'].some(f => trim(form[f]))) {
      setFormError('Completá al menos un campo.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      if (form.id) {
        // Los campos de texto van siempre (vacío = borrarlos, que es lo que se ve
        // en el formulario); los secretos solo si se escribió algo o se los marcó
        // para quitar — la clave ausente es la que deja el valor actual intacto.
        const payload = {
          account:  trim(form.account),
          username: trim(form.username),
          extra:    trim(form.extra),
        }
        if (form.clearPassword)      payload.password = ''
        else if (trim(form.password)) payload.password = trim(form.password)
        if (form.clearTwofa)       payload.twofa = ''
        else if (trim(form.twofa)) payload.twofa = trim(form.twofa)

        const { data } = await api.patch(`/projects/${projectId}/accesos/${form.id}`, payload)
        setAccesses(prev => prev.map(a => (a.id === data.id ? data : a)))
        dropRevealed(form.id)
      } else {
        const { data } = await api.post(`/projects/${projectId}/accesos`, {
          account:  trim(form.account),
          username: trim(form.username),
          password: trim(form.password),
          twofa:    trim(form.twofa),
          extra:    trim(form.extra),
        })
        setAccesses(prev => [...prev, data])
      }
      setLogsKey(k => k + 1)
      closeForm()
    } catch (err) {
      setFormError(err.response?.data?.error || 'Error al guardar el acceso.')
    } finally {
      setSaving(false)
    }
  }

  // Revela (o vuelve a ocultar) un dato sensible — field = "password" | "twofa".
  async function handleReveal(id, field) {
    const key = `${id}:${field}`
    if (revealed[key] !== undefined) {
      setRevealed(prev => { const n = { ...prev }; delete n[key]; return n })
      return
    }
    setRevealingKey(key)
    try {
      const { data } = await api.get(`/projects/${projectId}/accesos/${id}/reveal`, { params: { field } })
      setRevealed(prev => ({ ...prev, [key]: data.value ?? '' }))
      setLogsKey(k => k + 1) // el reveal también es una entrada del historial
    } catch {
      // silencioso: el botón vuelve a su estado
    } finally {
      setRevealingKey(null)
    }
  }

  async function handleDelete() {
    if (!accessToDelete) return
    setDeleting(true)
    try {
      await api.delete(`/projects/${projectId}/accesos/${accessToDelete}`)
      setAccesses(prev => prev.filter(a => a.id !== accessToDelete))
      dropRevealed(accessToDelete)
      if (form?.id === accessToDelete) closeForm()
      setLogsKey(k => k + 1)
    } catch (err) {
      console.error('Error al eliminar acceso', err)
    } finally {
      setDeleting(false)
      setAccessToDelete(null)
    }
  }

  async function copy(text, key) {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(c => (c === key ? null : c)), 1500)
    } catch { /* clipboard no disponible */ }
  }

  if (forbidden) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Accesos</p>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No se pudieron cargar los accesos.
        </p>
      </div>
    )
  }

  const formProps = { form, setForm, saving, formError, onSave: handleSave, onCancel: closeForm }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Accesos</p>
        {!form && (
          <button
            onClick={openAdd}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
          >
            + Agregar nuevo acceso
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando…</p>}

      {!loading && accesses.length === 0 && !form && (
        <p className="text-sm text-gray-400 dark:text-gray-500">Sin accesos cargados por el momento.</p>
      )}

      {/* Lista de accesos — el que se está editando se reemplaza por el formulario */}
      {accesses.length > 0 && (
        <div className="space-y-2 mb-2">
          {accesses.map(a => (
            form?.id === a.id ? (
              <AccessForm key={a.id} {...formProps} />
            ) : (
              <div
                key={a.id}
                className="group flex items-start gap-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40 px-3 py-2.5"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  {a.account && (
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 break-words">{a.account}</p>
                  )}

                  {a.username && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="text-gray-400 dark:text-gray-500 text-xs w-16 flex-shrink-0">Usuario</span>
                      <span className="text-gray-700 dark:text-gray-200 break-all">{a.username}</span>
                      <CopyBtn onClick={() => copy(a.username, `${a.id}:user`)} done={copied === `${a.id}:user`} />
                    </div>
                  )}

                  {a.hasPassword && (
                    <SecretRow
                      label="Contraseña" id={a.id} field="password"
                      revealed={revealed} revealingKey={revealingKey}
                      onReveal={handleReveal} onCopy={copy} copied={copied}
                    />
                  )}

                  {a.hasTwofa && (
                    <SecretRow
                      label="2FA" id={a.id} field="twofa"
                      revealed={revealed} revealingKey={revealingKey}
                      onReveal={handleReveal} onCopy={copy} copied={copied}
                    />
                  )}

                  {a.extra && (
                    <div className="flex items-start gap-1.5 text-sm">
                      <span className="text-gray-400 dark:text-gray-500 text-xs w-16 flex-shrink-0">Extra</span>
                      <span className="text-gray-600 dark:text-gray-300 break-words whitespace-pre-wrap">{a.extra}</span>
                    </div>
                  )}

                  {attribution(a) && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 pt-0.5" title={attributionTitle(a)}>
                      {attribution(a)}
                    </p>
                  )}
                </div>

                {/* En mobile quedan siempre visibles: sin hover no hay forma de llegar a ellos */}
                <div className="flex items-center gap-0.5 flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(a)}
                    className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors rounded-full hover:bg-primary-50 dark:hover:bg-primary-900/20"
                    title="Editar acceso"
                  >
                    <Icon as={Pencil} size={14} />
                  </button>
                  <button
                    onClick={() => setAccessToDelete(a.id)}
                    className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors rounded-full hover:bg-red-50 dark:hover:bg-red-900/20"
                    title="Eliminar acceso"
                  >
                    <Icon as={X} size={14} />
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
      )}

      {/* Formulario de alta (el de edición se renderiza en el lugar de su fila) */}
      {form && !form.id && <AccessForm {...formProps} />}

      <ProjectAccessHistory projectId={projectId} reloadKey={logsKey} />

      <ConfirmModal
        open={!!accessToDelete}
        title="Eliminar acceso"
        message="No se puede deshacer. Queda registrado en el historial."
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setAccessToDelete(null)}
      />
    </div>
  )
}

const INPUT_CLASS = 'w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400'

// Formulario de alta y de edición. La diferencia está en los dos campos
// secretos: en el alta son el valor a guardar, en la edición arrancan vacíos y
// vacío significa "no la cambies".
function AccessForm({ form, setForm, saving, formError, onSave, onCancel }) {
  const editing = !!form.id
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40 p-3">
      <input
        type="text"
        placeholder="Cuenta (ej. Instagram)"
        value={form.account}
        onChange={set('account')}
        className={INPUT_CLASS}
      />
      <input
        type="text"
        placeholder="Usuario"
        autoComplete="off"
        value={form.username}
        onChange={set('username')}
        className={INPUT_CLASS}
      />
      <SecretField
        placeholder={editing && form.hasPassword ? 'Contraseña nueva (vacío = sin cambios)' : 'Contraseña'}
        value={form.password}
        onChange={set('password')}
        canClear={editing && form.hasPassword}
        cleared={form.clearPassword}
        onToggleClear={() => setForm(p => ({ ...p, clearPassword: !p.clearPassword, password: '' }))}
      />
      <SecretField
        placeholder={editing && form.hasTwofa ? '2FA nuevo (vacío = sin cambios)' : '2FA / Segundo factor (opcional)'}
        value={form.twofa}
        onChange={set('twofa')}
        canClear={editing && form.hasTwofa}
        cleared={form.clearTwofa}
        onToggleClear={() => setForm(p => ({ ...p, clearTwofa: !p.clearTwofa, twofa: '' }))}
      />
      <input
        type="text"
        placeholder="Extra (opcional)"
        value={form.extra}
        onChange={set('extra')}
        className={INPUT_CLASS}
      />
      {formError && <p className="text-xs text-red-500">{formError}</p>}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          onClick={onSave}
          disabled={saving}
          className="text-sm px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          onClick={onCancel}
          className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          Cancelar
        </button>
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto text-right">
          {editing
            ? 'El cambio queda en el historial (sin los valores).'
            : 'La contraseña y el 2FA se guardan cifrados.'}
        </span>
      </div>
    </div>
  )
}

// Campo de un dato sensible dentro del formulario: oculto mientras se escribe,
// con "ver" para chequear lo tipeado y, en edición, "quitar" para borrar el que
// ya estaba guardado (un campo vacío no alcanza: significa "sin cambios").
function SecretField({ placeholder, value, onChange, canClear, cleared, onToggleClear }) {
  const [show, setShow] = useState(false)

  if (cleared) {
    return (
      <div className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
        <span className="text-gray-500 dark:text-gray-400">Se va a borrar al guardar</span>
        <button
          type="button"
          onClick={onToggleClear}
          className="ml-auto text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
        >
          deshacer
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        autoComplete="new-password"
        value={value}
        onChange={onChange}
        className={`${INPUT_CLASS} ${canClear ? 'pr-28' : 'pr-14'}`}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
        >
          {show ? 'ocultar' : 'ver'}
        </button>
        {canClear && (
          <button
            type="button"
            onClick={onToggleClear}
            className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 font-medium"
          >
            quitar
          </button>
        )}
      </div>
    </div>
  )
}

// Fila de un dato sensible (contraseña / 2FA): oculto por defecto, se revela bajo demanda.
function SecretRow({ label, id, field, revealed, revealingKey, onReveal, onCopy, copied }) {
  const key = `${id}:${field}`
  const shown = revealed[key] !== undefined
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="text-gray-400 dark:text-gray-500 text-xs w-16 flex-shrink-0">{label}</span>
      <span className="text-gray-700 dark:text-gray-200 font-mono break-all">
        {shown ? (revealed[key] || '—') : '••••••••'}
      </span>
      <button
        onClick={() => onReveal(id, field)}
        disabled={revealingKey === key}
        className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium disabled:opacity-50"
      >
        {revealingKey === key ? '…' : (shown ? 'ocultar' : 'ver')}
      </button>
      {shown && revealed[key] && (
        <CopyBtn onClick={() => onCopy(revealed[key], `${key}:copy`)} done={copied === `${key}:copy`} />
      )}
    </div>
  )
}

function CopyBtn({ onClick, done }) {
  return (
    <button
      onClick={onClick}
      title="Copiar"
      className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors flex-shrink-0"
    >
      <Icon as={done ? Check : Copy} size={14} className={done ? 'text-green-500' : ''} />
    </button>
  )
}
