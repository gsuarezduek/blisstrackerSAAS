const { parsePhoneNumberFromString } = require('libphonenumber-js')
const { getCountryForTimezone } = require('countries-and-timezones')

// Código de país ISO 3166-1 alpha-2 (ej. "AR") a partir del timezone del
// workspace — usado como hint opcional para normalizePhone cuando el número
// viene sin código de país (ej. el intake público de leads).
function countryFromTimezone(tz) {
  const c = tz && getCountryForTimezone(tz)
  return c?.id || null
}

// Normaliza un teléfono a "+<dígitos>" (E.164). Sin `countryHint`, o si el
// parseo falla, NO infiere código de país (adivinar mal sería peor que
// dejarlo sin código: rompería el match en vez de arreglarlo) — mismo
// criterio que ya usaba whatsapp.webhook.js para los números entrantes de
// WhatsApp (que siempre vienen con el código de país completo, puesto por
// Meta) y que siguen usando contacts.controller.js/leads.controller.js al
// no pasar `countryHint`.
//
// Con `countryHint`, intenta inferir el país faltante (ej. "02612577987" +
// hint "AR" → "+542612577987"). Un número que ya viene con "+" se parsea tal
// cual, sin tocarlo, aunque se pase un hint.
//
// Matiz Argentina: el plan de numeración no distingue celular de fijo solo
// por los dígitos (ni con la metadata completa de libphonenumber) — como un
// teléfono cargado en un formulario de contacto es casi siempre un celular,
// se asume celular por default (inserta el "9" del formato internacional) si
// no vino ya. Es una heurística, no una garantía.
function normalizePhone(raw, { countryHint } = {}) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null

  if (countryHint) {
    try {
      const parsed = parsePhoneNumberFromString(trimmed, countryHint)
      if (parsed && parsed.isValid()) {
        let e164 = parsed.number
        if (countryHint === 'AR' && e164.startsWith('+54') && !e164.startsWith('+549')) {
          e164 = `+549${e164.slice(3)}`
        }
        return e164
      }
    } catch { /* input raro, cae al fallback de siempre */ }
  }

  const digits = trimmed.replace(/\D/g, '')
  return digits ? `+${digits}` : null
}

module.exports = { normalizePhone, countryFromTimezone }
