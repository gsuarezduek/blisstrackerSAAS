import { Platform } from 'react-native'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'

// Cómo se ven las notificaciones mientras la app está en primer plano —
// sin esto, iOS/Android no muestran nada mientras el usuario está adentro.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

// Obtiene (pidiendo permiso si hace falta) el Expo Push Token de este
// dispositivo. Devuelve null en cualquier caso no soportado — nunca lanza,
// el resto de la app funciona igual sin push:
// - Simuladores/emuladores no reciben push remotos.
// - `projectId` (seteado por `eas init`, ver mobile/CLAUDE.md) es requerido
//   por `getExpoPushTokenAsync` — sin un proyecto EAS vinculado no hay token.
export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) return null

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    })
  }

  const { status: existing } = await Notifications.getPermissionsAsync()
  let status = existing
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync()
    status = req.status
  }
  if (status !== 'granted') return null

  const projectId = Constants.expoConfig?.extra?.eas?.projectId
  if (!projectId) {
    console.warn('[Push] Falta el projectId de EAS — corré `eas init` en mobile/ para habilitar push. Ver mobile/CLAUDE.md.')
    return null
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId })
    return data
  } catch (err) {
    console.warn('[Push] No se pudo obtener el token:', err.message)
    return null
  }
}
