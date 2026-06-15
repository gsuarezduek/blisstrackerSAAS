// Helpers compartidos para el legajo (campos default + custom).
// Un "campo" tiene la forma resuelta por el backend:
//   { key, label, type, group, builtin, column?, options?, required, enabled, order }

// Valor crudo de un campo para una persona.
//  · builtin → columna de User (person[key])
//  · custom  → person.legajoData[key]
export function fieldValue(person, field) {
  if (!person) return undefined
  if (field.builtin) return person[field.key]
  return person.legajoData?.[field.key]
}

export function isEmpty(v) {
  return v === null || v === undefined || v === ''
}

// Texto listo para mostrar (resuelve labels de select, fechas y booleanos).
export function displayValue(field, value) {
  if (isEmpty(value)) return null
  switch (field.type) {
    case 'select': {
      const opt = (field.options || []).find(o => o.value === value)
      return opt?.label ?? String(value)
    }
    case 'boolean':
      return value === true || value === 'true' ? 'Sí' : 'No'
    case 'date': {
      const d = new Date(String(value).length <= 10 ? `${value}T12:00:00` : value)
      return isNaN(d) ? String(value) : d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
    }
    default:
      return String(value)
  }
}

// Campos que cuentan para "completitud": habilitados y obligatorios.
export function requiredFields(fields) {
  return fields.filter(f => f.enabled !== false && f.required)
}

// ¿El legajo de esta persona está completo?
//  · Si hay campos obligatorios → todos cargados.
//  · Si no hay obligatorios → se considera completo solo si cargó al menos un dato (heurística legacy).
export function isLegajoComplete(person, fields) {
  const req = requiredFields(fields)
  if (req.length > 0) return req.every(f => !isEmpty(fieldValue(person, f)))
  const enabled = fields.filter(f => f.enabled !== false)
  return enabled.some(f => !isEmpty(fieldValue(person, f)))
}
