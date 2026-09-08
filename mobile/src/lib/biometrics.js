import * as LocalAuthentication from 'expo-local-authentication'

// Disponible = el dispositivo tiene hardware biométrico Y ya hay al menos una
// huella/cara enrolada en el OS (un dispositivo con hardware pero sin nada
// configurado no cuenta — LocalAuthentication.authenticateAsync fallaría igual).
export async function isBiometricAvailable() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync()
  if (!hasHardware) return false
  return LocalAuthentication.isEnrolledAsync()
}

export async function authenticateAsync() {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Autenticate para entrar a BlissTracker',
    cancelLabel: 'Cancelar',
    disableDeviceFallback: false, // permite caer al PIN/patrón del OS si la biometría falla
  })
  return result.success
}
