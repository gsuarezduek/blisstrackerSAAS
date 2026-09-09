/**
 * Catálogo de los "bancos de beneficios" (BenefitBankAdjustment/BenefitBankRequest):
 * horas libres y días home, otorgados a mano por el admin (premio de un juego de
 * Gamification, cobertura de un evento fuera de horario, etc.) y consumidos por
 * autoservicio con aprobación. No son licencias legales (eso es VacationRequest).
 *
 * Único punto de ajuste si se agrega un tercer banco a futuro: sumar la entrada
 * acá y en el catálogo espejo del frontend (frontend/src/pages/rrhh/shared.jsx).
 */

const BANKS = ['horas_libres', 'dias_home']

const BANK_CONFIG = {
  horas_libres: { label: 'horas libres', unit: 'horas', balanceField: 'freeHoursBalance' },
  dias_home:    { label: 'días home',    unit: 'días',  balanceField: 'homeDaysBalance' },
}

function isValidBank(bank) {
  return BANKS.includes(bank)
}

function balanceFieldFor(bank) {
  return BANK_CONFIG[bank]?.balanceField
}

function labelFor(bank) {
  return BANK_CONFIG[bank]?.label || bank
}

function unitFor(bank) {
  return BANK_CONFIG[bank]?.unit || ''
}

module.exports = { BANKS, BANK_CONFIG, isValidBank, balanceFieldFor, labelFor, unitFor }
