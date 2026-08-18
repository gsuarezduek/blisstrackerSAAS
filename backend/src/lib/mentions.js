// Resuelve las @menciones de un texto contra una lista de miembros. Compartido
// por comentarios de tareas (miembros del proyecto) y chat (miembros del workspace).
// Matchea por nombre completo (preferido) o por primer nombre, tolerando nombres
// de cualquier cantidad de palabras (el autocompletado inserta el nombre completo,
// ej. "@María José García") y respetando límites de palabra para no confundir
// "@Ana" con "@Analía". Excluye al autor del texto.
function resolveMentions(text, members, authorId) {
  const haystack = text.toLowerCase()
  const isLetter = ch => ch !== undefined && /[a-záéíóúñü]/.test(ch)

  // Todas las apariciones de "@<form>" respetando límite de palabra al final.
  // Devuelve los índices del '@' donde matcheó.
  function findMatches(form) {
    const idxs = []
    let from = 0
    for (;;) {
      const idx = haystack.indexOf('@' + form, from)
      if (idx === -1) break
      if (!isLetter(haystack[idx + 1 + form.length])) idxs.push(idx)
      from = idx + 1
    }
    return idxs
  }

  const candidates = members
    .filter(m => m.id !== authorId && m.name)
    .map(m => {
      const full = m.name.toLowerCase().trim().replace(/\s+/g, ' ')
      return { id: m.id, full, first: full.split(' ')[0] }
    })

  const mentioned = new Set()

  // 1° pasada: nombres compuestos por nombre completo. Cada match "reclama"
  // el '@' donde ocurrió — un primer nombre homónimo de otra persona (ej.
  // "Marti G" cuando el texto dice "@Marti V") NO debe colarse ahí por el
  // fallback de primer nombre del 2° paso, aunque "marti" matchee igual como
  // substring: ese '@' ya está explicado por el nombre completo de otro.
  const claimedStarts = new Set()
  for (const c of candidates) {
    if (!c.full.includes(' ')) continue // nombre de una sola palabra: lo resuelve el 2° paso
    const idxs = findMatches(c.full)
    if (idxs.length) {
      mentioned.add(c.id)
      idxs.forEach(idx => claimedStarts.add(idx))
    }
  }

  // 2° pasada: primer nombre (o nombre de una sola palabra), solo en los '@'
  // que no quedaron reclamados por el nombre completo de otro miembro.
  for (const c of candidates) {
    if (mentioned.has(c.id)) continue
    const idxs = findMatches(c.first)
    if (idxs.some(idx => !claimedStarts.has(idx))) mentioned.add(c.id)
  }

  return mentioned
}

module.exports = { resolveMentions }
