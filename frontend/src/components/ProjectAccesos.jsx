import { useState, useEffect } from 'react'
import api from '../api/client'
import ConfirmModal from './ConfirmModal'

const EMPTY_FORM = { account: '', username: '', password: '', twofa: '', extra: '' }

export default function ProjectAccesos({ projectId }) {
  const [accesses, setAccesses] = useState([])
  const [loading, setLoading]   = useState(true)
  const [forbidden, setForbidden] = useState(false)

  const [form, setForm]         = useState(null)   // null = oculto
  const [showFormPw, setShowFormPw] = useState(false)
  const [showFormTwofa, setShowFormTwofa] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [formError, setFormError] = useState('')

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

  async function handleAdd() {
    const { account, username, password, twofa, extra } = form
    if (![account, username, password, twofa, extra].some(v => v.trim())) {
      setFormError('Completá al menos un campo.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const { data } = await api.post(`/projects/${projectId}/accesos`, {
        account: account.trim(),
        username: username.trim(),
        password: password.trim(),
        twofa: twofa.trim(),
        extra: extra.trim(),
      })
      setAccesses(prev => [...prev, data])
      setForm(null)
      setShowFormPw(false)
      setShowFormTwofa(false)
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
          Solo el equipo del proyecto puede ver los accesos.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Accesos</p>
        {!form && (
          <button
            onClick={() => { setForm({ ...EMPTY_FORM }); setFormError(''); setShowFormPw(false); setShowFormTwofa(false) }}
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

      {/* Lista de accesos */}
      {accesses.length > 0 && (
        <div className="space-y-2 mb-2">
          {accesses.map(a => (
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
              </div>

              <button
                onClick={() => setAccessToDelete(a.id)}
                className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-all rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
                title="Eliminar acceso"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Formulario de alta */}
      {form && (
        <div className="mt-2 space-y-2 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40 p-3">
          <input
            type="text"
            placeholder="Cuenta (ej. Instagram)"
            value={form.account}
            onChange={e => setForm(p => ({ ...p, account: e.target.value }))}
            className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <input
            type="text"
            placeholder="Usuario"
            autoComplete="off"
            value={form.username}
            onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
            className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <div className="relative">
            <input
              type={showFormPw ? 'text' : 'password'}
              placeholder="Contraseña"
              autoComplete="new-password"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              className="w-full text-sm px-3 py-1.5 pr-14 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            <button
              type="button"
              onClick={() => setShowFormPw(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
            >
              {showFormPw ? 'ocultar' : 'ver'}
            </button>
          </div>
          <div className="relative">
            <input
              type={showFormTwofa ? 'text' : 'password'}
              placeholder="2FA / Segundo factor (opcional)"
              autoComplete="new-password"
              value={form.twofa}
              onChange={e => setForm(p => ({ ...p, twofa: e.target.value }))}
              className="w-full text-sm px-3 py-1.5 pr-14 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            <button
              type="button"
              onClick={() => setShowFormTwofa(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
            >
              {showFormTwofa ? 'ocultar' : 'ver'}
            </button>
          </div>
          <input
            type="text"
            placeholder="Extra (opcional)"
            value={form.extra}
            onChange={e => setForm(p => ({ ...p, extra: e.target.value }))}
            className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          {formError && <p className="text-xs text-red-500">{formError}</p>}
          <div className="flex items-center gap-2 pt-0.5">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="text-sm px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              onClick={() => { setForm(null); setShowFormPw(false); setShowFormTwofa(false); setFormError('') }}
              className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">La contraseña y el 2FA se guardan cifrados.</span>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!accessToDelete}
        title="Eliminar acceso"
        message="No se puede deshacer."
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setAccessToDelete(null)}
      />
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
      {done ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-green-500">
          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
          <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
        </svg>
      )}
    </button>
  )
}
