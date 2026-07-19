import { useState, useEffect } from 'react'
import api from '../../api/client'
import useRoles from '../../hooks/useRoles'

const input = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'

const EMPTY_SIG = { closing: '', name: '', role: '', email: '', phone: '', note: '', showLogo: false }

// Admin: configuración del módulo Ventas.
//  1. Equipo comercial — roles (teamRole) que acceden sin ser admin (Workspace.salesRoleNames).
//  2. Indicaciones para propuestas — guía persistente que la IA respeta (Workspace.salesProposalGuidelines).
//  3. Firma — datos de contacto que cierran el PDF de la propuesta (Workspace.salesSignature).
export default function SalesTeamModal({ onClose, onSaved }) {
  const { roles, labelFor } = useRoles()
  const [selected, setSelected] = useState([])
  const [adding, setAdding] = useState(false)
  const [guidelines, setGuidelines] = useState('')
  const [sig, setSig] = useState(EMPTY_SIG)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/workspaces/current')
      .then(({ data }) => {
        setSelected(Array.isArray(data.salesRoleNames) ? data.salesRoleNames : [])
        setGuidelines(data.salesProposalGuidelines || '')
        setSig({ ...EMPTY_SIG, ...(data.salesSignature && typeof data.salesSignature === 'object' ? data.salesSignature : {}) })
      })
      .catch(() => {})
  }, [])

  const remaining = roles.filter(r => !selected.includes(r.name))

  function addRole(name) { if (name) setSelected(s => [...s, name]); setAdding(false) }
  function removeRole(name) { setSelected(s => s.filter(x => x !== name)) }
  function setSigField(k, v) { setSig(s => ({ ...s, [k]: v })) }

  async function handleSave() {
    setSaving(true); setError('')
    try {
      await api.patch('/workspaces/current', { salesRoleNames: selected, salesProposalGuidelines: guidelines, salesSignature: sig })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar'); setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 my-auto">
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">Configuración de Ventas</h2>

        {/* 1. Equipo comercial */}
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Equipo comercial</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Roles cuyos integrantes pueden usar el módulo. Los administradores siempre acceden.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            {selected.map(name => (
              <span key={name} className="inline-flex items-center gap-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full pl-3 pr-2 py-1 text-xs font-medium">
                {labelFor(name)}
                <button onClick={() => removeRole(name)} className="hover:text-primary-900 dark:hover:text-white text-sm leading-none">×</button>
              </span>
            ))}
            {selected.length === 0 && !adding && <span className="text-xs text-gray-400">Sin roles asignados.</span>}
            {adding ? (
              <select autoFocus className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1 text-xs" defaultValue="" onChange={e => addRole(e.target.value)} onBlur={() => setAdding(false)}>
                <option value="" disabled>Elegir rol…</option>
                {remaining.map(r => <option key={r.name} value={r.name}>{r.label}</option>)}
              </select>
            ) : (
              remaining.length > 0 && (
                <button onClick={() => setAdding(true)} className="text-xs font-medium text-primary-600 hover:text-primary-700 border border-dashed border-primary-300 dark:border-primary-700 rounded-full px-3 py-1">+ Agregar rol</button>
              )
            )}
          </div>
        </div>

        {/* 2. Indicaciones para propuestas */}
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Indicaciones para propuestas (IA)</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Guía que la IA respeta al generar toda propuesta: tono, estructura, qué incluir o evitar, formato de precios, etc.
          </p>
          <textarea className={input} rows={5}
            placeholder={'Ej. Tono cercano y directo. Incluí siempre un cronograma por fases y resultados esperados a 90 días. No inventes precios: presentá el presupuesto como estimación.'}
            value={guidelines} onChange={e => setGuidelines(e.target.value)} />
        </div>

        {/* 3. Firma / Contacto del PDF */}
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Firma</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Cierra la propuesta en el PDF (sección "Contacto"): quién la envía y cómo despedirse.
          </p>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div><label className={label}>Cierre</label><input className={input} placeholder="Atte," value={sig.closing} onChange={e => setSigField('closing', e.target.value)} /></div>
              <div><label className={label}>Nombre</label><input className={input} placeholder="Nombre y apellido" value={sig.name} onChange={e => setSigField('name', e.target.value)} /></div>
              <div><label className={label}>Cargo</label><input className={input} placeholder="Ej. Ejecutivo comercial" value={sig.role} onChange={e => setSigField('role', e.target.value)} /></div>
              <div><label className={label}>Email</label><input className={input} placeholder="email@agencia.com" value={sig.email} onChange={e => setSigField('email', e.target.value)} /></div>
              <div><label className={label}>Teléfono</label><input className={input} placeholder="+54 …" value={sig.phone} onChange={e => setSigField('phone', e.target.value)} /></div>
            </div>
            <div>
              <label className={label}>Texto o frase de cierre (opcional)</label>
              <textarea className={input} rows={2} placeholder="Ej. Quedamos a disposición para coordinar una reunión." value={sig.note} onChange={e => setSigField('note', e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input type="checkbox" checked={sig.showLogo} onChange={e => setSigField('showLogo', e.target.checked)} className="rounded text-primary-600 focus:ring-primary-500" />
              Incluir el logo del workspace en la firma
            </label>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 mb-3">{error}</p>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-xl py-2.5 text-sm">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm">{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}
