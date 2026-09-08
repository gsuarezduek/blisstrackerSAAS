import { useState, useEffect } from 'react'
import { Modal, View, Text, TextInput, Pressable, FlatList, StyleSheet, ActivityIndicator } from 'react-native'
import { listProjects } from '../api/projects'
import { createTask } from '../api/tasks'
import { showAlert } from '../lib/alert'

export default function AddTaskModal({ visible, onClose, onCreated }) {
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
        <View style={styles.sheet}>
          <Text style={styles.title}>Nueva tarea</Text>

          <TextInput
            style={styles.input}
            placeholder="¿Qué hay que hacer?"
            value={description}
            onChangeText={setDescription}
            multiline
            autoFocus
          />

          <Text style={styles.label}>Proyecto</Text>
          {loadingProjects ? (
            <ActivityIndicator style={{ marginVertical: 12 }} color="#F7931A" />
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
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitButtonText}>Agregar</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#1a1a1a' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 15, minHeight: 70, textAlignVertical: 'top',
  },
  label: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginTop: 14, textTransform: 'uppercase' },
  chip: { borderWidth: 1, borderColor: '#ddd', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipSelected: { backgroundColor: '#F7931A', borderColor: '#F7931A' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelButton: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: '#ddd' },
  cancelButtonText: { color: '#374151', fontWeight: '600' },
  submitButton: { flex: 1, backgroundColor: '#F7931A', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  submitButtonText: { color: '#fff', fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
})
