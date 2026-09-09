import { useState, useCallback, useMemo } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { View, Text, SectionList, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { listProjects, toggleProjectStar } from '../api/projects'

// Mismo agrupado que "Mis Proyectos" en la web: Destacados (preferencia
// personal, ProjectStar) → Mis proyectos (soy del equipo, ProjectMember) →
// Otros proyectos del workspace. Un destacado sale de su grupo original y
// sube a Destacados — no aparece dos veces.
function groupProjects(projects, userId) {
  const starred = []
  const mine = []
  const others = []
  for (const p of projects) {
    if (p.starred) starred.push(p)
    else if (p.members?.some(m => m.user.id === userId)) mine.push(p)
    else others.push(p)
  }
  const sections = []
  if (starred.length) sections.push({ title: '⭐ Destacados', data: starred })
  if (mine.length) sections.push({ title: 'Mis proyectos', data: mine })
  if (others.length) sections.push({ title: 'Otros proyectos del workspace', data: others })
  return sections
}

export default function ProjectListScreen({ navigation }) {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true)
    try {
      setProjects(await listProjects())
    } catch {
      // silencioso — reintenta al volver a foco
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function handleToggleStar(project) {
    setProjects(prev => prev.map(p => (p.id === project.id ? { ...p, starred: !p.starred } : p)))
    try {
      await toggleProjectStar(project.id)
    } catch {
      setProjects(prev => prev.map(p => (p.id === project.id ? { ...p, starred: project.starred } : p)))
    }
  }

  const sections = useMemo(() => groupProjects(projects, user?.id), [projects, user?.id])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.backButton}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.title}>Proyectos</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#F7931A" />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={p => String(p.id)}
          renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#F7931A" />}
          ListEmptyComponent={<Text style={styles.empty}>No hay proyectos todavía</Text>}
          renderItem={({ item }) => {
            const counts = item.taskCounts || {}
            const active = (counts.IN_PROGRESS ?? 0) + (counts.PENDING ?? 0) + (counts.PAUSED ?? 0) + (counts.BLOCKED ?? 0)
            return (
              <Pressable
                style={styles.row}
                onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id, projectName: item.name })}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    {counts.BLOCKED > 0 && <View style={styles.blockedDot} />}
                    <Text style={styles.projectName} numberOfLines={1}>{item.name}</Text>
                  </View>
                  <Text style={styles.projectMeta}>{active} activa{active === 1 ? '' : 's'}</Text>
                </View>
                <Pressable onPress={() => handleToggleStar(item)} hitSlop={10} style={styles.starButton}>
                  <Text style={[styles.star, item.starred && styles.starActive]}>★</Text>
                </Pressable>
              </Pressable>
            )
          }}
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
  listContent: { paddingBottom: 24 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  blockedDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#dc2626' },
  projectName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', flexShrink: 1 },
  projectMeta: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  starButton: { padding: 4 },
  star: { fontSize: 20, color: '#d1d5db' },
  starActive: { color: '#eab308' },
})
