import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { AuthProvider } from './src/context/AuthContext'
import RootNavigator from './src/navigation/RootNavigator'

// Mantiene el splash nativo (imagen estática del isotipo, ver app.json →
// expo-splash-screen) visible hasta que este módulo termina de evaluarse —
// se oculta apenas React Native toma control, revelando el BlissLoader
// animado de RootNavigator sobre el mismo fondo blanco. Continuidad visual
// sin salto: estático → animado → contenido real, en vez de un flash en
// blanco entre el splash nativo y la primera pantalla JS.
SplashScreen.preventAutoHideAsync().catch(() => {})

export default function App() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {})
  }, [])

  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <RootNavigator />
    </AuthProvider>
  )
}
