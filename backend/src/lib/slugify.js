// Convierte un nombre libre (ej. nombre de proyecto) en una clave estable para URL.
// Quita acentos, pasa a minúsculas, reemplaza todo lo que no sea alfanumérico por
// guiones y recorta guiones sobrantes. Usado para el slug de los canales de chat.
function slugify(text, maxLength = 40) {
  const base = (text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos (marcas diacríticas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '')
  return base || 'canal'
}

module.exports = { slugify }
