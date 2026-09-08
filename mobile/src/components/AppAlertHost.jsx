import { useEffect, useState, useCallback } from 'react'
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native'
import { setAlertHandler } from '../lib/alert'

// Montado una vez en App.js. Reemplaza Alert.alert (diálogo gris del SO) por
// un modal con la estética de BlissTracker — ver src/lib/alert.js para la
// API imperativa que lo dispara desde cualquier parte de la app.
export default function AppAlertHost() {
  const [config, setConfig] = useState(null)

  const show = useCallback(cfg => setConfig(cfg), [])

  useEffect(() => {
    setAlertHandler(show)
    return () => setAlertHandler(null)
  }, [show])

  function press(button) {
    setConfig(null)
    button.onPress?.()
  }

  if (!config) return null

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setConfig(null)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {config.title ? <Text style={styles.title}>{config.title}</Text> : null}
          {config.message ? <Text style={styles.message}>{config.message}</Text> : null}
          <View style={[styles.buttonRow, config.buttons.length === 1 && styles.buttonRowSingle]}>
            {config.buttons.map((b, i) => (
              <Pressable
                key={i}
                style={[
                  styles.button,
                  b.style === 'cancel' && styles.buttonCancel,
                  b.style === 'destructive' && styles.buttonDestructive,
                  config.buttons.length === 1 && styles.buttonFull,
                ]}
                onPress={() => press(b)}
              >
                <Text style={[
                  styles.buttonText,
                  b.style === 'cancel' && styles.buttonTextCancel,
                ]}>
                  {b.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  card: {
    width: '100%', maxWidth: 340, backgroundColor: '#fff', borderRadius: 18, padding: 22,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginBottom: 8, textAlign: 'center' },
  message: { fontSize: 14, color: '#4b5563', lineHeight: 20, textAlign: 'center', marginBottom: 20 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  buttonRowSingle: { justifyContent: 'center' },
  button: { flex: 1, backgroundColor: '#F7931A', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  buttonFull: { flex: 1 },
  buttonCancel: { backgroundColor: '#f3f4f6' },
  buttonDestructive: { backgroundColor: '#dc2626' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  buttonTextCancel: { color: '#374151' },
})
