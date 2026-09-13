import { useState, useMemo } from 'react'
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, ScrollView, Platform, Linking,
} from 'react-native'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import BlissIcon from '../components/BlissIcon'

// Mismo look del login web (Login2.jsx → RootLogin): lockup arriba, título +
// subtítulo, inputs redondeados con foco naranja, banner de error, botón
// primario. La "tarjeta" es solo la columna centrada — sin fondo propio,
// como en la web — para que se sienta la misma app, no una pantalla genérica.
export default function LoginScreen() {
  const { login } = useAuth()
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [focusedField, setFocusedField] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!email || !password || submitting) return
    setError('')
    setSubmitting(true)
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos iniciar sesión. Probá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.lockup}>
          <BlissIcon size={30} />
          <Text style={styles.lockupText}>BlissTracker</Text>
        </View>

        <View style={styles.headings}>
          <Text style={styles.title}>Bienvenido</Text>
          <Text style={styles.subtitle}>Iniciá sesión para continuar.</Text>
        </View>

        <TextInput
          style={[styles.input, focusedField === 'email' && styles.inputFocused]}
          placeholder="tu@empresa.com"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          onFocus={() => setFocusedField('email')}
          onBlur={() => setFocusedField(null)}
        />

        <View style={[styles.input, styles.passwordRow, focusedField === 'password' && styles.inputFocused]}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Contraseña"
            placeholderTextColor={colors.placeholder}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocusedField('password')}
            onBlur={() => setFocusedField(null)}
            onSubmitEditing={handleSubmit}
            returnKeyType="go"
          />
          <Pressable onPress={() => setShowPassword(v => !v)} hitSlop={8}>
            <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color={colors.white} />
            : <Text style={styles.buttonText}>Ingresar</Text>}
        </Pressable>

        <Pressable
          style={styles.forgotLink}
          onPress={() => Linking.openURL('https://blisstracker.app/forgot-password')}
          hitSlop={8}
        >
          <Text style={styles.forgotLinkText}>¿Olvidaste tu contraseña?</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function makeStyles(c) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 40 },
    lockup: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 28 },
    lockupText: { fontSize: 17, fontWeight: '700', color: c.text },
    headings: { marginBottom: 24 },
    title: { fontSize: 26, fontWeight: '700', color: c.text, marginBottom: 4 },
    subtitle: { fontSize: 14, color: c.textMuted },
    input: {
      borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface, borderRadius: 14,
      paddingHorizontal: 16, paddingVertical: 13, marginBottom: 12, fontSize: 15, color: c.text,
    },
    inputFocused: { borderColor: c.primary },
    passwordRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 0, paddingRight: 12 },
    passwordInput: { flex: 1, paddingVertical: 13, fontSize: 15, color: c.text },
    eyeIcon: { fontSize: 16, marginLeft: 8 },
    errorBanner: { backgroundColor: c.dangerSoft, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12 },
    errorText: { color: c.dangerText, fontSize: 13 },
    button: {
      backgroundColor: c.primary, borderRadius: 14, paddingVertical: 15,
      alignItems: 'center', marginTop: 4,
      shadowColor: c.primary, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: c.white, fontSize: 16, fontWeight: '700' },
    forgotLink: { marginTop: 20, alignItems: 'center' },
    forgotLinkText: { color: c.textFaint, fontSize: 13 },
  })
}
