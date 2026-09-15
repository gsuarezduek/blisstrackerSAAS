import { useState, useEffect, useMemo } from 'react'
import { View, Text, Pressable, Switch, StyleSheet, ActivityIndicator, Linking } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { getBiometricEnabled, setBiometricEnabled, getPushDisabled } from '../api/session'
import { isBiometricAvailable, authenticateAsync } from '../lib/biometrics'
import { showAlert } from '../lib/alert'

const THEME_OPTIONS = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
]

export default function ProfileScreen({ navigation }) {
  const { user, logout, togglePush } = useAuth()
  const { colors, preference, setPreference } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
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
        <ActivityIndicator size="large" color={colors.primary} />
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

      <Pressable style={styles.section} onPress={() => navigation.navigate('Productivity')}>
        <View style={styles.row}>
          <Text style={styles.rowIcon}>📊</Text>
          <Text style={[styles.rowLabel, { flex: 1 }]}>Mi productividad</Text>
          <Text style={styles.chevron}>›</Text>
        </View>
      </Pressable>

      <Pressable style={styles.section} onPress={() => navigation.navigate('Benefits')}>
        <View style={styles.row}>
          <Text style={styles.rowIcon}>🏖️</Text>
          <Text style={[styles.rowLabel, { flex: 1 }]}>Vacaciones y beneficios</Text>
          <Text style={styles.chevron}>›</Text>
        </View>
      </Pressable>

      <Pressable style={styles.section} onPress={() => navigation.navigate('WorkspaceSwitcher')}>
        <View style={styles.row}>
          <Text style={styles.rowIcon}>🔀</Text>
          <Text style={[styles.rowLabel, { flex: 1 }]}>Cambiar de workspace</Text>
          <Text style={styles.chevron}>›</Text>
        </View>
      </Pressable>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Apariencia</Text>
        <View style={styles.chipsRow}>
          {THEME_OPTIONS.map(opt => (
            <Pressable
              key={opt.value}
              style={[styles.chip, preference === opt.value && styles.chipSelected]}
              onPress={() => setPreference(opt.value)}
            >
              <Text style={[styles.chipText, preference === opt.value && styles.chipTextSelected]}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

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
            trackColor={{ true: colors.primary }}
          />
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Notificaciones push</Text>
          <Switch value={pushOn} onValueChange={handleTogglePush} trackColor={{ true: colors.primary }} />
        </View>
      </View>

      <View style={styles.section}>
        <Pressable style={styles.legalRow} onPress={() => Linking.openURL('https://blisstracker.app/condiciones')}>
          <Text style={styles.legalText}>Términos de servicio</Text>
        </Pressable>
        <Pressable style={styles.legalRow} onPress={() => Linking.openURL('https://blisstracker.app/privacidad')}>
          <Text style={styles.legalText}>Política de privacidad</Text>
        </Pressable>
      </View>

      <Pressable style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </Pressable>
    </View>
  )
}

function makeStyles(c) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg, padding: 20 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.bg },
    header: { alignItems: 'center', paddingVertical: 24 },
    avatar: {
      width: 72, height: 72, borderRadius: 36, backgroundColor: c.primary,
      alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    },
    avatarText: { color: c.white, fontWeight: '700', fontSize: 28 },
    name: { fontSize: 18, fontWeight: '700', color: c.text },
    email: { fontSize: 13, color: c.textFaint, marginTop: 2 },
    roleBadge: { backgroundColor: c.primarySoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, marginTop: 10 },
    roleBadgeText: { color: c.primarySoftText, fontWeight: '700', fontSize: 12, textTransform: 'uppercase' },
    section: { backgroundColor: c.surface, borderRadius: 14, padding: 16, marginTop: 12 },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', marginBottom: 12 },
    chipsRow: { flexDirection: 'row', gap: 8 },
    chip: { flex: 1, borderWidth: 1.5, borderColor: c.border, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
    chipSelected: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: 13, color: c.textSecondary, fontWeight: '600' },
    chipTextSelected: { color: c.white },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
    rowIcon: { fontSize: 18 },
    rowLabel: { fontSize: 14, color: c.text, fontWeight: '600' },
    rowHint: { fontSize: 12, color: c.textFaint, marginTop: 2 },
    chevron: { fontSize: 20, color: c.border },
    legalRow: { paddingVertical: 8 },
    legalText: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
    logoutButton: { marginTop: 24, alignItems: 'center', paddingVertical: 14 },
    logoutText: { color: c.danger, fontWeight: '700', fontSize: 15 },
  })
}
