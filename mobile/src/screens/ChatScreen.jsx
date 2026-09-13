import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  View, Text, TextInput, Pressable, FlatList, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { listMessages, sendMessage, markChannelRead } from '../api/chat'
import { listMembers } from '../api/members'
import { getSocket } from '../lib/socket'
import BlissLoader from '../components/BlissLoader'

function timeLabel(dateStr) {
  return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

// Misma simplificación deliberada que TaskCommentsModal: la mención se
// detecta solo al final del texto que se está tipeando, no en la posición
// real del cursor (ver mobile/CLAUDE.md → "Comentarios y @menciones").
function getMentionQuery(text) {
  const match = text.match(/@([a-záéíóúñü]*)$/i)
  return match ? match[1] : null
}
function insertMention(text, name) {
  return text.replace(/@([a-záéíóúñü]*)$/i, `@${name} `)
}

export default function ChatScreen({ route, navigation }) {
  const { channelId, channelName } = route.params
  const { user } = useAuth()
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const insets = useSafeAreaInsets()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [members, setMembers] = useState([])
  const [inputFocused, setInputFocused] = useState(false)
  const listRef = useRef(null)

  useEffect(() => {
    navigation.setOptions({ title: channelName || 'Chat' })
  }, [navigation, channelName])

  useEffect(() => {
    setLoading(true)
    Promise.all([listMessages(channelId), listMembers()])
      .then(([data, m]) => { setMessages(data.messages); setMembers(m) })
      .catch(() => {})
      .finally(() => setLoading(false))
    markChannelRead(channelId).catch(() => {})
  }, [channelId])

  // Une el room del canal mientras esta pantalla está montada — mismo
  // protocolo que el widget web (join-channel/leave-channel, ver
  // backend/src/lib/socket.js).
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    socket.emit('join-channel', channelId)

    function onMessage(message) {
      if (message.channelId !== channelId) return
      setMessages(prev => [...prev, message])
      if (message.authorId !== user?.id) markChannelRead(channelId).catch(() => {})
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50)
    }
    socket.on('chat:message', onMessage)

    return () => {
      socket.emit('leave-channel', channelId)
      socket.off('chat:message', onMessage)
    }
  }, [channelId, user?.id])

  const mentionQuery = getMentionQuery(text)
  const mentionMatches = mentionQuery !== null
    ? members.filter(m => m.id !== user?.id && m.name.toLowerCase().includes(mentionQuery.toLowerCase()))
    : []

  const selectMention = useCallback(member => {
    setText(prev => insertMention(prev, member.name))
  }, [])

  async function handleSend() {
    if (!text.trim()) return
    setSending(true)
    try {
      await sendMessage(channelId, text.trim())
      setText('')
      // No hace falta agregar el mensaje al estado local: el propio socket
      // (io.to(room), que incluye al emisor) lo trae de vuelta por chat:message
      // — mismo patrón sin update optimista que usa el widget web.
    } catch {
      // silencioso — el usuario ve que el texto sigue en el input y puede reintentar
    } finally {
      setSending(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {loading ? (
        <View style={styles.centered}><BlissLoader size={56} /></View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => String(m.id)}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>💬</Text>
              <Text style={styles.emptyText}>No hay mensajes todavía. ¡Escribí el primero!</Text>
            </View>
          }
          renderItem={({ item }) => (
            item.systemType ? (
              <View style={styles.systemRow}>
                <Text style={styles.systemText}>{item.content}</Text>
              </View>
            ) : (
              <View style={styles.message}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.author?.name?.[0]?.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.messageHeaderRow}>
                    <Text style={styles.messageAuthor}>{item.author?.name}</Text>
                    <Text style={styles.messageTime}>{timeLabel(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.messageText}>{item.content || (item.gifUrl ? '📷 GIF' : '')}</Text>
                </View>
              </View>
            )
          )}
        />
      )}

      {mentionMatches.length > 0 && (
        <FlatList
          data={mentionMatches}
          keyExtractor={m => String(m.id)}
          style={styles.mentionList}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable style={styles.mentionRow} onPress={() => selectMention(item)}>
              <Text style={styles.mentionText}>{item.name}</Text>
            </Pressable>
          )}
        />
      )}

      <View style={[styles.inputRow, { paddingBottom: 12 + insets.bottom }]}>
        <TextInput
          style={[styles.input, inputFocused && styles.inputFocused]}
          placeholder="Escribí un mensaje... usá @ para mencionar"
          placeholderTextColor={colors.placeholder}
          value={text}
          onChangeText={setText}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          multiline
        />
        <Pressable
          style={[styles.sendButton, (!text.trim() || sending) && styles.buttonDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.sendButtonText}>Enviar</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

function makeStyles(c) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    listContent: { padding: 16, flexGrow: 1 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyEmoji: { fontSize: 40, marginBottom: 8 },
    emptyText: { color: c.textFaint, fontSize: 14, textAlign: 'center' },
    message: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    avatar: {
      width: 32, height: 32, borderRadius: 16, backgroundColor: c.primary,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    avatarText: { color: c.white, fontWeight: '700', fontSize: 13 },
    messageHeaderRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    messageAuthor: { fontWeight: '700', fontSize: 13, color: c.text },
    messageTime: { fontSize: 11, color: c.textFaint },
    messageText: { fontSize: 14, color: c.textSecondary, marginTop: 2 },
    systemRow: { alignItems: 'center', marginBottom: 16 },
    systemText: { fontSize: 12, color: c.textFaint, backgroundColor: c.surfaceAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
    mentionList: { maxHeight: 160, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surfaceAlt },
    mentionRow: { paddingVertical: 10, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: c.borderLight },
    mentionText: { fontSize: 14, color: c.text },
    inputRow: {
      flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: c.border,
      alignItems: 'flex-end', backgroundColor: c.bg,
    },
    input: {
      flex: 1, borderWidth: 1.5, borderColor: c.border, borderRadius: 20, backgroundColor: c.surface,
      paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, maxHeight: 100, color: c.text,
    },
    inputFocused: { borderColor: c.primary },
    sendButton: { backgroundColor: c.primary, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 11 },
    sendButtonText: { color: c.white, fontWeight: '700', fontSize: 13 },
    buttonDisabled: { opacity: 0.5 },
  })
}
