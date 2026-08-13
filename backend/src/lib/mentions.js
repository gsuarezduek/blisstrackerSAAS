// Resuelve las @menciones de un texto contra una lista de miembros. Compartido
// por comentarios de tareas (miembros del proyecto) y chat (miembros del workspace).
// Matchea por nombre completo (preferido) o por primer nombre, tolerando nombres
// de cualquier cantidad de palabras (el autocompletado inserta el nombre completo,
// ej. "@María José García") y respetando límites de palabra para no confundir
// "@Ana" con "@Analía". Excluye al autor del texto.
function resolveMentions(text, members, authorId) {
  const haystack = text.toLowerCase()
  const isLetter = ch => ch !== undefined && /[a-záéíóúñü]/.test(ch)
  const mentioned = new Set()

  for (const m of members) {
    if (m.id === authorId || !m.name) continue
    const full  = m.name.toLowerCase().trim().replace(/\s+/g, ' ')
    const first = full.split(' ')[0]
    // Probar nombre completo primero, luego primer nombre como fallback.
    const hit = [full, first].some(form => {
      if (!form) return false
      let from = 0
      for (;;) {
        const idx = haystack.indexOf('@' + form, from)
        if (idx === -1) return false
        // El caracter siguiente no debe ser otra letra (límite de palabra).
        if (!isLetter(haystack[idx + 1 + form.length])) return true
        from = idx + 1
      }
    })
    if (hit) mentioned.add(m.id)
  }
  return mentioned
}

module.exports = { resolveMentions }
