// Renderiza el formulario de legajo a partir de la config (campos default + custom).
// Driven por datos: agrupa por `group`, respeta `order`, omite los deshabilitados.
//
// Props:
//  · fields    array de campos resueltos del backend
//  · values    objeto plano { [field.key]: value } con TODOS los campos (builtin + custom)
//  · onChange  (key, value) => void

const inputCls = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent'

function FieldInput({ field, value, onChange }) {
  const v = value ?? ''
  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          value={v}
          onChange={e => onChange(field.key, e.target.value)}
          rows={2}
          className={`${inputCls} resize-none`}
        />
      )
    case 'number':
      return <input type="number" value={v} onChange={e => onChange(field.key, e.target.value)} className={inputCls} />
    case 'date':
      return <input type="date" value={v ? String(v).slice(0, 10) : ''} onChange={e => onChange(field.key, e.target.value)} className={inputCls} />
    case 'boolean':
      return (
        <select value={v === true ? 'true' : v === false ? 'false' : v} onChange={e => onChange(field.key, e.target.value)} className={inputCls}>
          <option value="">— Sin especificar —</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      )
    case 'select':
      return (
        <select value={v} onChange={e => onChange(field.key, e.target.value)} className={inputCls}>
          <option value="">— Sin especificar —</option>
          {(field.options || []).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )
    default:
      return <input type="text" value={v} onChange={e => onChange(field.key, e.target.value)} className={inputCls} />
  }
}

export default function LegajoFormFields({ fields, values, onChange }) {
  const visible = fields.filter(f => f.enabled !== false).sort((a, b) => a.order - b.order)

  // Agrupar preservando el orden de aparición de cada grupo
  const groups = []
  const byTitle = {}
  for (const f of visible) {
    const title = f.group || 'Otros datos'
    if (!byTitle[title]) { byTitle[title] = []; groups.push(title) }
    byTitle[title].push(f)
  }

  if (visible.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500">No hay campos de legajo configurados.</p>
  }

  return (
    <div className="space-y-5">
      {groups.map(title => (
        <div key={title}>
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">{title}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {byTitle[title].map(f => (
              <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <FieldInput field={f} value={values[f.key]} onChange={onChange} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
