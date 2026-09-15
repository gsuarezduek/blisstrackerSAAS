import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { View, Text, SectionList, ScrollView, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { getToday } from '../api/tasks'
import { listNotifications } from '../api/notifications'
import { listChannels } from '../api/chat'
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

// Botón de header con badge opcional — mismo criterio visual que la campana
// de notificaciones/chat de la web: punto gris para "hay algo nuevo", círculo
// rojo con número cuando hay menciones/no-leídos que sí piden atención.
// Recibe `styles`/`colors` por prop (vive fuera del componente, no puede
// leer el `useMemo` de theme del padre directamente).
function HeaderIcon({ emoji, onPress, count = 0, dot = false, mention = false, styles, colors }) {
  const showBadge = dot || count > 0
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.headerIconWrap}>
      <Text style={styles.headerIcon}>{emoji}</Text>
      {showBadge && (
        <View style={[styles.badgeDot, (mention || count > 0) && styles.badgeDotRed, dot && !count && styles.badgeDotSmall]}>
          {count > 0 && <Text style={styles.badgeDotText}>{count > 9 ? '9+' : count}</Text>}
        </View>
      )}
    </Pressable>
  )
}

// Agrupa tareas de hoy + arrastradas de días anteriores en las mismas secciones
// que el Dashboard web (En curso / Destacadas / Pausadas / Bloqueadas /
// Pendientes / Completadas) y separa el Backlog con el mismo criterio que la
// web: una tarea de HOY va al backlog solo si `isBacklog` (movida a mano);
// una tarea ARRASTRADA de un día anterior cae ahí también si sigue PENDING
// sin destacar (perdió prioridad por el solo hecho de no haber arrancado) —
// `isCarryOver` se deriva de `workDayId` en vez de un flag propio, así no
// hay que taggear nada al mezclar `tasks`+`carryOverTasks` en un solo array.
function buildSections(tasks, todayWorkDayId) {
  const isStarred = t => (t.starred ?? 0) > 0
  const isCarryOver = t => t.workDayId !== todayWorkDayId
  const goesToBacklog = t => (isCarryOver(t) ? (t.isBacklog || (t.status === 'PENDING' && !isStarred(t))) : t.isBacklog)

  const focus = tasks.filter(t => !goesToBacklog(t))
  const backlogList = tasks.filter(goesToBacklog)

  const inProgress = focus.filter(t => t.status === 'IN_PROGRESS')
  const starred = focus.filter(t => isStarred(t) && t.status !== 'COMPLETED' && t.status !== 'IN_PROGRESS')
  const starredIds = new Set(starred.map(t => t.id))
  const paused = focus.filter(t => t.status === 'PAUSED' && !starredIds.has(t.id))
  const blocked = focus.filter(t => t.status === 'BLOCKED' && !starredIds.has(t.id))
  const pending = focus.filter(t => t.status === 'PENDING' && !starredIds.has(t.id))
  const completed = focus
    .filter(t => t.status === 'COMPLETED')
    .sort((a, b) => new Date(b.completedAt ?? 0) - new Date(a.completedAt ?? 0))

  const sections = []
  if (inProgress.length) sections.push({ title: 'En curso', data: inProgress })
  if (starred.length) sections.push({ title: 'Destacadas', data: starred })
  if (paused.length) sections.push({ title: 'Pausadas', data: paused })
  if (blocked.length) sections.push({ title: '⚠ Bloqueadas', data: blocked })
  if (pending.length) sections.push({ title: 'Pendientes', data: pending })
  if (completed.length) sections.push({ title: 'Completadas hoy', data: completed })
  return { sections, backlogList }
}

