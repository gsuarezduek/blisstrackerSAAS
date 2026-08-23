// Normaliza un teléfono a "+<dígitos>" — solo limpia formato (espacios,
// guiones, paréntesis), NO infiere código de país si falta (adivinar mal
// sería peor que dejarlo sin código: rompería el match en vez de arreglarlo).
// Mismo criterio que ya usaba whatsapp.webhook.js para los números entrantes
// de WhatsApp (que siempre vienen con el código de país completo, puesto por
// Meta) — acá se aplica también a los teléfonos tipeados a mano en
// Contact.phone, para que ambos lados puedan intentar un match exacto en vez
// de depender solo de la heurística de últimos dígitos.
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  return digits ? `+${digits}` : null
}

module.exports = { normalizePhone }
