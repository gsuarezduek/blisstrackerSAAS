import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'bliss_token'
const WORKSPACE_SLUG_KEY = 'bliss_workspace_slug'

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
