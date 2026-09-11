import { useState, useCallback, useEffect } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native'
import { listChannels } from '../api/chat'
import { getSocket } from '../lib/socket'
import BlissLoader from '../components/BlissLoader'

export default function ChannelListScreen({ navigation }) {
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true)
    try {
      setChannels(await listChannels())
    } catch {
      // silencioso — reintenta al volver a foco
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // Actualiza los conteos de no-leídos/menciones en vivo mientras la lista
  // está en pantalla — mismo criterio que el badge del ícono flotante de la
  // web (ChatContext), simplificado a "recargar la lista completa" en vez de
  // parchear el canal puntual: son pocos canales, no vale la pena optimizar.
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    const onChange = () => load()
    socket.on('chat:unread', onChange)
    socket.on('chat:read', onChange)
    return () => {
      socket.off('chat:unread', onChange)
      socket.off('chat:read', onChange)
    }
  }, [load])

  function preview(channel) {
    const m = channel.lastMessage
    if (!m) return 'Sin mensajes todavía'
    if (m.gifUrl) return '📷 GIF'
    return m.content || ''
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.backButton}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.title}>Chat</Text>
      </View>

      {loading ? (
        <View style={styles.centered}><BlissLoader size={56} /></View>
      ) : (
        <FlatList
          data={channels}
          keyExtractor={c => String(c.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#F7931A" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>💬</Text>
              <Text style={styles.emptyText}>No hay canales todavía</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => navigation.navigate('Chat', { channelId: item.id, channelName: item.name })}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.isPrivate ? '🔒' : '#'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.channelName} numberOfLines={1}>{item.name}</Text>
                  {item.starred && <Text style={styles.star}>★</Text>}
                </View>
                <Text style={styles.preview} numberOfLines={1}>{preview(item)}</Text>
              </View>
              {(item.mentionCount > 0 || item.unreadCount > 0) && (
                <View style={[styles.badge, item.mentionCount > 0 && styles.badgeMention]}>
                  <Text style={styles.badgeText}>{item.mentionCount > 0 ? item.mentionCount : item.unreadCount}</Text>
                </View>
              )}
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
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  backButton: { color: '#F7931A', fontWeight: '600', fontSize: 14, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  listContent: { flexGrow: 1, padding: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyText: { color: '#9ca3af', fontSize: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 14, marginBottom: 10,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, color: '#6b7280' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  channelName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', flexShrink: 1 },
  star: { color: '#eab308', fontSize: 13 },
  preview: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeMention: { backgroundColor: '#dc2626' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
})
