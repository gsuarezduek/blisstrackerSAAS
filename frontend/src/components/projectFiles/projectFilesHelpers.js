// ═══════════════════════════════════════════════════════════════════════════════
// ProjectFiles — helpers compartidos
// ═══════════════════════════════════════════════════════════════════════════════

import api from '../../api/client'

// Mueve cada ítem por separado, así que puede salir bien solo una parte:
// `moved` son los que efectivamente cambiaron de carpeta. Lo usan el MoveModal y
// el arrastre. `parentId` null = la raíz.
export async function moveItems(projectId, items, parentId) {
  const results = await Promise.allSettled(
    items.map(it => api.patch(`/projects/${projectId}/files/${it.id}`, { parentId }))
  )
  const moved = items.filter((_, i) => results[i].status === 'fulfilled')
  const failed = items.length - moved.length
  const error = failed === 0 ? '' : failed === items.length ? 'No se pudo mover' : `${failed} de ${items.length} no se pudieron mover`
  return { moved, error }
}

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

// ─── Acciones del menú "⋯" de un ítem ────────────────────────────────────────
// Las dos vistas (grilla y lista) ofrecen exactamente las mismas acciones, pero
// las presentan distinto: la grilla con un botón flotante sobre la tarjeta, la
// lista con una columna al final. Lo que se comparte es ESTO —qué acciones hay
// y cuándo— y no el dropdown, para que agregar una acción no haya que acordarse
// de hacerlo dos veces.
//
// Devuelve `[{ label, onClick, danger? }]`, la forma que espera <OverflowMenu>.
// Un handler en null saca su acción de la lista (así se apagan "Contenido" sin
// el módulo, o "Crear tarea" donde no aplica).
export function itemMenuActions(item, h) {
  const isFolder = item.type === 'folder'
  const actions = []
  // "Ver" solo donde el click en el ítem no alcanza: una imagen abre el
  // lightbox y una carpeta navega, pero un video o un PDF necesitan el paso
  // explícito.
  if (!isFolder && !item.mimeType?.startsWith('image/') && item.previewable) {
    actions.push({ label: 'Ver', onClick: () => h.onOpen(item) })
  }
  actions.push({ label: 'Renombrar', onClick: () => h.onRename(item) })
  actions.push({ label: 'Mover', onClick: () => h.onMove(item) })
  if (h.onShare) actions.push({ label: item.isPublic ? 'Compartido' : 'Compartir', onClick: () => h.onShare(item) })
  if (!isFolder) {
    actions.push({ label: 'Descargar', onClick: () => h.onDownload(item) })
    actions.push({ label: 'Copiar enlace', onClick: () => h.onCopyLink(item) })
    if (h.onLinkToContent) actions.push({ label: 'Contenido', onClick: () => h.onLinkToContent(item) })
    if (h.onCreateTask) actions.push({ label: 'Crear tarea', onClick: () => h.onCreateTask(item) })
  }
  actions.push({ label: 'Eliminar', onClick: () => h.onDelete(item), danger: true })
  return actions
}

// ─── Modo de vista: grilla de miniaturas o lista con columnas ────────────────
// La elección se recuerda por navegador (mismo criterio que la pestaña abierta
// del panel "Más tarde" del Dashboard): es una preferencia de cómo mirar, no un
// dato del workspace, y no vale una columna en la DB ni un request.
export const VIEW_STORAGE_KEY = 'bliss_files_view'

export function loadViewMode() {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'grid'
  } catch { return 'grid' } // Safari en modo privado puede tirar al leer
}

export function saveViewMode(mode) {
  try { localStorage.setItem(VIEW_STORAGE_KEY, mode) } catch { /* preferencia perdida, nada más */ }
}

// Qué columna ordena cada opción del selector, para poder pintar la flecha en
// el encabezado correcto y para que clickear una columna cicle entre sus dos
// sentidos. Es la misma lista de SORT_OPTIONS vista al revés: en la lista el
// orden no se elige en un <select>, se elige clickeando la columna (como Drive).
export const SORT_BY_COLUMN = {
  name: { asc: 'name-asc', desc: 'name-desc' },
  date: { asc: 'date-asc', desc: 'date-desc' },
  size: { desc: 'size-desc' }, // no hay 'size-asc' en SORT_OPTIONS: nadie busca el archivo más chico
}

// Devuelve el sortBy que corresponde a clickear una columna, alternando el
// sentido si ya se estaba ordenando por ella.
export function nextSortForColumn(column, currentSortBy) {
  const dirs = SORT_BY_COLUMN[column]
  if (!dirs) return currentSortBy
  if (currentSortBy === dirs.asc && dirs.desc) return dirs.desc
  if (currentSortBy === dirs.desc && dirs.asc) return dirs.asc
  // Primer click en la columna: el sentido más útil de cada una — alfabético
  // de la A, y lo más nuevo/grande primero.
  return dirs.asc && column === 'name' ? dirs.asc : dirs.desc
}

// Dirección activa de una columna, o null si el orden actual no es por ella.
export function sortDirFor(column, sortBy) {
  const dirs = SORT_BY_COLUMN[column]
  if (!dirs) return null
  if (sortBy === dirs.asc) return 'asc'
  if (sortBy === dirs.desc) return 'desc'
  return null
}
