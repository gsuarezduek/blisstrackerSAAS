import { avatarUrl } from '../../utils/avatarUrl'

// Primitivas visuales compartidas por las pestañas de la ficha del proyecto.
// Mismo lenguaje que el Dashboard rediseñado: tarjetas blancas con borde suave,
// títulos chicos en mayúscula y una sola acción destacada por bloque.

export const STATUS_META = {
  BLOCKED:     { label: 'Bloqueada', order: 0, dot: 'bg-red-500',     cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  IN_PROGRESS: { label: 'En curso',  order: 1, dot: 'bg-primary-500', cls: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' },
  PAUSED:      { label: 'Pausada',   order: 2, dot: 'bg-gray-400',    cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  PENDING:     { label: 'Pendiente', order: 3, dot: 'bg-gray-300',    cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
}

export function Card({ children, className = '' }) {
  return (
    <section className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 ${className}`}>
      {children}
    </section>
  )
}

// Encabezado de una tarjeta: título + acción secundaria opcional a la derecha.
export function CardHeader({ title, count, action, className = '' }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 pt-4 pb-2 ${className}`}>
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {title}{count != null && <span className="ml-1.5 text-gray-400 dark:text-gray-500 normal-case font-medium">· {count}</span>}
      </h3>
      {action}
    </div>
  )
}

export function TextButton({ children, onClick, className = '' }) {
  return (
    <button type="button" onClick={onClick}
      className={`whitespace-nowrap text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline ${className}`}>
      {children}
    </button>
  )
}

export function Avatar({ user, size = 'md', ring = false }) {
  const cls = size === 'xs' ? 'w-6 h-6' : size === 'sm' ? 'w-7 h-7' : 'w-9 h-9'
  return (
    <img
      src={avatarUrl(user.avatar)}
      alt={user.name}
      title={user.name}
      className={`${cls} rounded-full object-cover flex-shrink-0 ${ring ? 'ring-2 ring-white dark:ring-gray-800' : 'border border-gray-200 dark:border-gray-600'}`}
    />
  )
}

// Pila de avatares superpuestos con "+N" al final.
export function AvatarStack({ users, max = 5, size = 'sm' }) {
  const shown = users.slice(0, max)
  const rest = users.length - shown.length
  return (
    <div className="flex items-center -space-x-2">
      {shown.map(u => <Avatar key={u.id} user={u} size={size} ring />)}
      {rest > 0 && (
        <span className={`${size === 'xs' ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-xs'} rounded-full bg-gray-100 dark:bg-gray-700 ring-2 ring-white dark:ring-gray-800 flex items-center justify-center font-semibold text-gray-600 dark:text-gray-300`}>
          +{rest}
        </span>
      )}
    </div>
  )
}

export function StatusBadge({ status }) {
  const m = STATUS_META[status]
  if (!m) return null
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${m.cls}`}>{m.label}</span>
}

export function EmptyNote({ children }) {
  return <p className="px-4 pb-4 text-sm text-gray-400 dark:text-gray-500">{children}</p>
}

// ── Recorrer las tareas de la ficha ───────────────────────────────────────────
// `GET /projects/:id/tasks` devuelve las tareas en DOS grupos: `byUser` (las de las
// personas) y `byAgent` (las de los agentes de IA, que antes caían dentro de la tarjeta
// de su dueño y se perdían ahí).
//
// Todo lo que recorre o actualiza tareas en la ficha pasa por estos dos helpers y no por
// `data.byUser` directo. ProjectDetail.jsx solo tenía seis lugares que caminaban
// `byUser` —un lookup, dos contadores y tres actualizaciones optimistas (comentario,
// edición, borrado)—, y con un segundo grupo cada uno se duplicaba: alcanzaba con
// olvidar uno para que editar o borrar la tarea de un agente no se reflejara hasta
// recargar la página.

// Lista plana de todas las tareas de la ficha, de personas y de agentes.
export function allProjectTasks(data) {
  const fromUsers  = (data?.byUser  ?? []).flatMap(g => g.tasks)
  const fromAgents = (data?.byAgent ?? []).flatMap(g => g.tasks)
  return [...fromUsers, ...fromAgents]
}

// Devuelve un `data` nuevo con `fn` aplicada a cada tarea de los dos grupos. `fn` puede
// devolver `null` para sacar la tarea (es lo que usa el borrado).
export function mapProjectTasks(data, fn) {
  if (!data) return data
  const mapGroup = g => ({ ...g, tasks: g.tasks.map(fn).filter(Boolean) })
  return {
    ...data,
    byUser:  (data.byUser  ?? []).map(mapGroup),
    byAgent: (data.byAgent ?? []).map(mapGroup),
  }
}
