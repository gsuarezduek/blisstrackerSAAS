import { useState, useCallback, useMemo } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { getMyVacation } from '../api/vacation'
import { getMyBenefits } from '../api/benefits'
import { vacationTypeLabel, benefitBankLabel, STATUS_LABEL, STATUS_COLOR } from '../lib/requestCatalog'
import RequestBenefitModal from '../components/RequestBenefitModal'
import { showAlert } from '../lib/alert'

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
        <ActivityIndicator size="large" color="#F7931A" />
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
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#F7931A" />}
          ListHeaderComponent={<Text style={styles.sectionTitle}>Mis solicitudes</Text>}
          ListEmptyComponent={<Text style={styles.empty}>No pediste licencias ni beneficios todavía</Text>}
          renderItem={({ item }) => {
            const { icon, title, subtitle } = describeRequest(item)
            const statusStyle = STATUS_COLOR[item.status]
            return (
              <View style={styles.row}>
                <Text style={styles.rowIcon}>{icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{title}</Text>
                  <Text style={styles.rowSubtitle}>{subtitle}</Text>
                  {item.reviewNote ? <Text style={styles.reviewNote}>{item.reviewNote}</Text> : null}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                  <Text style={[styles.statusBadgeText, { color: statusStyle.color }]}>{STATUS_LABEL[item.status]}</Text>
                </View>
              </View>
            )
          }}
        />

        <Pressable style={styles.fab} onPress={() => setShowModal(true)}>
          <Text style={styles.fabText}>+ Nueva solicitud</Text>
        </Pressable>
      </View>

      <RequestBenefitModal visible={showModal} onClose={() => setShowModal(false)} onCreated={handleCreated} />
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  backButton: { color: '#F7931A', fontWeight: '600', fontSize: 14, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  balancesRow: { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: '#fff' },
  balanceCard: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  balanceEmoji: { fontSize: 20, marginBottom: 4 },
  balanceValue: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  balanceLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2, textAlign: 'center' },
  listContent: { padding: 16, paddingBottom: 100 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff',
    borderRadius: 12, padding: 14, marginBottom: 10,
  },
  rowIcon: { fontSize: 22 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', textTransform: 'capitalize' },
  rowSubtitle: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  reviewNote: { fontSize: 12, color: '#6b7280', marginTop: 4, fontStyle: 'italic' },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  fab: {
    position: 'absolute', bottom: 24, left: 20, right: 20,
    backgroundColor: '#F7931A', borderRadius: 14, paddingVertical: 15, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
