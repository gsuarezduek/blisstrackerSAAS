import { useState, useEffect } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'
import { clearLegajoFieldsCache } from '../../hooks/useLegajoFields'

const TYPE_LABELS = { text: 'Texto', textarea: 'Texto largo', number: 'Número', date: 'Fecha', select: 'Lista', boolean: 'Sí / No' }
const TYPE_OPTIONS = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))

const inputCls = 'border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

export default function LegajoTab() {
  const [fields, setFields]   = useState([])
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState({ text: '', error: false })

  useEffect(() => {
    api.get('/legajo/fields')
      .then(({ data }) => { setFields(data.fields); setEnabled(data.legajoEnabled) })
      .finally(() => setLoading(false))
  }, [])

  function update(i, patch) {
    setFields(fs => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  }
  function move(i, dir) {
    setFields(fs => {
      const j = i + dir
      if (j < 0 || j >= fs.length) return fs
      const c = [...fs]; [c[i], c[j]] = [c[j], c[i]]
      return c.map((f, k) => ({ ...f, order: k }))
    })
  }
  function remove(i) {
    setFields(fs => fs.filter((_, j) => j !== i).map((f, k) => ({ ...f, order: k })))
  }
  function addField() {
    const keys = new Set(fields.map(f => f.key))
    let n = 1; while (keys.has(`custom_${n}`)) n++
    setFields(fs => [...fs, {
      key: `custom_${n}`, label: 'Nuevo campo', type: 'text', group: 'Otros datos',
      required: false, enabled: true, builtin: false, order: fs.length, options: [],
    }])
  }
  function setOptionsText(i, text) {
    const options = text.split(',').map(s => s.trim()).filter(Boolean).map(s => ({ value: s, label: s }))
    update(i, { options })
  }

  async function save() {
    setSaving(true); setMsg({ text: '', error: false })
    try {
      const { data } = await api.put('/legajo/fields', { fields, legajoEnabled: enabled })
      setFields(data.fields); setEnabled(data.legajoEnabled)
      clearLegajoFieldsCache()
      setMsg({ text: 'Cambios guardados.', error: false })
      setTimeout(() => setMsg({ text: '', error: false }), 3000)
    } catch (err) {
      setMsg({ text: err.response?.data?.error || 'Error al guardar.', error: true })
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><LoadingSpinner /></div>

  return (
    <div className="space-y-5">
      {/* Encabezado + toggle maestro */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Formulario de legajo</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          Definí qué datos completa cada persona en su perfil. Podés ocultar campos, marcarlos obligatorios,
          reordenarlos y agregar campos propios. Los campos base no se pueden borrar (solo ocultar).
        </p>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-primary-600" />
          <span>
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Mostrar el estado del legajo en RRHH</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Si lo apagás, no se muestra la tarjeta ni el aviso de legajos incompletos en el panel de RRHH.
            </span>
          </span>
        </label>
      </div>

      {/* Lista de campos */}
      <div className="space-y-2">
        {fields.map((f, i) => (
          <div key={f.key} className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4">
            <div className="flex items-start gap-3">
              {/* Reordenar */}
              <div className="flex flex-col gap-0.5 pt-1">
                <button onClick={() => move(i, -1)} disabled={i === 0}
                  className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30" title="Subir">▲</button>
                <button onClick={() => move(i, 1)} disabled={i === fields.length - 1}
                  className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30" title="Bajar">▼</button>
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                {/* Fila 1: label + tipo + badge */}
                <div className="flex flex-wrap items-center gap-2">
                  <input value={f.label} onChange={e => update(i, { label: e.target.value })}
                    placeholder="Nombre del campo" className={`${inputCls} flex-1 min-w-[160px]`} />
                  {f.builtin ? (
                    <span className="text-xs px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                      Base · {TYPE_LABELS[f.type] ?? f.type}
                    </span>
                  ) : (
                    <select value={f.type} onChange={e => update(i, { type: e.target.value })} className={inputCls}>
                      {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                </div>

                {/* Fila 2: grupo + opciones (si select) */}
                <div className="flex flex-wrap items-center gap-2">
                  <input value={f.group ?? ''} onChange={e => update(i, { group: e.target.value })}
                    placeholder="Sección (ej: Contacto)" className={`${inputCls} w-44`} />
                  {f.type === 'select' && !f.builtin && (
                    <input
                      value={(f.options || []).map(o => o.label).join(', ')}
                      onChange={e => setOptionsText(i, e.target.value)}
                      placeholder="Opciones separadas por coma"
                      className={`${inputCls} flex-1 min-w-[200px]`} />
                  )}
                  {f.type === 'select' && f.builtin && (
                    <span className="text-xs text-gray-400">{(f.options || []).length} opciones fijas</span>
                  )}
                </div>

                {/* Fila 3: checks + borrar */}
                <div className="flex flex-wrap items-center gap-4 pt-0.5">
                  <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" checked={f.enabled !== false} onChange={e => update(i, { enabled: e.target.checked })}
                      className="w-3.5 h-3.5 accent-primary-600" />
                    Visible
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" checked={!!f.required} onChange={e => update(i, { required: e.target.checked })}
                      className="w-3.5 h-3.5 accent-primary-600" />
                    Obligatorio
                  </label>
                  {!f.builtin && (
                    <button onClick={() => remove(i)} className="text-xs text-red-500 hover:text-red-600 ml-auto">
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-3">
        <button onClick={addField}
          className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          + Agregar campo
        </button>
        <button onClick={save} disabled={saving}
          className="px-5 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {msg.text && (
          <span className={`text-sm ${msg.error ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  )
}
