import { useState, useRef, memo } from 'react'
import LoadingSpinner from '../components/LoadingSpinner'
import { avatarUrl } from '../utils/avatarUrl'
import UserLink from '../components/UserLink'
import { completedMinutes, fmtMins, completedDuration } from '../utils/format'

function fmtShortDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', timeZone: 'America/Argentina/Buenos_Aires',
  })
}

const SEGUIMIENTO_STATUS_LABEL = {
  PENDING: 'Pendiente', IN_PROGRESS: 'En curso', PAUSED: 'Pausada', BLOCKED: 'Bloqueada', COMPLETED: 'Completada',
}
const SEGUIMIENTO_STATUS_COLOR = {
  PENDING: 'text-gray-400 dark:text-gray-500',
  IN_PROGRESS: 'text-primary-600 dark:text-primary-400',
  PAUSED: 'text-gray-500 dark:text-gray-400',
  BLOCKED: 'text-red-600 dark:text-red-400',
  COMPLETED: 'text-green-600 dark:text-green-400',
}
// Orden de urgencia dentro de la sección Seguimiento: lo bloqueado necesita atención primero.
export const SEGUIMIENTO_STATUS_PRIORITY = { BLOCKED: 0, IN_PROGRESS: 1, PAUSED: 2, PENDING: 3, COMPLETED: 4 }

// "Visto" por tarea (firma status+comentarios) persistido en localStorage por usuario,
// para marcar con un punto las filas que cambiaron desde la última vez que se abrieron.
export function seguimientoSeenKey(userId) { return `bliss_seguimiento_seen_${userId}` }
export function loadSeguimientoSeen(userId) {
  if (!userId) return {}
  try { return JSON.parse(localStorage.getItem(seguimientoSeenKey(userId)) || '{}') } catch { return {} }
}
export function seguimientoSignature(t) { return `${t.status}:${t._count?.comments ?? 0}` }

