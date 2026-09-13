import { useState, useMemo } from 'react'
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createVacationRequest } from '../api/vacation'
import { createBenefitRequest } from '../api/benefits'
import { VACATION_TYPES, BENEFIT_BANKS } from '../lib/requestCatalog'
import { showAlert } from '../lib/alert'
import { useTheme } from '../context/ThemeContext'

const KINDS = [
  { value: 'vacation', label: '🏖️ Vacaciones / Licencia' },
  { value: 'horas_libres', label: '⏰ Horas libres' },
  { value: 'dias_home', label: '🏠 Días home' },
]

function toYMD(date) {
  return date.toLocaleDateString('en-CA') // YYYY-MM-DD en hora local
}

function fmtDate(date) {
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function RequestBenefitModal({ visible, onClose, onCreated }) {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const insets = useSafeAreaInsets()
  const [kind, setKind] = useState('vacation')
  const [vacType, setVacType] = useState('vacaciones')
  const [startDate, setStartDate] = useState(new Date())
  const [endDate, setEndDate] = useState(new Date())
  const [singleDate, setSingleDate] = useState(new Date())
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(null) // 'start' | 'end' | 'single' | null

  function reset() {
    setKind('vacation')
    setVacType('vacaciones')
    setStartDate(new Date())
    setEndDate(new Date())
    setSingleDate(new Date())
    setAmount('')
    setReason('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      if (kind === 'vacation') {
        const created = await createVacationRequest({
          startDate: toYMD(startDate), endDate: toYMD(endDate), type: vacType, observation: reason,
        })
        onCreated({ kind: 'vacation', ...created })
      } else {
        const amountNum = Number(amount)
        if (!amountNum || amountNum <= 0) {
          showAlert('Falta la cantidad', `Ingresá cuántas ${BENEFIT_BANKS.find(b => b.value === kind).unit} querés pedir.`)
          setSubmitting(false)
          return
        }
        const created = await createBenefitRequest({ bank: kind, amount: amountNum, date: toYMD(singleDate), reason })
        onCreated({ kind: 'benefit', ...created })
      }
      handleClose()
    } catch (err) {
      showAlert('No se pudo enviar', err.response?.data?.error || 'Probá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(32, insets.bottom + 20) }]}>
          <Text style={styles.title}>Nueva solicitud</Text>

          <View style={styles.chipsRow}>
            {KINDS.map(k => (
              <Pressable
                key={k.value}
                style={[styles.chip, kind === k.value && styles.chipSelected]}
                onPress={() => setKind(k.value)}
              >
                <Text style={[styles.chipText, kind === k.value && styles.chipTextSelected]}>{k.label}</Text>
              </Pressable>
            ))}
          </View>

          {kind === 'vacation' ? (
            <>
              <Text style={styles.label}>Tipo</Text>
              <View style={styles.chipsRow}>
                {VACATION_TYPES.map(t => (
                  <Pressable
                    key={t.value}
                    style={[styles.chipSmall, vacType === t.value && styles.chipSelected]}
                    onPress={() => setVacType(t.value)}
                  >
                    <Text style={[styles.chipSmallText, vacType === t.value && styles.chipTextSelected]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Desde</Text>
              <Pressable style={styles.dateButton} onPress={() => setPickerOpen('start')}>
                <Text style={styles.dateButtonText}>{fmtDate(startDate)}</Text>
              </Pressable>

              <Text style={styles.label}>Hasta</Text>
              <Pressable style={styles.dateButton} onPress={() => setPickerOpen('end')}>
                <Text style={styles.dateButtonText}>{fmtDate(endDate)}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.label}>Cantidad ({BENEFIT_BANKS.find(b => b.value === kind)?.unit})</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor={colors.placeholder}
              />

              <Text style={styles.label}>Fecha</Text>
              <Pressable style={styles.dateButton} onPress={() => setPickerOpen('single')}>
                <Text style={styles.dateButtonText}>{fmtDate(singleDate)}</Text>
              </Pressable>
            </>
          )}

          <Text style={styles.label}>{kind === 'vacation' ? 'Observación (opcional)' : 'Motivo (opcional)'}</Text>
          <TextInput
            style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
            value={reason}
            onChangeText={setReason}
            multiline
            placeholderTextColor={colors.placeholder}
          />

          {pickerOpen && (
            <DateTimePicker
              value={pickerOpen === 'start' ? startDate : pickerOpen === 'end' ? endDate : singleDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(event, selected) => {
                setPickerOpen(null)
                if (!selected) return
                if (pickerOpen === 'start') setStartDate(selected)
                else if (pickerOpen === 'end') setEndDate(selected)
                else setSingleDate(selected)
              }}
            />
          )}

          <View style={styles.footer}>
            <Pressable style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </Pressable>
            <Pressable style={[styles.submitButton, submitting && styles.buttonDisabled]} onPress={handleSubmit} disabled={submitting}>
              {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitButtonText}>Enviar</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function makeStyles(c) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, maxHeight: '88%' },
    title: { fontSize: 18, fontWeight: '700', marginBottom: 16, color: c.text },
    label: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginTop: 14, marginBottom: 6, textTransform: 'uppercase' },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
    chipSmall: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
    chipSelected: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: 13, color: c.textSecondary, fontWeight: '600' },
    chipSmallText: { fontSize: 12, color: c.textSecondary },
    chipTextSelected: { color: c.white },
    input: {
      borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 14,
      paddingVertical: 10, fontSize: 14, color: c.text,
    },
    dateButton: { borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
    dateButtonText: { fontSize: 14, color: c.text, fontWeight: '600' },
    footer: { flexDirection: 'row', gap: 10, marginTop: 20 },
    cancelButton: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: c.border },
    cancelButtonText: { color: c.textSecondary, fontWeight: '600' },
    submitButton: { flex: 1, backgroundColor: c.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
    submitButtonText: { color: c.white, fontWeight: '600' },
    buttonDisabled: { opacity: 0.5 },
  })
}
