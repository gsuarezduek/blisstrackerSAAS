import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native'
import { useAuth } from '../context/AuthContext'

export default function WorkspaceSelectScreen() {
  const { pendingWorkspaces, selectWorkspace } = useAuth()

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Elegí un workspace</Text>
      <FlatList
        data={pendingWorkspaces || []}
        keyExtractor={ws => ws.slug}
        renderItem={({ item }) => (
          <Pressable style={styles.item} onPress={() => selectWorkspace(item)}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemRole}>{item.role}</Text>
          </Pressable>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 80, paddingHorizontal: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 20, color: '#1a1a1a' },
  item: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 16, paddingHorizontal: 16, borderRadius: 10,
    backgroundColor: '#f5f5f5', marginBottom: 10,
  },
  itemName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  itemRole: { fontSize: 13, color: '#888', textTransform: 'capitalize' },
})