// Fila de la sección Seguimiento (Seguidas / Delegadas). Muestra responsable, comentarios,
// estado, y los metadatos: fecha de creación, fecha de finalización y duración.
function TrackedTaskRow({ task: t, onClick, onRemove, removeTitle, isNew }) {
  const dur = completedDuration(t)
  return (
    <div
      className="group flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      onClick={onClick}
    >
      {isNew && (
        <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" title="Cambió desde tu última visita" />
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-snug truncate ${t.status === 'COMPLETED' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
          {t.description}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <UserLink userId={t.user.id} className="flex items-center gap-2 min-w-0">
            <img src={avatarUrl(t.user.avatar)} alt={t.user.name} className="w-4 h-4 rounded-full object-cover flex-shrink-0 hover:opacity-90 transition-opacity" />
            <span className="text-xs text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">{t.user.name}</span>
          </UserLink>
          {(t._count?.comments ?? 0) > 0 && (
            <>
              <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">💬 {t._count.comments}</span>
            </>
          )}
        </div>
        {/* Metadatos: creación, finalización, duración */}
        <div className="flex items-center gap-x-2 gap-y-0.5 mt-1 flex-wrap text-[11px] text-gray-400 dark:text-gray-500">
          {t.createdAt && <span>📅 {fmtShortDate(t.createdAt)}</span>}
          {t.completedAt && (
            <>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <span>✓ {fmtShortDate(t.completedAt)}</span>
            </>
          )}
          {dur && (
            <>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <span>⏱ {dur}</span>
            </>
          )}
        </div>
      </div>
      <span className={`text-xs font-medium flex-shrink-0 ${SEGUIMIENTO_STATUS_COLOR[t.status]}`}>
        {SEGUIMIENTO_STATUS_LABEL[t.status]}
      </span>
      <button
        onClick={e => { e.stopPropagation(); onRemove(t) }}
        title={removeTitle}
        className="flex-shrink-0 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 -m-1"
      >
        ✕
      </button>
    </div>
  )
}

// Fila de una tarea completada (sección "Completadas": hoy + historial). Edición de
// duración con estado local propio — así tipear en el input no re-renderiza todo el Dashboard.
export const CompletedTaskRow = memo(function CompletedTaskRow({ task: t, variant, onOpenComments, onSaveDuration }) {
  const [editingDur, setEditingDur] = useState(false)
  const [durInput, setDurInput] = useState('')
  const cancelRef = useRef(false)
  const inputRef = useRef(null)

  const mins = completedMinutes(t)
  const isHistory = variant === 'history'
  const dateStr = isHistory && t.completedAt
    ? new Date(t.completedAt).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
    : null

  function startEdit() {
    cancelRef.current = false
    setDurInput(String(mins ?? 0))
    setEditingDur(true)
    setTimeout(() => { inputRef.current?.select() }, 0)
  }

  async function saveEdit() {
    if (cancelRef.current) return
    const parsed = parseInt(durInput, 10)
    setEditingDur(false)
    if (isNaN(parsed) || parsed < 0) return
    await onSaveDuration(t.id, parsed)
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 group">
      <span className={`flex-shrink-0 text-sm ${isHistory ? 'text-gray-300 dark:text-gray-600' : 'text-green-500'}`}>✓</span>
      <div className="flex-1 min-w-0">
        <p
          onClick={() => onOpenComments(t)}
          title="Abrir tarea"
          className={`text-sm leading-snug truncate cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 transition-colors ${isHistory ? 'text-gray-500 dark:text-gray-400' : 'text-gray-600 dark:text-gray-300'}`}
        >
          {t.description}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-gray-400 dark:text-gray-500">{t.project.name}</span>
          <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
          {dateStr && (
            <>
              <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">{dateStr}</span>
              <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
            </>
          )}
          <button
            onClick={() => onOpenComments(t)}
            title="Ver comentarios"
            className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            💬{(t._count?.comments ?? 0) > 0 ? ` ${t._count.comments}` : ''}
          </button>
          {editingDur ? (
            <>
              <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
              <span className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  type="number"
                  min="0"
                  value={durInput}
                  onChange={e => setDurInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  { e.preventDefault(); saveEdit() }
                    if (e.key === 'Escape') { cancelRef.current = true; setEditingDur(false) }
                  }}
                  onBlur={saveEdit}
                  className="w-14 text-xs border border-green-400 dark:border-green-600 rounded px-1.5 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-green-400 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                />
                <span className="text-xs text-gray-400">min</span>
                <button
                  onMouseDown={() => { cancelRef.current = true; setEditingDur(false) }}
                  className="text-xs text-gray-400 hover:text-gray-600 leading-none"
                >✕</button>
              </span>
            </>
          ) : (
            <button
              onClick={startEdit}
              title="Editar duración"
              className="group/dur flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-green-600 dark:hover:text-green-400 transition-colors"
            >
              {mins != null && mins > 0 && (
                <>
                  <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                  <span>{fmtMins(mins)}</span>
                </>
              )}
              {!isHistory && (mins == null || mins === 0) && <span className="opacity-0 group-hover:opacity-60">+ tiempo</span>}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor"
                className="w-2.5 h-2.5 opacity-0 group-hover/dur:opacity-50 transition-opacity">
                <path d="M8.54.47a1.6 1.6 0 0 1 2.26 2.26L9.5 4.03 7.97 2.5 8.54.47ZM7.03 3.44 1.5 9a.5.5 0 0 0-.13.24L1 11.17a.25.25 0 0 0 .3.3l1.93-.37A.5.5 0 0 0 3.47 11l5.56-5.53L7.03 3.44Z"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
})

// Bloque "Insight del día" — se muestra debajo del header cuando la jornada está
// abierta y el usuario tiene la IA diaria habilitada. Maneja sus propios estados
// vacíos (cargando / sin insight / descartado); el resto del estado (loading,
// dismissed, refreshing, cooldown, expanded) vive en el shell (Dashboard.jsx).
export function DailyInsightBlock({ loading, insight, dismissed, expanded, onToggleExpanded, onDismiss, cooldown, refreshing, onRefresh, onFeedback }) {
  const toneStyles = {
    warning:  'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    alert:    'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    positive: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    neutral:  'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
  }
  const toneText = {
    warning:  'text-red-700 dark:text-red-400',
    alert:    'text-amber-700 dark:text-amber-400',
    positive: 'text-green-700 dark:text-green-400',
    neutral:  'text-gray-600 dark:text-gray-400',
  }
  const toneIcon = { warning: '⚠️', alert: '🎯', positive: '✅', neutral: '💡' }

  if (loading) {
    return (
      <div className="flex items-center gap-2.5 border rounded-xl px-4 py-3 mb-6 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <LoadingSpinner size="sm" />
        <span className="text-sm text-gray-400">Generando insight del día...</span>
      </div>
    )
  }

  if (!insight || dismissed) return null

  const tone = insight.tono || 'neutral'

  return (
    <div className={`border rounded-xl mb-6 ${toneStyles[tone]}`}>
      {/* Header row — always visible */}
      <div
        className="flex items-center gap-2.5 px-4 py-3 cursor-pointer select-none"
        onClick={onToggleExpanded}
      >
        <span className="text-base flex-shrink-0">{toneIcon[tone]}</span>
        <p className={`text-sm font-semibold leading-snug flex-1 min-w-0 ${toneText[tone]}`}>{insight.titulo}</p>
        <button
          onClick={e => { e.stopPropagation(); onDismiss() }}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0 text-base leading-none px-1"
          title="Cerrar"
        >×</button>
        <span className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-3">
          <p className={`text-sm leading-snug ${toneText[tone]} opacity-90`}>{insight.mensaje}</p>
          {insight.alertaRol && (
            <p className="text-xs mt-2 leading-snug text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5">
              <span className="font-medium">⚠️ Rol:</span> {insight.alertaRol}
            </p>
          )}
          {insight.alertaGTD && (
            <p className="text-xs mt-2 leading-snug text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-2.5 py-1.5">
              <span className="font-medium">📝 GTD:</span> {insight.alertaGTD}
            </p>
          )}
          {insight.sugerencia && (
            <p className={`text-xs mt-1.5 leading-snug ${toneText[tone]} opacity-75`}>
              <span className="font-medium">Acción:</span> {insight.sugerencia}
            </p>
          )}
          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-black/5 dark:border-white/10">
            <div className="flex items-center gap-1">
              <button
                onClick={() => onFeedback(insight.feedback === 'up' ? null : 'up')}
                className={`text-sm px-2 py-0.5 rounded-lg transition-colors ${insight.feedback === 'up' ? 'bg-green-200 dark:bg-green-800 text-green-700 dark:text-green-300' : 'text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30'}`}
                title="Útil"
              >👍</button>
              <button
                onClick={() => onFeedback(insight.feedback === 'down' ? null : 'down')}
                className={`text-sm px-2 py-0.5 rounded-lg transition-colors ${insight.feedback === 'down' ? 'bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-300' : 'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30'}`}
                title="No útil"
              >👎</button>
            </div>
            <div className="flex items-center gap-2">
              {cooldown && (
                <span className="text-xs text-gray-400">Disponible en {cooldown}min</span>
              )}
              <button
                onClick={onRefresh}
                disabled={refreshing}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40 transition-colors flex items-center gap-1"
                title="Regenerar insight"
              >
                <span className={refreshing ? 'animate-spin inline-block' : ''}>↺</span>
                <span>Regenerar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Sección "Seguimiento" (Seguidas / Delegadas), colapsable. Todo el estado (tab activo,
// filtro, confirmación de borrado en masa) vive en el shell y se recibe por props.
export function SeguimientoSection({
  followedTasks, delegated, seguimientoBlockedCount,
  delegatedOpen, setDelegatedOpen,
  seguimientoTab, onChangeTab,
  delegatedFilter, onChangeFilter,
  dismissConfirm, setDismissConfirm,
  dismissing, onBulkRemove,
  seguimientoStatuses, filteredSeguimientoByProject,
  seguimientoSeen, onOpenTask, onRemoveOne,
}) {
  return (
    <section className="mb-6">
      <button
        onClick={() => setDelegatedOpen(v => !v)}
        className="w-full flex items-center justify-between py-2 group"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Seguimiento</h2>
          <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 font-medium">
            {followedTasks.length + delegated.length}
          </span>
          {seguimientoBlockedCount > 0 && (
            <span className="text-xs bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-full px-2 py-0.5 font-medium">
              ⚠ {seguimientoBlockedCount} bloqueada{seguimientoBlockedCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${delegatedOpen ? 'rotate-180' : ''}`}>
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {delegatedOpen && (
        <div className="mt-2 space-y-4">
          {/* Sub-pestañas: Seguidas / Delegadas */}
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-50 dark:bg-gray-800">
            {[['SEGUIDAS', 'Seguidas', followedTasks.length], ['DELEGADAS', 'Delegadas', delegated.length]].map(([key, label, n]) => (
              <button
                key={key}
                onClick={() => onChangeTab(key)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  seguimientoTab === key
                    ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {label} <span className="opacity-60">{n}</span>
              </button>
            ))}
          </div>

          {/* Pills de filtro + botón borrar (borrar solo en Delegadas) */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex flex-wrap gap-1.5">
              {seguimientoStatuses.length > 2 && seguimientoStatuses.map(s => {
                const label = { ALL: 'Todas', PENDING: 'Pendiente', IN_PROGRESS: 'En curso', PAUSED: 'Pausada', BLOCKED: 'Bloqueada', COMPLETED: 'Completada' }[s]
                const active = delegatedFilter === s
                const color = active ? {
                  ALL:         'bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-900',
                  PENDING:     'bg-gray-500 text-white',
                  IN_PROGRESS: 'bg-primary-600 text-white',
                  PAUSED:      'bg-gray-500 text-white',
                  BLOCKED:     'bg-red-600 text-white',
                  COMPLETED:   'bg-green-600 text-white',
                }[s] : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                return (
                  <button
                    key={s}
                    onClick={() => onChangeFilter(s)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${color}`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Borrar del dashboard: dismiss en Delegadas, dejar de seguir en Seguidas — mismo botón en ambas */}
            {filteredSeguimientoByProject.length > 0 && (
              dismissConfirm ? (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-xs text-gray-500 dark:text-gray-400">¿Confirmar?</span>
                  <button
                    onClick={onBulkRemove}
                    disabled={dismissing}
                    className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
                  >
                    {dismissing ? 'Borrando…' : 'Sí, borrar'}
                  </button>
                  <button
                    onClick={() => setDismissConfirm(false)}
                    className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDismissConfirm(true)}
                  className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors flex-shrink-0"
                  title={
                    seguimientoTab === 'SEGUIDAS'
                      ? (delegatedFilter === 'ALL' ? 'Dejar de seguir todas' : `Dejar de seguir ${delegatedFilter === 'COMPLETED' ? 'las completadas' : 'las filtradas'}`)
                      : (delegatedFilter === 'ALL' ? 'Borrar todas del dashboard' : `Borrar ${delegatedFilter === 'COMPLETED' ? 'completadas' : 'filtradas'} del dashboard`)
                  }
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 3.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                  </svg>
                  {seguimientoTab === 'SEGUIDAS'
                    ? (delegatedFilter === 'ALL' ? 'Dejar de seguir todas' : `Dejar de seguir ${filteredSeguimientoByProject.reduce((s, g) => s + g.tasks.length, 0)}`)
                    : (delegatedFilter === 'ALL' ? 'Borrar todas' : `Borrar ${filteredSeguimientoByProject.reduce((s, g) => s + g.tasks.length, 0)}`)}
                </button>
              )
            )}
          </div>

          {seguimientoTab === 'DELEGADAS' && filteredSeguimientoByProject.length > 0 && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 italic px-1 -mt-2">
              Las completadas hace más de 7 días se ocultan automáticamente de esta lista.
            </p>
          )}

          {filteredSeguimientoByProject.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic px-1">
              {seguimientoTab === 'SEGUIDAS'
                ? 'No estás siguiendo ninguna tarea. Abrí una tarea y tocá "Seguir" para que te avise si se completa o comenta.'
                : 'No tenés tareas delegadas.'}
            </p>
          ) : filteredSeguimientoByProject.map(({ project, tasks }) => (
            <div key={project.id}>
              <p className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-1.5 px-1">{project.name}</p>
              <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {tasks.map(t => (
                  <TrackedTaskRow
                    key={t.id}
                    task={t}
                    onClick={() => onOpenTask(t)}
                    onRemove={onRemoveOne}
                    removeTitle={seguimientoTab === 'SEGUIDAS' ? 'Dejar de seguir' : 'Quitar del dashboard'}
                    isNew={seguimientoSeen[t.id] !== seguimientoSignature(t)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
