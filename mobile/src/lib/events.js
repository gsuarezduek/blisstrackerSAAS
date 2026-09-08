// Pub-sub mínimo para desacoplar "el usuario tocó una notificación push" (se
// resuelve en RootNavigator, donde vive el listener global de Notifications)
// de "abrir el modal de comentarios de esa tarea" (vive en DashboardScreen) —
// mismo rol que los CustomEvent de `window` en el frontend web
// (`bliss:task-created`, `bliss:open-chat`), pero RN no tiene `window` ni el
// módulo `events` de Node (no está polyfilleado por Metro), así que es una
// implementación mínima propia en vez de `require('events')`.
function createEmitter() {
  const listeners = {}
  return {
    on(event, fn) {
      (listeners[event] ||= []).push(fn)
    },
    off(event, fn) {
      listeners[event] = (listeners[event] || []).filter(f => f !== fn)
    },
    emit(event, ...args) {
      (listeners[event] || []).forEach(fn => fn(...args))
    },
  }
}

export const appEvents = createEmitter()

export const EVENTS = {
  OPEN_TASK_COMMENTS: 'open-task-comments',
}
