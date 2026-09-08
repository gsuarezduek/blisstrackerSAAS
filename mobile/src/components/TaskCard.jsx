import { useState } from 'react'
import { View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { startTask, pauseTask, resumeTask, completeTask, blockTask, unblockTask, starTask } from '../api/tasks'

const STATUS_STYLE = {
  PENDING:     { bg: '#f3f4f6', color: '#4b5563', label: 'Pendiente' },
  IN_PROGRESS: { bg: '#fef3e2', color: '#c2670a', label: 'En curso' },
  PAUSED:      { bg: '#f3f4f6', color: '#6b7280', label: 'Pausada' },
  BLOCKED:     { bg: '#fee2e2', color: '#b91c1c', label: 'Bloqueada' },
  COMPLETED:   { bg: '#dcfce7', color: '#15803d', label: 'Completada' },
}

// starred: 0=sin destacar, 1=verde, 2=amarillo, 3=rojo (mismo criterio que la web)
const STAR_COLOR = { 0: '#d1d5db', 1: '#22c55e', 2: '#eab308', 3: '#ef4444' }

export default function TaskCard({ task, hasActiveTask, onUpdate, onOpenComments }) {
  const [loading, setLoading] = useState(false)
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [blockReason, setBlockReason] = useState('')

  async function run(action) {
    setLoading(true)
    try {
      const updated = await action()
      onUpdate(updated)
    } catch (err) {
      Alert.alert('No se pudo completar la acción', err.response?.data?.error || 'Probá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  async function handleBlock() {
    if (!blockReason.trim()) return
    setLoading(true)
    try {
      const updated = await blockTask(task.id, blockReason.trim())
      onUpdate(updated)
      setShowBlockForm(false)
      setBlockReason('')
    } catch (err) {
      Alert.alert('No se pudo bloquear', err.response?.data?.error || 'Probá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const status = STATUS_STYLE[task.status]
  const canStart = task.status === 'PENDING' && !hasActiveTask
  const canResume = task.status === 'PAUSED' && !hasActiveTask
  const canUnblock = task.status === 'BLOCKED' && !hasActiveTask
  const isCompleted = task.status === 'COMPLETED'

  return (
    <View style={[styles.card, task.status === 'BLOCKED' && styles.cardBlocked, isCompleted && styles.cardCompleted]}>
      <View style={styles.headerRow}>
        {!isCompleted && (
          <Pressable onPress={() => run(() => starTask(task.id))} hitSlop={8} disabled={loading}>
            <Text style={{ fontSize: 16, color: STAR_COLOR[task.starred ?? 0] }}>★</Text>
          </Pressable>
        )}
        <View style={[styles.badge, { backgroundColor: status.bg }]}>
          <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
        </View>
        <Text style={styles.project} numberOfLines={1}>{task.project?.name}</Text>
      </View>

      <Text style={[styles.description, isCompleted && styles.descriptionCompleted]}>
        {task.description}
      </Text>

      {onOpenComments && (
        <Pressable style={styles.commentsButton} onPress={() => onOpenComments(task)} hitSlop={6}>
          <Text style={styles.commentsButtonText}>💬 {task._count?.comments > 0 ? task._count.comments : 'Comentar'}</Text>
        </Pressable>
      )}

      {task.status === 'BLOCKED' && task.blockedReason ? (
        <Text style={styles.blockedReason}>🔒 {task.blockedReason}</Text>
      ) : null}

      {showBlockForm ? (
        <View style={styles.blockForm}>
          <TextInput
            style={styles.blockInput}
            placeholder="Motivo del bloqueo"
            value={blockReason}
            onChangeText={setBlockReason}
            autoFocus
          />
          <View style={styles.actionsRow}>
            <Pressable style={styles.secondaryButton} onPress={() => { setShowBlockForm(false); setBlockReason('') }}>
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.dangerButton} onPress={handleBlock} disabled={loading || !blockReason.trim()}>
              <Text style={styles.dangerButtonText}>Bloquear</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        !isCompleted && (
          <View style={styles.actionsRow}>
            {loading ? <ActivityIndicator size="small" color="#F7931A" /> : (
              <>
                {task.status === 'PENDING' && (
                  <Pressable
                    style={[styles.primaryButton, !canStart && styles.buttonDisabled]}
                    onPress={() => run(() => startTask(task.id))}
                    disabled={!canStart}
                  >
                    <Text style={styles.primaryButtonText}>Iniciar</Text>
                  </Pressable>
                )}
                {task.status === 'IN_PROGRESS' && (
                  <>
                    <Pressable style={styles.secondaryButton} onPress={() => run(() => pauseTask(task.id))}>
                      <Text style={styles.secondaryButtonText}>Pausar</Text>
                    </Pressable>
                    <Pressable style={styles.dangerButtonOutline} onPress={() => setShowBlockForm(true)}>
                      <Text style={styles.dangerButtonOutlineText}>Bloquear</Text>
                    </Pressable>
                    <Pressable style={styles.primaryButton} onPress={() => run(() => completeTask(task.id))}>
                      <Text style={styles.primaryButtonText}>Completar</Text>
                    </Pressable>
                  </>
                )}
                {task.status === 'PAUSED' && (
                  <Pressable
                    style={[styles.primaryButton, !canResume && styles.buttonDisabled]}
                    onPress={() => run(() => resumeTask(task.id))}
                    disabled={!canResume}
                  >
                    <Text style={styles.primaryButtonText}>Reanudar</Text>
                  </Pressable>
                )}
                {task.status === 'BLOCKED' && (
                  <Pressable
                    style={[styles.primaryButton, !canUnblock && styles.buttonDisabled]}
                    onPress={() => run(() => unblockTask(task.id))}
                    disabled={!canUnblock}
                  >
                    <Text style={styles.primaryButtonText}>Desbloquear</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        )
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb',
    padding: 14, marginBottom: 10,
  },
  cardBlocked: { borderColor: '#fca5a5' },
  cardCompleted: { opacity: 0.6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  project: { flex: 1, fontSize: 12, color: '#9ca3af', textAlign: 'right' },
  description: { fontSize: 15, color: '#1a1a1a', marginBottom: 4 },
  descriptionCompleted: { textDecorationLine: 'line-through', color: '#9ca3af' },
  blockedReason: { fontSize: 13, color: '#b91c1c', marginBottom: 8 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  primaryButton: { backgroundColor: '#F7931A', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  primaryButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  buttonDisabled: { opacity: 0.4 },
  secondaryButton: { backgroundColor: '#f3f4f6', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  secondaryButtonText: { color: '#374151', fontWeight: '600', fontSize: 13 },
  dangerButton: { backgroundColor: '#dc2626', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  dangerButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  dangerButtonOutline: { borderWidth: 1, borderColor: '#dc2626', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  dangerButtonOutlineText: { color: '#dc2626', fontWeight: '600', fontSize: 13 },
  blockForm: { marginTop: 4 },
  blockInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, marginBottom: 8,
  },
  commentsButton: { alignSelf: 'flex-start', marginBottom: 4 },
  commentsButtonText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
})
