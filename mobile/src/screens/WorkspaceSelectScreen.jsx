import { useMemo } from 'react'
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import BlissIcon from '../components/BlissIcon'

export default function WorkspaceSelectScreen() {
  const { pendingWorkspaces, selectWorkspace } = useAuth()
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])

  return (
    <View style={styles.container}>
      <View style={styles.lockup}>
        <BlissIcon size={30} />
        <Text style={styles.lockupText}>BlissTracker</Text>
      </View>

      <View style={styles.headings}>
        <Text style={styles.title}>Tus workspaces</Text>
        <Text style={styles.subtitle}>Elegí a cuál querés ingresar.</Text>
      </View>

      <FlatList
        data={pendingWorkspaces || []}
        keyExtractor={ws => ws.slug}
        contentContainerStyle={{ gap: 10 }}
        renderItem={({ item }) => (
          <Pressable style={styles.item} onPress={() => selectWorkspace(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemSlug}>{item.slug}.blisstracker.app</Text>
            </View>
            {item.role ? (
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{item.role}</Text>
              </View>
            ) : null}
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />
    </View>
  )
}

function makeStyles(c) {
  return StyleSheet.create({
    container: { flex: 1, paddingTop: 72, paddingHorizontal: 28, backgroundColor: c.bg },
    lockup: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 28 },
    lockupText: { fontSize: 17, fontWeight: '700', color: c.text },
    headings: { marginBottom: 20 },
    title: { fontSize: 22, fontWeight: '700', color: c.text, marginBottom: 4 },
    subtitle: { fontSize: 14, color: c.textMuted },
    item: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 16, paddingHorizontal: 16, borderRadius: 14,
      backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border,
    },
    itemName: { fontSize: 15, fontWeight: '700', color: c.text },
    itemSlug: { fontSize: 12, color: c.textFaint, marginTop: 2 },
    roleBadge: { backgroundColor: c.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    roleBadgeText: { color: c.primarySoftText, fontWeight: '700', fontSize: 11, textTransform: 'capitalize' },
    chevron: { fontSize: 20, color: c.textFaint },
  })
}
