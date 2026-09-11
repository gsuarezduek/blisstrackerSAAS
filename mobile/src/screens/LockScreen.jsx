import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useAuth } from '../context/AuthContext'
import BlissIcon from '../components/BlissIcon'
import BlissLoader from '../components/BlissLoader'

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
      <BlissIcon size={64} />
      <Text style={styles.title}>BlissTracker está bloqueado</Text>
      <Text style={styles.subtitle}>Verificá tu identidad para continuar.</Text>

      {authenticating ? (
        <BlissLoader size={48} style={{ marginTop: 28 }} />
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
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, backgroundColor: '#f9fafb' },
  title: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginTop: 20, textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 24, textAlign: 'center' },
  failedText: { color: '#dc2626', marginBottom: 12, fontSize: 13 },
  button: {
    backgroundColor: '#F7931A', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 36, marginBottom: 16,
    shadowColor: '#F7931A', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  logoutText: { color: '#9ca3af', fontSize: 13, textDecorationLine: 'underline', textAlign: 'center' },
})
