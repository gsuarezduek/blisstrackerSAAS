import { useState, useEffect, useCallback, useMemo } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Linking, RefreshControl } from 'react-native'
import { getProjectDetail, getProjectCompleted } from '../api/projects'
import { listChannels } from '../api/chat'
import TaskCard from '../components/TaskCard'
import TaskCommentsModal from '../components/TaskCommentsModal'
import { showAlert } from '../lib/alert'

// La situación del proyecto es HTML (editor WYSIWYG en la web) — acá se
// muestra como texto plano, sin renderizar formato. Simplificación
// deliberada para no sumar una dependencia de renderizado HTML por un campo
// de solo lectura.
function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function fmtCompletedDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export default function ProjectDetailScreen({ route, navigation }) {
  const { projectId, projectName } = route.params
  const [project, setProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [commentTask, setCommentTask] = useState(null)
  const [openingChat, setOpeningChat] = useState(false)

  const [completedOpen, setCompletedOpen] = useState(false)
  const [completed, setCompleted] = useState([])
  const [completedSkip, setCompletedSkip] = useState(0)
  const [completedHasMore, setCompletedHasMore] = useState(false)
  const [completedLoading, setCompletedLoading] = useState(false)

  useEffect(() => {
    navigation.setOptions({ title: projectName || 'Proyecto' })
  }, [navigation, projectName])

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true)
    try {
      const data = await getProjectDetail(projectId)
      setProject(data.project)
      // Aplana byUser (agrupado por persona) a una lista simple, guardando
      // userId/userName aparte — la respuesta de cada acción de TaskCard
      // (start/pause/complete/...) no trae `user`, así que hace falta
      // preservarlos a mano en handleUpdate para poder seguir agrupando.
      const flat = data.byUser.flatMap(g =>
        g.tasks.map(t => ({ ...t, userId: g.user.id, userName: g.user.name, project: { name: data.project.name } }))
      )
      setTasks(flat)
    } catch {
      showAlert('Error', 'No pudimos cargar el proyecto.')
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false)
    }
  }, [projectId])

  useFocusEffect(useCallback(() => { load() }, [load]))

  function handleUpdate(updated) {
    setTasks(prev => prev.map(t => (
      t.id === updated.id
        ? { ...updated, userId: t.userId, userName: t.userName, project: { name: project?.name } }
        : t
    )))
  }

  const byUser = useMemo(() => {
    const map = new Map()
    for (const t of tasks) {
      if (!map.has(t.userId)) map.set(t.userId, { userName: t.userName, tasks: [] })
      map.get(t.userId).tasks.push(t)
    }
    return Array.from(map.values())
  }, [tasks])

  const hasActiveTask = tasks.some(t => t.status === 'IN_PROGRESS')

  async function handleOpenChat() {
    if (!project?.chatChannel?.slug) return
    setOpeningChat(true)
    try {
      const channels = await listChannels()
      const found = channels.find(c => c.slug === project.chatChannel.slug)
      if (!found) { showAlert('Error', 'No encontramos el canal de este proyecto.'); return }
      navigation.navigate('Chat', { channelId: found.id, channelName: found.name })
    } catch {
      showAlert('Error', 'No pudimos abrir el chat.')
    } finally {
      setOpeningChat(false)
    }
  }

  async function loadCompleted(skip = 0) {
    setCompletedLoading(true)
    try {
      const data = await getProjectCompleted(projectId, skip)
      setCompleted(prev => (skip === 0 ? data.tasks : [...prev, ...data.tasks]))
      setCompletedHasMore(data.hasMore)
      setCompletedSkip(skip + data.tasks.length)
    } catch {
      showAlert('Error', 'No pudimos cargar el historial.')
    } finally {
      setCompletedLoading(false)
    }
  }

  function handleToggleCompleted() {
    setCompletedOpen(v => {
      if (!v && completed.length === 0) loadCompleted(0)
      return !v
    })
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#F7931A" />
      </View>
    )
  }

  if (!project) return null

  const situationText = stripHtml(project.situation)

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#F7931A" />}
      >
        {project.chatChannel?.slug && (
          <Pressable style={styles.chatButton} onPress={handleOpenChat} disabled={openingChat}>
            {openingChat ? <ActivityIndicator size="small" color="#F7931A" /> : <Text style={styles.chatButtonText}>💬 Abrir chat del proyecto</Text>}
          </Pressable>
        )}

        {project.websiteUrl && (
          <Pressable onPress={() => Linking.openURL(project.websiteUrl)} style={styles.infoRow}>
            <Text style={styles.infoLabel}>Sitio web</Text>
            <Text style={styles.infoLink} numberOfLines={1}>{project.websiteUrl}</Text>
          </Pressable>
        )}

        {situationText ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Situación</Text>
            <Text style={styles.sectionText}>{situationText}</Text>
          </View>
        ) : null}

        {project.links?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Links</Text>
            {project.links.map(l => (
              <Pressable key={l.id} onPress={() => Linking.openURL(l.url)} style={styles.linkRow}>
                <Text style={styles.linkText} numberOfLines={1}>🔗 {l.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {project.members?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Equipo</Text>
            <View style={styles.membersRow}>
              {project.members.map(m => (
                <View key={m.user.id} style={styles.memberChip}>
                  <Text style={styles.memberChipText}>{m.user.name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tareas activas ({tasks.length})</Text>
          {byUser.length === 0 ? (
            <Text style={styles.emptyText}>No hay tareas activas en este proyecto</Text>
          ) : (
            byUser.map(group => (
              <View key={group.userName} style={{ marginBottom: 12 }}>
                <Text style={styles.userGroupTitle}>{group.userName}</Text>
                {group.tasks.map(t => (
                  <TaskCard key={t.id} task={t} hasActiveTask={hasActiveTask} onUpdate={handleUpdate} onOpenComments={setCommentTask} />
                ))}
              </View>
            ))
          )}
        </View>

        <Pressable onPress={handleToggleCompleted} style={styles.completedHeader}>
          <Text style={styles.sectionTitle}>Completadas {completedOpen ? '▾' : '▸'}</Text>
        </Pressable>
        {completedOpen && (
          <View>
            {completed.map(t => (
              <View key={t.id} style={styles.completedRow}>
                <Text style={styles.completedDesc} numberOfLines={2}>{t.description}</Text>
                <Text style={styles.completedMeta}>{t.user?.name} · {fmtCompletedDate(t.completedAt)}</Text>
              </View>
            ))}
            {completedLoading && <ActivityIndicator style={{ marginVertical: 12 }} color="#F7931A" />}
            {completedHasMore && !completedLoading && (
              <Pressable onPress={() => loadCompleted(completedSkip)} style={{ paddingVertical: 12 }}>
                <Text style={styles.loadMoreText}>Cargar más</Text>
              </Pressable>
            )}
            {!completedLoading && completed.length === 0 && (
              <Text style={styles.emptyText}>No hay tareas completadas todavía</Text>
            )}
          </View>
        )}
      </ScrollView>

      <TaskCommentsModal
        visible={!!commentTask}
        task={commentTask}
        onClose={() => setCommentTask(null)}
        onCommentAdded={(taskId, newCount) =>
          setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, _count: { ...t._count, comments: newCount } } : t)))
        }
      />
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 40 },
  chatButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#F7931A', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 12 },
  chatButtonText: { color: '#F7931A', fontWeight: '700', fontSize: 14 },
  infoRow: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  infoLabel: { fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', fontWeight: '700', marginBottom: 2 },
  infoLink: { fontSize: 14, color: '#F7931A', fontWeight: '600' },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 },
  sectionText: { fontSize: 14, color: '#374151', lineHeight: 20 },
  linkRow: { paddingVertical: 8 },
  linkText: { fontSize: 14, color: '#F7931A', fontWeight: '600' },
  membersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberChip: { backgroundColor: '#f3f4f6', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  memberChipText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  userGroupTitle: { fontSize: 13, fontWeight: '700', color: '#1a1a1a', marginBottom: 6, marginTop: 4 },
  emptyText: { fontSize: 13, color: '#9ca3af' },
  completedHeader: { paddingVertical: 8 },
  completedRow: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  completedDesc: { fontSize: 13, color: '#374151', textDecorationLine: 'line-through' },
  completedMeta: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  loadMoreText: { color: '#F7931A', fontWeight: '600', fontSize: 13, textAlign: 'center' },
})
