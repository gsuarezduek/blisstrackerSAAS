import { useState, useCallback, useEffect } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { listChannels } from '../api/chat'
import { getSocket } from '../lib/socket'

export default function ChannelListScreen({ navigation }) {
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setChannels(await listChannels())
    } catch {
      // silencioso — reintenta al volver a foco
    } finally {
      setLoading(false)
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
        <ActivityIndicator style={{ marginTop: 40 }} color="#F7931A" />
      ) : (
        <FlatList
          data={channels}
          keyExtractor={c => String(c.id)}
          ListEmptyComponent={<Text style={styles.empty}>No hay canales todavía</Text>}
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
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#eee' },
  backButton: { color: '#F7931A', fontWeight: '600', fontSize: 14, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
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
