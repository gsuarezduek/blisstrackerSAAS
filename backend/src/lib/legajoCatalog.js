// Catálogo del legajo (datos personales del equipo).
//
// Dos tipos de campo:
//  · builtin  → mapea a una columna fija de `User` (global al usuario, compartida entre workspaces).
//               No se puede borrar ni cambiar su tipo/columna; sí ocultar, renombrar, marcar obligatorio y reordenar.
//  · custom   → definido por el workspace, se guarda en `WorkspaceMember.legajoData` (JSON, workspace-scoped).
//
// `Workspace.legajoFields` guarda la config completa (builtins editados + customs). Si está vacío, se usan los defaults.

const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'boolean']

// Opciones de los selects builtin (fuente única — antes estaban duplicadas y desalineadas entre MyProfile y RRHH).
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
const BLOOD_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(v => ({ value: v, label: v }))

// Campos default. `key === column` para todos los builtin. `order` es global (no por grupo).
const DEFAULT_LEGAJO_FIELDS = [
  { key: 'phone',             label: 'Celular',                          type: 'text',     group: 'Contacto',             column: 'phone' },
  { key: 'birthday',          label: 'Fecha de nacimiento',              type: 'date',     group: 'Contacto',             column: 'birthday' },
  { key: 'address',           label: 'Dirección',                        type: 'text',     group: 'Contacto',             column: 'address' },
  { key: 'emergencyContact',  label: 'Contacto de emergencia',           type: 'text',     group: 'Contacto',             column: 'emergencyContact' },
  { key: 'dni',               label: 'DNI',                              type: 'text',     group: 'Identidad y fiscal',   column: 'dni' },
  { key: 'cuit',              label: 'CUIT',                             type: 'text',     group: 'Identidad y fiscal',   column: 'cuit' },
  { key: 'alias',             label: 'Alias CBU',                        type: 'text',     group: 'Identidad y fiscal',   column: 'alias' },
  { key: 'bankName',          label: 'Banco',                            type: 'text',     group: 'Identidad y fiscal',   column: 'bankName' },
  { key: 'maritalStatus',     label: 'Estado civil',                     type: 'select',   group: 'Información personal',  column: 'maritalStatus', options: MARITAL_OPTIONS },
  { key: 'children',          label: 'Hijos',                            type: 'number',   group: 'Información personal',  column: 'children' },
  { key: 'educationLevel',    label: 'Nivel de estudios',                type: 'select',   group: 'Educación',            column: 'educationLevel', options: EDUCATION_OPTIONS },
  { key: 'educationTitle',    label: 'Título',                           type: 'text',     group: 'Educación',            column: 'educationTitle' },
  { key: 'bloodType',         label: 'Grupo sanguíneo',                  type: 'select',   group: 'Salud',                column: 'bloodType', options: BLOOD_OPTIONS },
  { key: 'healthInsurance',   label: 'Obra social',                      type: 'text',     group: 'Salud',                column: 'healthInsurance' },
  { key: 'medicalConditions', label: 'Enfermedades, patologías o alergias', type: 'textarea', group: 'Salud',           column: 'medicalConditions' },
].map((f, i) => ({ ...f, builtin: true, required: false, enabled: true, order: i }))

const BUILTIN_KEYS = new Set(DEFAULT_LEGAJO_FIELDS.map(f => f.key))
const BUILTIN_BY_KEY = Object.fromEntries(DEFAULT_LEGAJO_FIELDS.map(f => [f.key, f]))

// Normaliza un campo entrante (de la config guardada o del request) a la forma canónica.
// Para builtins, blinda type/column/key/options/group-builtin de manipulaciones del cliente.
function normalizeField(raw, order) {
  if (!raw || typeof raw !== 'object') return null
  const key = String(raw.key || '').trim()
  if (!key) return null

  if (BUILTIN_KEYS.has(key)) {
    const base = BUILTIN_BY_KEY[key]
    return {
      ...base,
      label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : base.label,
      group: typeof raw.group === 'string' && raw.group.trim() ? raw.group.trim() : base.group,
      required: !!raw.required,
      enabled: raw.enabled !== false,
      order,
    }
  }

  // Campo custom
  const type = FIELD_TYPES.includes(raw.type) ? raw.type : 'text'
  const field = {
    key,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : key,
    type,
    group: typeof raw.group === 'string' && raw.group.trim() ? raw.group.trim() : 'Otros datos',
    required: !!raw.required,
    enabled: raw.enabled !== false,
    builtin: false,
    order,
  }
  if (type === 'select') {
    const opts = Array.isArray(raw.options) ? raw.options : []
    field.options = opts
      .map(o => {
        if (typeof o === 'string') return { value: o.trim(), label: o.trim() }
        const value = String(o?.value ?? '').trim()
        return value ? { value, label: String(o?.label ?? value).trim() || value } : null
      })
      .filter(Boolean)
  }
  return field
}

// Resuelve la config efectiva: la guardada (si hay) o los defaults, garantizando que
// TODOS los builtins estén presentes (si falta alguno por una config vieja, se agrega).
function resolveLegajoFields(legajoFields) {
  const stored = Array.isArray(legajoFields) ? legajoFields : []
  if (stored.length === 0) return DEFAULT_LEGAJO_FIELDS.map(f => ({ ...f }))

  const seen = new Set()
  const out = []
  stored.forEach((raw, i) => {
    const f = normalizeField(raw, i)
    if (f && !seen.has(f.key)) { seen.add(f.key); out.push(f) }
  })
  // Re-agregar builtins faltantes al final
  for (const b of DEFAULT_LEGAJO_FIELDS) {
    if (!seen.has(b.key)) out.push({ ...b, order: out.length })
  }
  return out.map((f, i) => ({ ...f, order: i }))
}

// Valida + normaliza la config que envía el admin. Lanza Error con .status=400 si es inválida.
function sanitizeLegajoFieldsInput(input) {
  if (!Array.isArray(input)) {
    const e = new Error('legajoFields debe ser un array'); e.status = 400; throw e
  }
  const seen = new Set()
  const out = []
  input.forEach((raw, i) => {
    const f = normalizeField(raw, i)
    if (!f) return
    if (seen.has(f.key)) {
      const e = new Error(`Clave de campo duplicada: ${f.key}`); e.status = 400; throw e
    }
    if (f.type === 'select' && (!f.options || f.options.length === 0)) {
      const e = new Error(`El campo "${f.label}" es de tipo lista y necesita al menos una opción`); e.status = 400; throw e
    }
    seen.add(f.key)
    out.push(f)
  })
  // Garantizar todos los builtins
  for (const b of DEFAULT_LEGAJO_FIELDS) {
    if (!seen.has(b.key)) out.push({ ...b, order: out.length })
  }
  return out.map((f, i) => ({ ...f, order: i }))
}

// Coacciona el valor de un campo custom según su tipo (para guardar en legajoData).
function coerceCustomValue(field, value) {
  if (value === null || value === undefined || value === '') return undefined
  switch (field.type) {
    case 'number': {
      const n = Number(value)
      return Number.isFinite(n) ? n : undefined
    }
    case 'boolean':
      return value === true || value === 'true'
    default:
      return String(value)
  }
}

module.exports = {
  FIELD_TYPES,
  DEFAULT_LEGAJO_FIELDS,
  BUILTIN_KEYS,
  resolveLegajoFields,
  sanitizeLegajoFieldsInput,
  coerceCustomValue,
}
