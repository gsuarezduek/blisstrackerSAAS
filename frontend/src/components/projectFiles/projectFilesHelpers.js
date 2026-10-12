// ═══════════════════════════════════════════════════════════════════════════════
// ProjectFiles — helpers compartidos
// ═══════════════════════════════════════════════════════════════════════════════

// Fecha corta: "3 sep" (o "3 sep 2025" si no es el año en curso) — se usa para
// mostrar quién subió/borró algo sin ocupar mucho espacio en la grilla.
export function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

// "🔗 Copiar enlace" — deep-link para pegar en la descripción/comentario de una
// tarea (linkify.jsx la vuelve clickeable). Al abrirlo, ProjectFiles resuelve
// la carpeta contenedora y abre el archivo automáticamente (ver `locate`).
export function fileDeepLink(projectId, item) {
  return `${window.location.origin}/my-projects/${projectId}?infoTab=archivos&fileId=${item.id}`
}

export const SORT_OPTIONS = [
  { value: 'name-asc',  label: 'Nombre (A-Z)' },
  { value: 'name-desc', label: 'Nombre (Z-A)' },
  { value: 'date-desc', label: 'Más reciente primero' },
  { value: 'date-asc',  label: 'Más antiguo primero' },
  { value: 'size-desc', label: 'Tamaño (mayor primero)' },
]

export function sortItems(list, sortBy) {
  const sorted = [...list]
  switch (sortBy) {
    case 'name-desc': return sorted.sort((a, b) => b.name.localeCompare(a.name))
    case 'date-desc': return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    case 'date-asc':  return sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    case 'size-desc': return sorted.sort((a, b) => (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1))
    default:          return sorted.sort((a, b) => a.name.localeCompare(b.name)) // name-asc
  }
}
