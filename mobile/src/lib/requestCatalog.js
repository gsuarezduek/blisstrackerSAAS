// Espejo mínimo de backend/src/controllers/vacation.controller.js (VALID_TYPES)
// y backend/src/lib/benefitBanks.js — solo lo necesario para etiquetas legibles
// en mobile, no la lógica de negocio (eso vive y se valida en el backend).
export const VACATION_TYPES = [
  { value: 'vacaciones', label: 'Vacaciones' },
  { value: 'estudio', label: 'Estudio' },
  { value: 'maternidad', label: 'Maternidad' },
  { value: 'paternidad', label: 'Paternidad' },
  { value: 'enfermedad', label: 'Enfermedad' },
  { value: 'duelo', label: 'Duelo' },
  { value: 'mudanza', label: 'Mudanza' },
  { value: 'otro', label: 'Otro' },
]

export const BENEFIT_BANKS = [
  { value: 'horas_libres', label: 'Horas libres', unit: 'horas' },
  { value: 'dias_home', label: 'Días home', unit: 'días' },
]

export const STATUS_LABEL = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
}

// Nombres de tokens de theme/colors.js (no hex directo) — quien los usa
// resuelve `colors[key]` contra el theme activo, para que el badge se vea
// bien tanto en claro como en oscuro.
export const STATUS_COLOR_KEYS = {
  pending: { bg: 'primarySoft', text: 'primarySoftText' },
  approved: { bg: 'successSoft', text: 'successText' },
  rejected: { bg: 'dangerSoft', text: 'dangerText' },
}

export function vacationTypeLabel(type) {
  return VACATION_TYPES.find(t => t.value === type)?.label || type
}

export function benefitBankLabel(bank) {
  return BENEFIT_BANKS.find(b => b.value === bank)?.label || bank
}
