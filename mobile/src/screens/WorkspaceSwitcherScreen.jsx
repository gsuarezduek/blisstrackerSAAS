import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { getWorkspaceSlug } from '../api/session'
import { listMyWorkspaces } from '../api/workspaces'
import { showAlert } from '../lib/alert'
import BlissLoader from '../components/BlissLoader'

// A diferencia de WorkspaceSelectScreen (post-login, cuando /auth/login ya
// devolvió el token de cada workspace), acá se listan con GET /workspaces/mine
// (sin token) y el cambio real se pide recién al elegir uno, vía
// AuthContext.switchWorkspace → POST /auth/switch-workspace.
export default function WorkspaceSwitcherScreen({ navigation }) {
  const { switchWorkspace } = useAuth()
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const [workspaces, setWorkspaces] = useState([])
  const [currentSlug, setCurrentSlug] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [switchingSlug, setSwitchingSlug] = useState(null)

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true)
    try {
      const [list, slug] = await Promise.all([listMyWorkspaces(), getWorkspaceSlug()])
      setWorkspaces(list)
      setCurrentSlug(slug)
    } catch {
      showAlert('Error', 'No pudimos cargar tus workspaces.')
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSelect(ws) {
    if (ws.slug === currentSlug || switchingSlug) return
    setSwitchingSlug(ws.slug)
    try {
      await switchWorkspace(ws.slug)
      // Reset (no push) — las pantallas que quedaron en el stack (Perfil, este
      // mismo selector) tienen datos del workspace anterior, no tiene sentido
      // poder "volver" a ellas con el back físico.
      navigation.reset({ index: 0, routes: [{ name: 'Dashboard' }] })
    } catch (err) {
      showAlert('No se pudo cambiar de workspace', err.response?.data?.error || 'Probá de nuevo.')
      setSwitchingSlug(null)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.backButton}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.title}>Cambiar de workspace</Text>
      </View>

      {loading ? (
        <View style={styles.centered}><BlissLoader size={56} /></View>
      ) : (
        <FlatList
          data={workspaces}
          keyExtractor={ws => ws.slug}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
          renderItem={({ item }) => {
            const isCurrent = item.slug === currentSlug
            const isSwitching = switchingSlug === item.slug
            return (
              <Pressable
                style={[styles.item, isCurrent && styles.itemCurrent]}
                onPress={() => handleSelect(item)}
                disabled={isCurrent || !!switchingSlug}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemSlug}>{item.slug}.blisstracker.app</Text>
                </View>
                {isCurrent ? (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentBadgeText}>Actual</Text>
                  </View>
                ) : isSwitching ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.chevron}>›</Text>
                )}
              </Pressable>
            )
          }}
        />
      )}
    </View>
  )
}

function makeStyles(c) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
      paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backButton: { color: c.primary, fontWeight: '600', fontSize: 14, marginBottom: 8 },
    title: { fontSize: 20, fontWeight: '700', color: c.text },
    listContent: { padding: 16, gap: 10 },
    item: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 16, paddingHorizontal: 16, borderRadius: 14,
      backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border, marginBottom: 10,
    },
    itemCurrent: { backgroundColor: c.primarySoft, borderColor: c.primary },
    itemName: { fontSize: 15, fontWeight: '700', color: c.text },
    itemSlug: { fontSize: 12, color: c.textFaint, marginTop: 2 },
    currentBadge: { backgroundColor: c.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    currentBadgeText: { color: c.white, fontWeight: '700', fontSize: 11 },
    chevron: { fontSize: 20, color: c.textFaint },
  })
}
