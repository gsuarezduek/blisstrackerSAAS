import { useState, useEffect, useMemo } from 'react'
import { Modal, View, Text, TextInput, Pressable, FlatList, StyleSheet, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { listProjects } from '../api/projects'
import { createTask } from '../api/tasks'
import { showAlert } from '../lib/alert'
import { useTheme } from '../context/ThemeContext'

export default function AddTaskModal({ visible, onClose, onCreated }) {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const insets = useSafeAreaInsets()
  const [projects, setProjects] = useState([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [projectId, setProjectId] = useState(null)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!visible) return
    setLoadingProjects(true)
    listProjects()
      .then(data => {
        setProjects(data)
        setProjectId(prev => prev ?? data[0]?.id ?? null)
      })
      .catch(() => showAlert('Error', 'No pudimos cargar los proyectos.'))
      .finally(() => setLoadingProjects(false))
  }, [visible])

  async function handleSubmit() {
    if (!description.trim() || !projectId) return
    setSubmitting(true)
    try {
      const task = await createTask({ description: description.trim(), projectId })
      onCreated(task)
      setDescription('')
      onClose()
    } catch (err) {
      showAlert('No se pudo crear la tarea', err.response?.data?.error || 'Probá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(32, insets.bottom + 20) }]}>
          <Text style={styles.title}>Nueva tarea</Text>

          <TextInput
            style={styles.input}
            placeholder="¿Qué hay que hacer?"
            placeholderTextColor={colors.placeholder}
            value={description}
            onChangeText={setDescription}
            multiline
            autoFocus
          />

          <Text style={styles.label}>Proyecto</Text>
          {loadingProjects ? (
            <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} />
          ) : (
            <FlatList
              data={projects}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={p => String(p.id)}
              contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.chip, projectId === item.id && styles.chipSelected]}
                  onPress={() => setProjectId(item.id)}
                >
                  <Text style={[styles.chipText, projectId === item.id && styles.chipTextSelected]}>{item.name}</Text>
                </Pressable>
              )}
            />
          )}

          <View style={styles.footer}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[styles.submitButton, (!description.trim() || !projectId || submitting) && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={!description.trim() || !projectId || submitting}
            >
              {submitting
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.submitButtonText}>Agregar</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function makeStyles(c) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
    title: { fontSize: 18, fontWeight: '700', marginBottom: 16, color: c.text },
    input: {
      borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 14,
      paddingVertical: 12, fontSize: 15, minHeight: 70, textAlignVertical: 'top', color: c.text,
    },
    label: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginTop: 14, textTransform: 'uppercase' },
    chip: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
    chipSelected: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: 13, color: c.textSecondary },
    chipTextSelected: { color: c.white, fontWeight: '600' },
    footer: { flexDirection: 'row', gap: 10, marginTop: 16 },
    cancelButton: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: c.border },
    cancelButtonText: { color: c.textSecondary, fontWeight: '600' },
    submitButton: { flex: 1, backgroundColor: c.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
    submitButtonText: { color: c.white, fontWeight: '600' },
    buttonDisabled: { opacity: 0.5 },
  })
}
