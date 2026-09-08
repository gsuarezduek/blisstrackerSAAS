import { useEffect } from 'react'
import { View } from 'react-native'
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import * as Notifications from 'expo-notifications'
import { useAuth } from '../context/AuthContext'
import { appEvents, EVENTS } from '../lib/events'
import BlissLoader from '../components/BlissLoader'
import LoginScreen from '../screens/LoginScreen'
import WorkspaceSelectScreen from '../screens/WorkspaceSelectScreen'
import LockScreen from '../screens/LockScreen'
import DashboardScreen from '../screens/DashboardScreen'
import NotificationsScreen from '../screens/NotificationsScreen'
import ChannelListScreen from '../screens/ChannelListScreen'
import ChatScreen from '../screens/ChatScreen'

const Stack = createNativeStackNavigator()

export default function RootNavigator() {
  const { user, loading, locked, pendingWorkspaces } = useAuth()
  const navRef = useNavigationContainerRef()

  // Tocar una notificación push (app en background o cerrada) navega a
  // Notificaciones y deep-linkea a la tarea si trae taskId — mismo evento
  // que dispara NotificationsScreen al tocar una fila de la lista in-app.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data
      if (!navRef.isReady()) return
      if (data?.channelId) {
        // Push de chat (menciones, respuestas, @everyone): va directo al canal,
        // no al centro de notificaciones — mismo criterio que CHAT_MENTION en
        // el bell panel de la web (deep-link propio, no abre un modal genérico).
        navRef.navigate('Channels')
        navRef.navigate('Chat', { channelId: Number(data.channelId) })
        return
      }
      navRef.navigate('Notifications')
      if (data?.taskId) {
        setTimeout(() => appEvents.emit(EVENTS.OPEN_TASK_COMMENTS, Number(data.taskId)), 300)
      }
    })
    return () => sub.remove()
  }, [navRef])

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <BlissLoader size={96} />
      </View>
    )
  }

  return (
    <NavigationContainer ref={navRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {locked ? (
          <Stack.Screen name="Lock" component={LockScreen} />
        ) : user ? (
          <>
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Channels" component={ChannelListScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: true }} />
          </>
        ) : pendingWorkspaces ? (
          <Stack.Screen name="WorkspaceSelect" component={WorkspaceSelectScreen} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
