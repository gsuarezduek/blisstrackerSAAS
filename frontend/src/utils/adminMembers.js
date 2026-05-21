// Filtra una lista de miembros para selects de responsable.
// Sólo admins/owners aparecen, pero si hay un currentOwnerId que es no-admin
// (asignación legacy), lo conservamos para no perder la asignación.
export function adminMemberOptions(members, currentOwnerId) {
  const isAdmin = m => m.role === 'admin' || m.role === 'owner'
  const result = members.filter(isAdmin)

  if (currentOwnerId != null) {
    const id = Number(currentOwnerId)
    const already = result.some(m => m.id === id)
    if (!already) {
      const owner = members.find(m => m.id === id)
      if (owner) result.push(owner)
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name, 'es'))
}
