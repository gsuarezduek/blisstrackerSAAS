import { useState, useCallback, useMemo } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../context/ThemeContext'
import { getMyVacation } from '../api/vacation'
import { getMyBenefits } from '../api/benefits'
import { vacationTypeLabel, benefitBankLabel, STATUS_LABEL, STATUS_COLOR_KEYS } from '../lib/requestCatalog'
import RequestBenefitModal from '../components/RequestBenefitModal'
import { showAlert } from '../lib/alert'
import BlissLoader from '../components/BlissLoader'

function fmtDate(dateStr) {
  // Fechas "YYYY-MM-DD" puras — parsearlas con `new Date(str)` las corre un día
  // por timezone (se interpretan como UTC medianoche). Se arman a mano.
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function describeRequest(item) {
  if (item.kind === 'vacation') {
    const range = item.startDate === item.endDate ? fmtDate(item.startDate) : `${fmtDate(item.startDate)} → ${fmtDate(item.endDate)}`
    return { icon: '🏖️', title: vacationTypeLabel(item.type), subtitle: range }
  }
  const icon = item.bank === 'horas_libres' ? '⏰' : '🏠'
  return { icon, title: `${item.amount} ${benefitBankLabel(item.bank).toLowerCase()}`, subtitle: fmtDate(item.date) }
}

export default function BenefitsScreen({ navigation }) {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const insets = useSafeAreaInsets()
  const [vacation, setVacation] = useState(null)
  const [benefits, setBenefits] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true)
    try {
      const [v, b] = await Promise.all([getMyVacation(), getMyBenefits()])
      setVacation(v)
      setBenefits(b)
    } catch (err) {
      showAlert('Error', err.response?.data?.error || 'No pudimos cargar tus licencias y beneficios.')
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const requests = useMemo(() => {
    if (!vacation || !benefits) return []
    const vac = vacation.requests.map(r => ({ ...r, kind: 'vacation' }))
    const ben = benefits.requests.map(r => ({ ...r, kind: 'benefit' }))
    return [...vac, ...ben].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [vacation, benefits])

  function handleCreated() {
    load()
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <BlissLoader size={56} />
      </View>
    )
  }

  return (
    <>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={styles.backButton}>‹ Volver</Text>
          </Pressable>
          <Text style={styles.title}>Vacaciones y beneficios</Text>
        </View>

        <View style={styles.balancesRow}>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceEmoji}>🏖️</Text>
            <Text style={styles.balanceValue}>{vacation?.vacationDays ?? 0}</Text>
            <Text style={styles.balanceLabel}>días vacaciones</Text>
          </View>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceEmoji}>⏰</Text>
            <Text style={styles.balanceValue}>{benefits?.balances?.horas_libres ?? 0}</Text>
            <Text style={styles.balanceLabel}>horas libres</Text>
          </View>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceEmoji}>🏠</Text>
            <Text style={styles.balanceValue}>{benefits?.balances?.dias_home ?? 0}</Text>
            <Text style={styles.balanceLabel}>días home</Text>
          </View>
        </View>

        <FlatList
          data={requests}
          keyExtractor={item => `${item.kind}-${item.id}`}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 + insets.bottom }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
          ListHeaderComponent={<Text style={styles.sectionTitle}>Mis solicitudes</Text>}
          ListEmptyComponent={<Text style={styles.empty}>No pediste licencias ni beneficios todavía</Text>}
          renderItem={({ item }) => {
            const { icon, title, subtitle } = describeRequest(item)
            const statusKey = STATUS_COLOR_KEYS[item.status]
            return (
              <View style={styles.row}>
                <Text style={styles.rowIcon}>{icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{title}</Text>
                  <Text style={styles.rowSubtitle}>{subtitle}</Text>
                  {item.reviewNote ? <Text style={styles.reviewNote}>{item.reviewNote}</Text> : null}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: colors[statusKey.bg] }]}>
                  <Text style={[styles.statusBadgeText, { color: colors[statusKey.text] }]}>{STATUS_LABEL[item.status]}</Text>
                </View>
              </View>
            )
          }}
        />

        <Pressable style={[styles.fab, { bottom: 24 + insets.bottom }]} onPress={() => setShowModal(true)}>
          <Text style={styles.fabText}>+ Nueva solicitud</Text>
        </Pressable>
      </View>

      <RequestBenefitModal visible={showModal} onClose={() => setShowModal(false)} onCreated={handleCreated} />
    </>
  )
}

function makeStyles(c) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.bg },
    header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    backButton: { color: c.primary, fontWeight: '600', fontSize: 14, marginBottom: 8 },
    title: { fontSize: 20, fontWeight: '700', color: c.text },
    balancesRow: { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: c.surface },
    balanceCard: { flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    balanceEmoji: { fontSize: 20, marginBottom: 4 },
    balanceValue: { fontSize: 20, fontWeight: '700', color: c.text },
    balanceLabel: { fontSize: 11, color: c.textFaint, marginTop: 2, textAlign: 'center' },
    listContent: { padding: 16, paddingBottom: 100 },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', marginBottom: 8 },
    empty: { textAlign: 'center', color: c.textFaint, marginTop: 24 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface,
      borderRadius: 12, padding: 14, marginBottom: 10,
    },
    rowIcon: { fontSize: 22 },
    rowTitle: { fontSize: 14, fontWeight: '700', color: c.text, textTransform: 'capitalize' },
    rowSubtitle: { fontSize: 12, color: c.textFaint, marginTop: 2 },
    reviewNote: { fontSize: 12, color: c.textMuted, marginTop: 4, fontStyle: 'italic' },
    statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    statusBadgeText: { fontSize: 11, fontWeight: '700' },
    fab: {
      // `bottom` se sobreescribe en línea con el inset de la barra de gestos
      // del sistema (`useSafeAreaInsets`) — ver el JSX.
      position: 'absolute', left: 20, right: 20,
      backgroundColor: c.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center',
      shadowColor: c.shadow, shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    fabText: { color: c.white, fontWeight: '700', fontSize: 15 },
  })
}