export default function DashboardScreen({ navigation }) {
  const { user, logout } = useAuth()
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const insets = useSafeAreaInsets()
  const [tasks, setTasks] = useState([])
  const [future, setFuture] = useState([])
  const [todayWorkDayId, setTodayWorkDayId] = useState(null)
  const [backlogOpen, setBacklogOpen] = useState(false)
  const [futureOpen, setFutureOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [commentTask, setCommentTask] = useState(null)
  const [finishingDay, setFinishingDay] = useState(false)
  const [unreadNotifs, setUnreadNotifs] = useState(0)
  const [chatBadge, setChatBadge] = useState({ count: 0, dot: false })
  const tasksRef = useRef(tasks)
  useEffect(() => { tasksRef.current = tasks }, [tasks])

  // Badges de los íconos de header — solo un adorno, así que se resuelven en
  // paralelo sin bloquear ni afectar el error banner de las tareas si fallan.
  const loadBadges = useCallback(async () => {
    try {
      const [notifs, channels] = await Promise.all([listNotifications(), listChannels()])
      setUnreadNotifs(notifs.filter(n => !n.read).length)
      const mentions = channels.reduce((sum, c) => sum + (c.mentionCount || 0), 0)
      const hasUnread = channels.some(c => c.unreadCount > 0 || c.mentionCount > 0)
      setChatBadge({ count: mentions, dot: hasUnread && mentions === 0 })
    } catch {
      // silencioso — badges son decorativos, no vale la pena un error banner por esto
    }
  }, [])

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const data = await getToday()
      setTasks([...(data.tasks ?? []), ...(data.carryOverTasks ?? [])])
      setFuture(data.futureTasks ?? [])
      setTodayWorkDayId(data.id)
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos cargar tus tareas.')
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false)
    }
  }, [])

  // Recarga cada vez que la pantalla vuelve a foco (ej. al volver de otra tab
  // en fases futuras), no solo en el mount inicial.
  useFocusEffect(useCallback(() => { load(); loadBadges() }, [load, loadBadges]))

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

  function handleCreated(task, assigneeName) {
    if (task.userId !== user?.id) {
      // Asignada a otro miembro del workspace — no es mía, no entra a mi Dashboard.
      showAlert('Tarea asignada', `Le asignaste "${task.description}" a ${assigneeName || 'otro miembro'}.`)
      return
    }
    if (task.scheduledFor) {
      setFuture(prev => [task, ...prev])
      return
    }
    setTasks(prev => [task, ...prev])
  }

  // scope='series' (recurrenceId != null) saca de ambas listas locales todas
  // las instancias de la serie, no solo la tocada — mismo criterio que la web.
  function handleDelete(taskId, recurrenceId) {
    const match = recurrenceId ? t => t.recurrenceId === recurrenceId : t => t.id === taskId
    setTasks(prev => prev.filter(t => !match(t)))
    setFuture(prev => prev.filter(t => !match(t)))
  }

  function handleCommentAdded(taskId, newCount) {
    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, _count: { ...t._count, comments: newCount } } : t)))
  }

  // La tarea sale de la sección "Futuras" (estado separado, no cae dentro de
  // la lógica de backlog de buildSections) y entra al foco de hoy.
  function handleBringToToday(updated) {
    setFuture(prev => prev.filter(t => t.id !== updated.id))
    setTasks(prev => [updated, ...prev])
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

  const { sections: focusSections, backlogList } = useMemo(
    () => buildSections(tasks, todayWorkDayId), [tasks, todayWorkDayId]
  )
  const sections = useMemo(() => {
    const s = [...focusSections]
    if (backlogList.length) {
      s.push({ key: 'backlog', title: '📥 Backlog', count: backlogList.length, collapsible: true, open: backlogOpen, data: backlogOpen ? backlogList : [] })
    }
    if (future.length) {
      s.push({ key: 'future', title: '📅 Futuras', count: future.length, collapsible: true, open: futureOpen, data: futureOpen ? future : [] })
    }
    return s
  }, [focusSections, backlogList, future, backlogOpen, futureOpen])
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
          <HeaderIcon emoji="📁" onPress={() => navigation.navigate('Projects')} styles={styles} colors={colors} />
          <HeaderIcon emoji="💬" onPress={() => navigation.navigate('Channels')} count={chatBadge.count} dot={chatBadge.dot} mention={chatBadge.count > 0} styles={styles} colors={colors} />
          <HeaderIcon emoji="🔔" onPress={() => navigation.navigate('Notifications')} count={unreadNotifs} styles={styles} colors={colors} />
          <HeaderIcon emoji="👤" onPress={() => navigation.navigate('Profile')} styles={styles} colors={colors} />
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => load()}><Text style={styles.retryText}>Reintentar</Text></Pressable>
        </View>
      ) : null}

      {sections.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        >
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={styles.emptyText}>No hay tareas para hoy</Text>
          </View>
        </ScrollView>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => String(item.id)}
          renderItem={({ item, section }) => (
            <TaskCard
              task={item}
              hasActiveTask={hasActiveTask}
              onUpdate={handleUpdate}
              onOpenComments={setCommentTask}
              onDelete={handleDelete}
              backlog={section.key === 'backlog'}
              future={section.key === 'future'}
              onBringToToday={handleBringToToday}
              onMoveToBacklog={handleUpdate}
            />
          )}
          renderSectionHeader={({ section }) => (
            section.collapsible ? (
              <Pressable
                style={styles.collapsibleHeader}
                onPress={() => (section.key === 'backlog' ? setBacklogOpen(v => !v) : setFutureOpen(v => !v))}
              >
                <Text style={styles.collapsibleHeaderText}>{section.title} ({section.count})</Text>
                <Text style={styles.chevron}>{section.open ? '︿' : '﹀'}</Text>
              </Pressable>
            ) : (
              <Text style={styles.sectionTitle}>{section.title}</Text>
            )
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 + insets.bottom }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
          stickySectionHeadersEnabled={false}
        />
      )}

      <View style={[styles.fabRow, { bottom: 24 + insets.bottom }]}>
        <Pressable style={styles.fab} onPress={() => setShowAddModal(true)}>
          <Text style={styles.fabText}>+ Agregar tarea</Text>
        </Pressable>
        <Pressable style={styles.finishButton} onPress={handleFinishDay} disabled={finishingDay}>
          {finishingDay ? <ActivityIndicator size="small" color={colors.danger} /> : <Text style={styles.finishButtonText}>Finalizar jornada</Text>}
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

