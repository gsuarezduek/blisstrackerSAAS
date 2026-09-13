import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Modal, View, Text, TextInput, Pressable, FlatList, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { listComments, addComment } from '../api/comments'
import { listMembers } from '../api/members'
import { showAlert } from '../lib/alert'

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60) return 'hace un momento'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

// Devuelve la porción de texto después del último "@" al final del string
// (sin espacios en medio) — la mención se asume siempre al final de lo que
// se está tipeando, una simplificación deliberada frente al autocomplete de
// la web (que inserta en la posición exacta del cursor).
function getMentionQuery(text) {
  const match = text.match(/@([a-záéíóúñü]*)$/i)
  return match ? match[1] : null
}

function insertMention(text, name) {
  return text.replace(/@([a-záéíóúñü]*)$/i, `@${name} `)
}

export default function TaskCommentsModal({ visible, task, onClose, onCommentAdded }) {
  const { user } = useAuth()
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const insets = useSafeAreaInsets()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [members, setMembers] = useState([])
  const listRef = useRef(null)

  useEffect(() => {
    if (!visible || !task) return
    setLoading(true)
    Promise.all([listComments(task.id), listMembers()])
      .then(([c, m]) => { setComments(c); setMembers(m) })
      .catch(() => showAlert('Error', 'No pudimos cargar los comentarios.'))
      .finally(() => setLoading(false))
  }, [visible, task])

  const mentionQuery = getMentionQuery(text)
  const mentionMatches = mentionQuery !== null
    ? members.filter(m => m.id !== user?.id && m.name.toLowerCase().includes(mentionQuery.toLowerCase()))
    : []

  const selectMention = useCallback(member => {
    setText(prev => insertMention(prev, member.name))
  }, [])

  async function handleSend() {
    if (!text.trim() || !task) return
    setSending(true)
    try {
      const comment = await addComment(task.id, text.trim())
      setComments(prev => [...prev, comment])
      onCommentAdded?.(task.id, comments.length + 1)
      setText('')
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50)
    } catch (err) {
      showAlert('No se pudo enviar', err.response?.data?.error || 'Probá de nuevo.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{task?.description}</Text>
            <Text style={styles.headerSubtitle}>{task?.project?.name}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.closeButton}>Cerrar</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : (
          <FlatList
            ref={listRef}
            data={comments}
            keyExtractor={c => String(c.id)}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={<Text style={styles.empty}>Todavía no hay comentarios</Text>}
            renderItem={({ item }) => (
              <View style={styles.comment}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.user?.name?.[0]?.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.commentHeaderRow}>
                    <Text style={styles.commentAuthor}>{item.user?.name}</Text>
                    <Text style={styles.commentTime}>{timeAgo(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.commentText}>{item.content}</Text>
                </View>
              </View>
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
            style={styles.input}
            placeholder="Escribí un comentario... usá @ para mencionar"
            placeholderTextColor={colors.placeholder}
            value={text}
            onChangeText={setText}
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
    </Modal>
  )
}

function makeStyles(c) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
      paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: c.border,
      backgroundColor: c.surface,
    },
    headerTitle: { fontSize: 15, fontWeight: '700', color: c.text },
    headerSubtitle: { fontSize: 12, color: c.textFaint, marginTop: 2 },
    closeButton: { color: c.primary, fontWeight: '600', fontSize: 14, marginTop: 2 },
    listContent: { padding: 16, flexGrow: 1 },
    empty: { textAlign: 'center', color: c.textFaint, marginTop: 40 },
    comment: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    avatar: {
      width: 32, height: 32, borderRadius: 16, backgroundColor: c.primary,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    avatarText: { color: c.white, fontWeight: '700', fontSize: 13 },
    commentHeaderRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    commentAuthor: { fontWeight: '700', fontSize: 13, color: c.text },
    commentTime: { fontSize: 11, color: c.textFaint },
    commentText: { fontSize: 14, color: c.textSecondary, marginTop: 2 },
    mentionList: { maxHeight: 160, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surfaceAlt },
    mentionRow: { paddingVertical: 10, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: c.borderLight },
    mentionText: { fontSize: 14, color: c.text },
    inputRow: {
      flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: c.border,
      alignItems: 'flex-end', backgroundColor: c.bg,
    },
    input: {
      flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 20, backgroundColor: c.surface,
      paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, maxHeight: 100, color: c.text,
    },
    sendButton: { backgroundColor: c.primary, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 11 },
    sendButtonText: { color: c.white, fontWeight: '700', fontSize: 13 },
    buttonDisabled: { opacity: 0.5 },
  })
}
