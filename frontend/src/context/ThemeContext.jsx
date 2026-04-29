import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext()

const APP_DOMAIN = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'

function readThemeCookie() {
  const match = document.cookie.match(/(?:^|;\s*)theme=([^;]*)/)
  return match?.[1] ?? null
}

function writeThemeCookie(value) {
  // Solo en producción: cookie con dominio padre para compartir entre subdominios
  if (!window.location.hostname.includes(APP_DOMAIN)) return
  document.cookie = `theme=${value}; path=/; domain=.${APP_DOMAIN}; max-age=31536000; SameSite=Lax`
}

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    // Prioridad: ?theme= en URL (pasado al redirigir) → localStorage → cookie
    const urlParam = new URLSearchParams(window.location.search).get('theme')
    const stored   = urlParam ?? localStorage.getItem('theme') ?? readThemeCookie()
    const isDark   = stored === 'dark'
    document.documentElement.classList.toggle('dark', isDark)
    // Persistir en localStorage y cookie para visitas futuras
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
    writeThemeCookie(isDark ? 'dark' : 'light')
    return isDark
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    const value = dark ? 'dark' : 'light'
    localStorage.setItem('theme', value)
    writeThemeCookie(value)
  }, [dark])

  return (
    <ThemeContext.Provider value={{ dark, toggle: () => setDark(d => !d) }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
