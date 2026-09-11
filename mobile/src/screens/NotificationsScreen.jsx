import { useState, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native'
import { listNotifications, markAllRead } from '../api/notifications'
import { appEvents, EVENTS } from '../lib/events'
import BlissLoader from '../components/BlissLoader'

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
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true)
    try {
      setNotifications(await listNotifications())
    } catch {
      // silencioso — no hay mucho más que ofrecer en esta pantalla si falla
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false)
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
          <Pressable onPress={handleMarkAllRead} hitSlop={8}>
            <Text style={styles.markAllText}>Marcar todas leídas</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}><BlissLoader size={56} /></View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={n => String(n.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#F7931A" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🔔</Text>
              <Text style={styles.emptyText}>No tenés notificaciones</Text>
            </View>
          }
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
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  markAllText: { color: '#F7931A', fontWeight: '600', fontSize: 13 },
  listContent: { flexGrow: 1, padding: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyText: { color: '#9ca3af', fontSize: 14 },
  row: {
    flexDirection: 'row', gap: 10, backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 14, marginBottom: 10,
  },
  rowUnread: { backgroundColor: '#fff8ef', borderColor: '#fde3bd' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F7931A', marginTop: 6 },
  message: { fontSize: 14, color: '#1a1a1a', lineHeight: 20 },
  actorName: { fontWeight: '700' },
  metaRow: { flexDirection: 'row', marginTop: 4 },
  project: { fontSize: 12, color: '#9ca3af' },
  time: { fontSize: 12, color: '#9ca3af' },
})
