import { useEffect, useRef } from 'react'

const INACTIVITY_MS = 2 * 60 * 60 * 1000  // 120 minutes

function sendChromeNotification(taskDescription) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification('Tarea pausada por inactividad', {
      body: `"${taskDescription}" fue pausada automáticamente tras 120 minutos sin actividad.`,
      icon: '/favicon.ico',
      tag: 'inactivity-check',
    })
  } catch (_) {}
}

export function useInactivity({ activeTask, onAutoPause }) {
  const lastActivityRef   = useRef(Date.now())
  const onAutoPauseRef    = useRef(onAutoPause)
  const autoPauseFiredRef = useRef(false)

  useEffect(() => { onAutoPauseRef.current = onAutoPause }, [onAutoPause])

  // Request Chrome notification permission once
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Reset timer when active task changes
  useEffect(() => {
    lastActivityRef.current = Date.now()
    autoPauseFiredRef.current = false
  }, [activeTask?.id])

  // Track user interactions
  useEffect(() => {
    const handler = () => { lastActivityRef.current = Date.now() }
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']
    events.forEach(e => window.addEventListener(e, handler, { passive: true }))
    return () => events.forEach(e => window.removeEventListener(e, handler))
  }, [])

  // Inactivity watcher — polls every 30s, pauses immediately at 120 min
  useEffect(() => {
    if (!activeTask) return
    const t = setInterval(() => {
      if (autoPauseFiredRef.current) return
      if (Date.now() - lastActivityRef.current >= INACTIVITY_MS) {
        autoPauseFiredRef.current = true
        sendChromeNotification(activeTask.description)
        onAutoPauseRef.current?.()
      }
    }, 30_000)
    return () => clearInterval(t)
  }, [activeTask])

  function dismiss() {
    lastActivityRef.current = Date.now()
    autoPauseFiredRef.current = false
  }

  return { dismiss }
}
