import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { View, Text, SectionList, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { getToday } from '../api/tasks'
import TaskCard from '../components/TaskCard'
import AddTaskModal from '../components/AddTaskModal'
import TaskCommentsModal from '../components/TaskCommentsModal'
import BlissLoader from '../components/BlissLoader'
import { appEvents, EVENTS } from '../lib/events'
import { finishWorkday } from '../api/workdays'
import { showAlert } from '../lib/alert'

function todayLabel() {
  return new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

// Agrupa tareas de hoy + arrastradas de días anteriores en las mismas secciones
// que el Dashboard web (En curso / Destacadas / Pausadas / Bloqueadas /
// Pendientes / Completadas), sin la lógica de Backlog/Seguimiento/Futuras de
// la versión web — eso queda para una fase posterior si hace falta.
function buildSections(tasks) {
  const isStarred = t => (t.starred ?? 0) > 0
  const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS')
  const starred = tasks.filter(t => isStarred(t) && t.status !== 'COMPLETED' && t.status !== 'IN_PROGRESS')
  const starredIds = new Set(starred.map(t => t.id))
  const paused = tasks.filter(t => t.status === 'PAUSED' && !starredIds.has(t.id))
  const blocked = tasks.filter(t => t.status === 'BLOCKED' && !starredIds.has(t.id))
  const pending = tasks.filter(t => t.status === 'PENDING' && !starredIds.has(t.id))
  const completed = tasks
    .filter(t => t.status === 'COMPLETED')
    .sort((a, b) => new Date(b.completedAt ?? 0) - new Date(a.completedAt ?? 0))

  const sections = []
  if (inProgress.length) sections.push({ title: 'En curso', data: inProgress })
  if (starred.length) sections.push({ title: 'Destacadas', data: starred })
  if (paused.length) sections.push({ title: 'Pausadas', data: paused })
  if (blocked.length) sections.push({ title: '⚠ Bloqueadas', data: blocked })
  if (pending.length) sections.push({ title: 'Pendientes', data: pending })
  if (completed.length) sections.push({ title: 'Completadas hoy', data: completed })
  return sections
}

export default function DashboardScreen({ navigation }) {
  const { user, logout } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [commentTask, setCommentTask] = useState(null)
  const [finishingDay, setFinishingDay] = useState(false)
  const tasksRef = useRef(tasks)
  useEffect(() => { tasksRef.current = tasks }, [tasks])

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const data = await getToday()
      setTasks([...(data.tasks ?? []), ...(data.carryOverTasks ?? [])])
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos cargar tus tareas.')
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false)
    }
  }, [])

  // Recarga cada vez que la pantalla vuelve a foco (ej. al volver de otra tab
  // en fases futuras), no solo en el mount inicial.
  useFocusEffect(useCallback(() => { load() }, [load]))

  // Deep-link desde una notificación push tocada (ver RootNavigator) o desde
  // la lista in-app de Notificaciones: abre el modal de comentarios de esa
  // tarea. Si la tarea todavía no está en el estado local (ej. llegó por push
  // mientras la app estaba cerrada, antes del primer fetch) se recarga una vez
  // y se reintenta.
  useEffect(() => {
    async function handleOpenTaskComments(taskId) {
      const found = tasksRef.current.find(t => t.id === taskId)
      if (found) { setCommentTask(found); return }
      await load()
      const retried = tasksRef.current.find(t => t.id === taskId)
      if (retried) setCommentTask(retried)
    }
    appEvents.on(EVENTS.OPEN_TASK_COMMENTS, handleOpenTaskComments)
    return () => appEvents.off(EVENTS.OPEN_TASK_COMMENTS, handleOpenTaskComments)
  }, [load])

  function handleUpdate(updated) {
    setTasks(prev => prev.map(t => (t.id === updated.id ? updated : t)))
  }

  function handleCreated(task) {
    setTasks(prev => [task, ...prev])
  }

  function handleCommentAdded(taskId, newCount) {
    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, _count: { ...t._count, comments: newCount } } : t)))
  }

  // Mismo criterio que la web: finalizar la jornada cierra sesión — el
  // WorkDay se reabre solo al volver a loguearse y visitar el Dashboard.
  function handleFinishDay() {
    showAlert('Finalizar jornada', '¿Cerramos tu jornada laboral? Se va a cerrar tu sesión.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Finalizar',
        onPress: async () => {
          setFinishingDay(true)
          try {
            await finishWorkday()
            await logout()
          } catch (err) {
            showAlert('No se pudo finalizar', err.response?.data?.error || 'Probá de nuevo.')
          } finally {
            setFinishingDay(false)
          }
        },
      },
    ])
  }

  const sections = useMemo(() => buildSections(tasks), [tasks])
  const hasActiveTask = tasks.some(t => t.status === 'IN_PROGRESS')

  if (loading) {
    return (
      <View style={styles.centered}>
        <BlissLoader size={72} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola, {user?.name?.split(' ')[0]} 👋</Text>
          <Text style={styles.date}>{todayLabel()}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => navigation.navigate('Projects')} hitSlop={8}>
            <Text style={styles.bell}>📁</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Channels')} hitSlop={8}>
            <Text style={styles.bell}>💬</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Notifications')} hitSlop={8}>
            <Text style={styles.bell}>🔔</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Profile')} hitSlop={8}>
            <Text style={styles.bell}>👤</Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => load()}><Text style={styles.retryText}>Reintentar</Text></Pressable>
        </View>
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <TaskCard task={item} hasActiveTask={hasActiveTask} onUpdate={handleUpdate} onOpenComments={setCommentTask} />
        )}
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#F7931A" />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={styles.emptyText}>No hay tareas para hoy</Text>
          </View>
        }
        stickySectionHeadersEnabled={false}
      />

      <View style={styles.fabRow}>
        <Pressable style={styles.fab} onPress={() => setShowAddModal(true)}>
          <Text style={styles.fabText}>+ Agregar tarea</Text>
        </Pressable>
        <Pressable style={styles.finishButton} onPress={handleFinishDay} disabled={finishingDay}>
          {finishingDay ? <ActivityIndicator size="small" color="#dc2626" /> : <Text style={styles.finishButtonText}>Finalizar jornada</Text>}
        </Pressable>
      </View>

      <AddTaskModal visible={showAddModal} onClose={() => setShowAddModal(false)} onCreated={handleCreated} />

      <TaskCommentsModal
        visible={!!commentTask}
        task={commentTask}
        onClose={() => setCommentTask(null)}
        onCommentAdded={handleCommentAdded}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
  },
  greeting: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  date: { fontSize: 13, color: '#9ca3af', marginTop: 2, textTransform: 'capitalize' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  bell: { fontSize: 20 },
  listContent: { paddingHorizontal: 16, paddingBottom: 100, flexGrow: 1 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyText: { color: '#9ca3af', fontSize: 14 },
  errorBox: { backgroundColor: '#fee2e2', marginHorizontal: 16, borderRadius: 10, padding: 12, marginBottom: 4 },
  errorText: { color: '#b91c1c', fontSize: 13 },
  retryText: { color: '#b91c1c', fontWeight: '600', fontSize: 13, marginTop: 4, textDecorationLine: 'underline' },
  fabRow: {
    position: 'absolute', bottom: 24, left: 20, right: 20, flexDirection: 'row', gap: 10,
  },
  fab: {
    flex: 2, backgroundColor: '#F7931A', borderRadius: 14, paddingVertical: 15, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  finishButton: {
    flex: 1, borderWidth: 1, borderColor: '#dc2626', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  finishButtonText: { color: '#dc2626', fontWeight: '700', fontSize: 13, textAlign: 'center' },
})
