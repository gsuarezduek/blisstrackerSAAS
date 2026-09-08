import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'bliss_token'
const WORKSPACE_SLUG_KEY = 'bliss_workspace_slug'
// Preferencia de biometría: separada de clearSession() a propósito — es del
// dispositivo, no de la sesión. Si alguien cierra sesión y vuelve a entrar en
// el mismo teléfono, tiene sentido que siga pidiendo Face ID/huella.
const BIOMETRIC_ENABLED_KEY = 'bliss_biometric_enabled'
// Para no volver a ofrecer "¿activar Face ID?" en cada login si ya contestó
// que no una vez.
const BIOMETRIC_PROMPTED_KEY = 'bliss_biometric_prompted'

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY)
}

export async function getWorkspaceSlug() {
  return SecureStore.getItemAsync(WORKSPACE_SLUG_KEY)
}

export async function setSession(token, workspaceSlug) {
  await SecureStore.setItemAsync(TOKEN_KEY, token)
  await SecureStore.setItemAsync(WORKSPACE_SLUG_KEY, workspaceSlug)
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(TOKEN_KEY)
  await SecureStore.deleteItemAsync(WORKSPACE_SLUG_KEY)
}

export async function getBiometricEnabled() {
  return (await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY)) === 'true'
}

export async function setBiometricEnabled(enabled) {
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false')
}

export async function getBiometricPrompted() {
  return (await SecureStore.getItemAsync(BIOMETRIC_PROMPTED_KEY)) === 'true'
}

export async function setBiometricPrompted() {
  await SecureStore.setItemAsync(BIOMETRIC_PROMPTED_KEY, 'true')
}
