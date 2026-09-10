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

export const STATUS_COLOR = {
  pending: { bg: '#fef3e2', color: '#c2670a' },
  approved: { bg: '#dcfce7', color: '#15803d' },
  rejected: { bg: '#fee2e2', color: '#b91c1c' },
}

export function vacationTypeLabel(type) {
  return VACATION_TYPES.find(t => t.value === type)?.label || type
}

export function benefitBankLabel(bank) {
  return BENEFIT_BANKS.find(b => b.value === bank)?.label || bank
}