function makeStyles(c) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.bg },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
      paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    greeting: { fontSize: 20, fontWeight: '700', color: c.text },
    date: { fontSize: 13, color: c.textFaint, marginTop: 2, textTransform: 'capitalize' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
    headerIconWrap: { position: 'relative' },
    headerIcon: { fontSize: 20 },
    badgeDot: {
      position: 'absolute', top: -4, right: -7, minWidth: 16, height: 16, borderRadius: 8,
      backgroundColor: c.textFaint, alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 4, borderWidth: 1.5, borderColor: c.surface,
    },
    badgeDotRed: { backgroundColor: c.danger },
    badgeDotSmall: { minWidth: 10, height: 10, borderRadius: 5, top: -2, right: -3 },
    badgeDotText: { color: c.white, fontSize: 9, fontWeight: '700' },
    listContent: { paddingHorizontal: 16, paddingBottom: 100, flexGrow: 1 },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
    collapsibleHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginTop: 16, marginBottom: 8, paddingVertical: 4,
    },
    collapsibleHeaderText: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase' },
    chevron: { fontSize: 14, color: c.textFaint },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
    emptyEmoji: { fontSize: 40, marginBottom: 8 },
    emptyText: { color: c.textFaint, fontSize: 14 },
    errorBox: { backgroundColor: c.dangerSoft, marginHorizontal: 16, borderRadius: 10, padding: 12, marginBottom: 4 },
    errorText: { color: c.dangerText, fontSize: 13 },
    retryText: { color: c.dangerText, fontWeight: '600', fontSize: 13, marginTop: 4, textDecorationLine: 'underline' },
    fabRow: {
      // `bottom` se sobreescribe en línea con el inset de la barra de gestos
      // del sistema (`useSafeAreaInsets`) — ver el JSX.
      position: 'absolute', left: 20, right: 20, flexDirection: 'row', gap: 10,
    },
    fab: {
      flex: 2, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center',
      shadowColor: c.shadow, shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    fabText: { color: c.white, fontWeight: '700', fontSize: 15 },
    finishButton: {
      flex: 1, borderWidth: 1, borderColor: c.danger, borderRadius: 14, paddingVertical: 15,
      alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface,
    },
    finishButtonText: { color: c.danger, fontWeight: '700', fontSize: 13, textAlign: 'center' },
  })
}
