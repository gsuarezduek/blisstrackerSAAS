import { useState, useEffect } from 'react'
import { View, Text, Pressable, Switch, StyleSheet, ActivityIndicator } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { getBiometricEnabled, setBiometricEnabled, getPushDisabled } from '../api/session'
import { isBiometricAvailable, authenticateAsync } from '../lib/biometrics'
import { showAlert } from '../lib/alert'

export default function ProfileScreen({ navigation }) {
  const { user, logout, togglePush } = useAuth()
  const [loading, setLoading] = useState(true)
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [biometricOn, setBiometricOn] = useState(false)
  const [pushOn, setPushOn] = useState(true)

  useEffect(() => {
    (async () => {
      const [available, bioEnabled, pushDisabled] = await Promise.all([
        isBiometricAvailable(), getBiometricEnabled(), getPushDisabled(),
      ])
      setBiometricAvailable(available)
      setBiometricOn(bioEnabled)
      setPushOn(!pushDisabled)
      setLoading(false)
    })()
  }, [])

  async function handleToggleBiometric(value) {
    if (value) {
      const ok = await authenticateAsync()
      if (!ok) return // Switch queda como estaba — es controlado, no cambia solo
      await setBiometricEnabled(true)
    } else {
      await setBiometricEnabled(false)
    }
    setBiometricOn(value)
  }

  async function handleTogglePush(value) {
    setPushOn(value) // optimista — togglePush es best-effort y no falla de forma visible
    await togglePush(value)
  }

  function handleLogout() {
    showAlert('Cerrar sesión', '¿Seguro que querés salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: logout },
    ])
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#F7931A" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        {user?.role ? (
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>{user.role}</Text>
          </View>
        ) : null}
      </View>

      <Pressable style={styles.section} onPress={() => navigation.navigate('Benefits')}>
        <View style={styles.row}>
          <Text style={styles.rowIcon}>🏖️</Text>
          <Text style={[styles.rowLabel, { flex: 1 }]}>Vacaciones y beneficios</Text>
          <Text style={styles.chevron}>›</Text>
        </View>
      </Pressable>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferencias</Text>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Login con Face ID / huella</Text>
            {!biometricAvailable && (
              <Text style={styles.rowHint}>Tu dispositivo no tiene biometría configurada</Text>
            )}
          </View>
          <Switch
            value={biometricOn}
            onValueChange={handleToggleBiometric}
            disabled={!biometricAvailable}
            trackColor={{ true: '#F7931A' }}
          />
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Notificaciones push</Text>
          <Switch value={pushOn} onValueChange={handleTogglePush} trackColor={{ true: '#F7931A' }} />
        </View>
      </View>

      <Pressable style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
  header: { alignItems: 'center', paddingVertical: 24 },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#F7931A',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 28 },
  name: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  email: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  roleBadge: { backgroundColor: '#fef3e2', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, marginTop: 10 },
  roleBadgeText: { color: '#c2670a', fontWeight: '700', fontSize: 12, textTransform: 'uppercase' },
  section: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginTop: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  rowIcon: { fontSize: 18 },
  rowLabel: { fontSize: 14, color: '#1a1a1a', fontWeight: '600' },
  rowHint: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  chevron: { fontSize: 20, color: '#d1d5db' },
  logoutButton: { marginTop: 24, alignItems: 'center', paddingVertical: 14 },
  logoutText: { color: '#dc2626', fontWeight: '700', fontSize: 15 },
})
