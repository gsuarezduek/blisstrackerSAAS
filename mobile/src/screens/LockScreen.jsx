import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { useAuth } from '../context/AuthContext'

export default function LockScreen() {
  const { unlock, forgetBiometricAndLogout } = useAuth()
  const [authenticating, setAuthenticating] = useState(false)
  const [failed, setFailed] = useState(false)
  const attemptedOnMount = useRef(false)

  async function attempt() {
    setAuthenticating(true)
    setFailed(false)
    const ok = await unlock()
    if (!ok) setFailed(true)
    setAuthenticating(false)
  }

  // Dispara el prompt biométrico apenas se muestra la pantalla — no hace
  // falta que el usuario toque un botón primero, mismo criterio que cualquier
  // app con app-lock (banco, 1Password, etc.).
  useEffect(() => {
    if (attemptedOnMount.current) return
    attemptedOnMount.current = true
    attempt()
  }, [])

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🔒</Text>
      <Text style={styles.title}>BlissTracker está bloqueado</Text>

      {authenticating ? (
        <ActivityIndicator style={{ marginTop: 24 }} color="#F7931A" />
      ) : (
        <>
          {failed && <Text style={styles.failedText}>No pudimos verificar tu identidad.</Text>}
          <Pressable style={styles.button} onPress={attempt}>
            <Text style={styles.buttonText}>Desbloquear</Text>
          </Pressable>
          <Pressable onPress={forgetBiometricAndLogout} hitSlop={8}>
            <Text style={styles.logoutText}>No puedo desbloquear — entrar con contraseña</Text>
          </Pressable>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 24 },
  failedText: { color: '#dc2626', marginBottom: 12, fontSize: 13 },
  button: { backgroundColor: '#F7931A', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 32, marginBottom: 16 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  logoutText: { color: '#9ca3af', fontSize: 13, textDecorationLine: 'underline', textAlign: 'center' },
})
