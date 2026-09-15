import { useState, useEffect, useMemo } from 'react'
import { Modal, View, Text, TextInput, Pressable, FlatList, ScrollView, StyleSheet, ActivityIndicator, Platform } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { listProjects } from '../api/projects'
import { listMembers } from '../api/members'
import { createTask } from '../api/tasks'
import { useAuth } from '../context/AuthContext'
import { showAlert } from '../lib/alert'
import { useTheme } from '../context/ThemeContext'

const SCHEDULE_MODES = [
  { value: 'none', label: 'Hoy' },
  { value: 'future', label: '📅 Futura' },
  { value: 'recurring', label: '🔁 Recurrente' },
]

const FREQUENCIES = [
  ['daily', 'Diaria'],
  ['weekly', 'Semanal'],
  ['monthly', 'Mensual'],
  ['annual', 'Anual'],
]

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d
}

function toYMD(date) {
  return date.toLocaleDateString('en-CA') // YYYY-MM-DD en hora local
}

function fmtDate(date) {
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AddTaskModal({ visible, onClose, onCreated }) {
  const { user } = useAuth()
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const insets = useSafeAreaInsets()

  const [projects, setProjects] = useState([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [projectId, setProjectId] = useState(null)
  const [description, setDescription] = useState('')

  const [members, setMembers] = useState([])
  const [targetUserId, setTargetUserId] = useState(null) // null = uno mismo

  const [scheduleMode, setScheduleMode] = useState('none') // none | future | recurring
  const [futureDate, setFutureDate] = useState(tomorrow())
  const [frequency, setFrequency] = useState('weekly')
  const [weekdays, setWeekdays] = useState([])
  const [hasEndDate, setHasEndDate] = useState(false)
  const [endDate, setEndDate] = useState(tomorrow())
  const [pickerOpen, setPickerOpen] = useState(null) // 'future' | 'end' | null

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
    listMembers()
      .then(data => setMembers(data.filter(m => m.id !== user?.id)))
      .catch(() => {}) // no bloquea la creación de la tarea para uno mismo
  }, [visible, user?.id])

  function reset() {
    setDescription('')
    setTargetUserId(null)
    setScheduleMode('none')
    setFutureDate(tomorrow())
    setFrequency('weekly')
    setWeekdays([])
    setHasEndDate(false)
    setEndDate(tomorrow())
    setPickerOpen(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function toggleWeekday(idx) {
    setWeekdays(prev => (prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx].sort()))
  }

  async function handleSubmit() {
    if (!description.trim() || !projectId) return
    if (scheduleMode === 'recurring' && frequency === 'weekly' && weekdays.length === 0) {
      showAlert('Falta un día', 'Elegí al menos un día de la semana.')
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        description: description.trim(),
        projectId,
        targetUserId: targetUserId ?? undefined,
      }
      if (scheduleMode === 'future') {
        payload.scheduledFor = toYMD(futureDate)
      } else if (scheduleMode === 'recurring') {
        payload.recurrence = {
          frequency,
          ...(frequency === 'weekly' ? { weekdays } : {}),
          ...(hasEndDate ? { endDate: toYMD(endDate) } : {}),
        }
      }
      const task = await createTask(payload)
      // El backend no incluye la relación `user` en la respuesta de creación
      // (ver taskInclude) — el nombre para el aviso sale de la lista ya cargada acá.
      const assigneeName = targetUserId ? members.find(m => m.id === targetUserId)?.name : null
      onCreated(task, assigneeName)
      reset()
      onClose()
    } catch (err) {
      showAlert('No se pudo crear la tarea', err.response?.data?.error || 'Probá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(32, insets.bottom + 20) }]}>
          <Text style={styles.title}>Nueva tarea</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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

            {members.length > 0 && (
              <>
                <Text style={styles.label}>Asignar a</Text>
                <View style={styles.chipsRow}>
                  <Pressable
                    style={[styles.chip, targetUserId === null && styles.chipSelected]}
                    onPress={() => setTargetUserId(null)}
                  >
                    <Text style={[styles.chipText, targetUserId === null && styles.chipTextSelected]}>Vos</Text>
                  </Pressable>
                  {members.map(m => (
                    <Pressable
                      key={m.id}
                      style={[styles.chip, targetUserId === m.id && styles.chipSelected]}
                      onPress={() => setTargetUserId(m.id)}
                    >
                      <Text style={[styles.chipText, targetUserId === m.id && styles.chipTextSelected]}>{m.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.label}>Cuándo</Text>
            <View style={styles.chipsRow}>
              {SCHEDULE_MODES.map(m => (
                <Pressable
                  key={m.value}
                  style={[styles.chip, scheduleMode === m.value && styles.chipSelected]}
                  onPress={() => setScheduleMode(m.value)}
                >
                  <Text style={[styles.chipText, scheduleMode === m.value && styles.chipTextSelected]}>{m.label}</Text>
                </Pressable>
              ))}
            </View>

            {scheduleMode === 'future' && (
              <>
                <Text style={styles.label}>Fecha</Text>
                <Pressable style={styles.dateButton} onPress={() => setPickerOpen('future')}>
                  <Text style={styles.dateButtonText}>{fmtDate(futureDate)}</Text>
                </Pressable>
              </>
            )}

            {scheduleMode === 'recurring' && (
              <>
                <Text style={styles.label}>Frecuencia</Text>
                <View style={styles.chipsRow}>
                  {FREQUENCIES.map(([val, lbl]) => (
                    <Pressable
                      key={val}
                      style={[styles.chipSmall, frequency === val && styles.chipSelected]}
                      onPress={() => setFrequency(val)}
                    >
                      <Text style={[styles.chipSmallText, frequency === val && styles.chipTextSelected]}>{lbl}</Text>
                    </Pressable>
                  ))}
                </View>

                {frequency === 'weekly' && (
                  <>
                    <Text style={styles.label}>Días de la semana</Text>
                    <View style={styles.chipsRow}>
                      {WEEKDAY_LABELS.map((lbl, idx) => (
                        <Pressable
                          key={idx}
                          style={[styles.chipSmall, weekdays.includes(idx) && styles.chipSelected]}
                          onPress={() => toggleWeekday(idx)}
                        >
                          <Text style={[styles.chipSmallText, weekdays.includes(idx) && styles.chipTextSelected]}>{lbl}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}

                <Text style={styles.label}>Fecha de fin (opcional)</Text>
                {hasEndDate ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable style={[styles.dateButton, { flex: 1 }]} onPress={() => setPickerOpen('end')}>
                      <Text style={styles.dateButtonText}>{fmtDate(endDate)}</Text>
                    </Pressable>
                    <Pressable style={styles.removeButton} onPress={() => setHasEndDate(false)}>
                      <Text style={styles.removeButtonText}>✕</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={styles.dateButton}
                    onPress={() => { setHasEndDate(true); setPickerOpen('end') }}
                  >
                    <Text style={styles.dateButtonText}>+ Agregar fecha de fin</Text>
                  </Pressable>
                )}
              </>
            )}
          </ScrollView>

          {pickerOpen && (
            <DateTimePicker
              value={pickerOpen === 'future' ? futureDate : endDate}
              mode="date"
              minimumDate={tomorrow()}
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(event, selected) => {
                setPickerOpen(null)
                if (!selected) return
                if (pickerOpen === 'future') setFutureDate(selected)
                else setEndDate(selected)
              }}
            />
          )}

          <View style={styles.footer}>
            <Pressable style={styles.cancelButton} onPress={handleClose}>
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
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, maxHeight: '88%' },
    title: { fontSize: 18, fontWeight: '700', marginBottom: 16, color: c.text },
    input: {
      borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 14,
      paddingVertical: 12, fontSize: 15, minHeight: 70, textAlignVertical: 'top', color: c.text,
    },
    label: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginTop: 14, marginBottom: 6, textTransform: 'uppercase' },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
    chipSmall: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
    chipSelected: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: 13, color: c.textSecondary },
    chipSmallText: { fontSize: 12, color: c.textSecondary },
    chipTextSelected: { color: c.white, fontWeight: '600' },
    dateButton: { borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
    dateButtonText: { fontSize: 14, color: c.text, fontWeight: '600' },
    removeButton: {
      width: 44, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center',
    },
    removeButtonText: { color: c.textSecondary, fontWeight: '700' },
    footer: { flexDirection: 'row', gap: 10, marginTop: 16 },
    cancelButton: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: c.border },
    cancelButtonText: { color: c.textSecondary, fontWeight: '600' },
    submitButton: { flex: 1, backgroundColor: c.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
    submitButtonText: { color: c.white, fontWeight: '600' },
    buttonDisabled: { opacity: 0.5 },
  })
}
