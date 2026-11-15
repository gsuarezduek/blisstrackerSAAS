// ═══════════════════════════════════════════════════════════════════════════════
// Enlaces (backlinks) — helpers compartidos por las 4 vistas
// ═══════════════════════════════════════════════════════════════════════════════
export { fmtDateShort, fmtNum, drBand, drPill } from '../seo/seoHelpers'

// Estado de vida de un enlace. `bloqueado` NO está acá a propósito: es un estado
// de CHEQUEO, no del enlace (un sitio que nos devuelve 403 puede seguir
// enlazándonos). Ver lib/backlinks.js en el backend.
export const LINK_STATUS = {
  activo:          { label: 'Activo',          chip: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
  perdido:         { label: 'Perdido',         chip: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' },
  roto:            { label: 'Página rota',     chip: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800' },
  redirigido:      { label: 'Redirigido',      chip: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
  sin_verificar:   { label: 'Sin verificar',   chip: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600' },
  no_verificable:  { label: 'No verificable',  chip: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600' },
}

// Lo que dice el `rel`: es lo que decide si el enlace transmite autoridad.
export const LINK_TYPE = {
  follow:    { label: 'Follow',    chip: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400', help: 'Transmite autoridad' },
  nofollow:  { label: 'Nofollow',  chip: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',               help: 'No transmite autoridad' },
  sponsored: { label: 'Pago',      chip: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400',     help: 'Enlace pago o patrocinado' },
  ugc:       { label: 'UGC',       chip: 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400',                 help: 'Contenido de usuarios (comentario, foro)' },
  unknown:   { label: 'Sin dato',  chip: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',               help: 'Todavía no se verificó' },
}

export const PLACEMENTS = [
  { value: '',            label: 'Sin especificar' },
  { value: 'editorial',   label: 'Editorial (dentro de una nota)' },
  { value: 'directorio',  label: 'Directorio' },
  { value: 'guest_post',  label: 'Guest post' },
  { value: 'foro',        label: 'Foro o comentario' },
  { value: 'prensa',      label: 'Prensa' },
  { value: 'perfil',      label: 'Perfil o ficha' },
  { value: 'otro',        label: 'Otro' },
]

// Estado de un chequeo individual (el historial). Incluye los dos que no mueven
// el estado del enlace, para que el historial explique POR QUÉ no se movió.
export const CHECK_STATUS = {
  activo:     { label: 'Enlace encontrado',  tone: 'text-emerald-600 dark:text-emerald-400' },
  sin_link:   { label: 'Ya no está',         tone: 'text-red-600 dark:text-red-400' },
  roto:       { label: 'Página con error',   tone: 'text-orange-600 dark:text-orange-400' },
  redirigido: { label: 'Redirige a otro sitio', tone: 'text-amber-600 dark:text-amber-400' },
  bloqueado:  { label: 'El sitio nos bloqueó', tone: 'text-gray-500 dark:text-gray-400' },
  error:      { label: 'No se pudo chequear',  tone: 'text-gray-500 dark:text-gray-400' },
}

export const statusMeta = s => LINK_STATUS[s] || LINK_STATUS.sin_verificar
export const typeMeta   = t => LINK_TYPE[t]   || LINK_TYPE.unknown

/** Host sin protocolo ni www, para mostrar la fila compacta. */
export function shortHost(url) {
  try { return new URL(url).host.replace(/^www\./, '') } catch { return String(url || '') }
}

/** La ruta sola, para no repetir el dominio en cada fila de un mismo sitio. */
export function shortPath(url) {
  try {
    const u = new URL(url)
    const path = `${u.pathname}${u.search}`.replace(/\/$/, '')
    return path && path !== '/' ? path : '/'
  } catch { return '' }
}

/**
 * Las fuentes que puede tener una lectura del perfil. Son las herramientas donde
 * el dato existe de verdad: nosotros no lo medimos, lo registramos.
 */
export const REPORTED_SOURCES = [
  { value: 'ahrefs',  label: 'Ahrefs' },
  { value: 'semrush', label: 'Semrush' },
  { value: 'gsc',     label: 'Search Console' },
  { value: 'otro',    label: 'Otra' },
]

export const sourceLabel = s => REPORTED_SOURCES.find(x => x.value === s)?.label || s || '—'

/** De dónde salió una fila del inventario. */
export const ORIGIN_LABEL = {
  manual:      'Carga manual',
  csv_ahrefs:  'CSV de Ahrefs',
  csv_semrush: 'CSV de Semrush',
  csv_gsc:     'CSV de Search Console',
  agent:       'Agente de IA',
  prospect:    'Oportunidad conseguida',
}
