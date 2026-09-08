import { useState, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { listNotifications, markAllRead } from '../api/notifications'
import { appEvents, EVENTS } from '../lib/events'

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60) return 'hace un momento'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setNotifications(await listNotifications())
    } catch {
      // silencioso — no hay mucho más que ofrecer en esta pantalla si falla
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function handleMarkAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    await markAllRead().catch(() => {})
  }

  function handlePress(item) {
    if (item.taskId) {
      appEvents.emit(EVENTS.OPEN_TASK_COMMENTS, item.taskId)
      navigation.goBack()
    }
  }

  const hasUnread = notifications.some(n => !n.read)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notificaciones</Text>
        {hasUnread && (
          <Pressable onPress={handleMarkAllRead}>
            <Text style={styles.markAllText}>Marcar todas leídas</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#F7931A" />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={n => String(n.id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>No tenés notificaciones</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.row, !item.read && styles.rowUnread]}
              onPress={() => handlePress(item)}
              disabled={!item.taskId}
            >
              {!item.read && <View style={styles.dot} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.message}>
                  <Text style={styles.actorName}>{item.actor?.name || 'BlissTracker'} </Text>
                  {item.message}
                </Text>
                <View style={styles.metaRow}>
                  {item.project?.name && <Text style={styles.project}>{item.project.name} · </Text>}
                  <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  markAllText: { color: '#F7931A', fontWeight: '600', fontSize: 13 },
  listContent: { flexGrow: 1 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40 },
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  rowUnread: { backgroundColor: '#fff8ef' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F7931A', marginTop: 6 },
  message: { fontSize: 14, color: '#1a1a1a', lineHeight: 20 },
  actorName: { fontWeight: '700' },
  metaRow: { flexDirection: 'row', marginTop: 4 },
  project: { fontSize: 12, color: '#9ca3af' },
  time: { fontSize: 12, color: '#9ca3af' },
})
