import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { useColorScheme } from 'react-native'
import { getThemePreference, setThemePreference } from '../api/session'
import { light, dark } from '../theme/colors'

const ThemeContext = createContext(null)

// `preference` es la elección explícita del usuario ('system' | 'light' |
// 'dark', persistida en SecureStore — dispositivo, no sesión, mismo criterio
// que biometría/push). Con 'system' se sigue `useColorScheme()`, que refleja
// el tema del so en vivo (requiere `userInterfaceStyle: "automatic"` en
// app.json — con "light" a secas el SO nunca reporta 'dark').
export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme()
  const [preference, setPreference] = useState('system')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getThemePreference().then(p => { setPreference(p); setLoaded(true) })
  }, [])

  const setPreferenceAndPersist = useCallback(async p => {
    setPreference(p)
    await setThemePreference(p)
  }, [])

  // Mientras se lee la preferencia persistida, arrancar en claro evita un
  // flash a oscuro si el dispositivo está en modo oscuro pero el usuario
  // había elegido "Claro" a mano — se corrige apenas `loaded` es true.
  const isDark = loaded && (preference === 'dark' || (preference === 'system' && systemScheme === 'dark'))
  const colors = useMemo(() => (isDark ? dark : light), [isDark])

  const value = useMemo(
    () => ({ colors, dark: isDark, preference, setPreference: setPreferenceAndPersist }),
    [colors, isDark, preference, setPreferenceAndPersist]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
