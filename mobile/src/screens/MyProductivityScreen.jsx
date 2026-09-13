import { useState, useCallback, useMemo } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl } from 'react-native'
import Svg, { Line, Polyline, Circle } from 'react-native-svg'
import { useTheme } from '../context/ThemeContext'
import { getMyProductivity, getMyHoursHistory } from '../api/productivity'
import BlissLoader from '../components/BlissLoader'

const fmtHours = h => (h >= 1 ? `${Math.round(h * 10) / 10}h` : h > 0 ? `${Math.round(h * 60)}m` : '—')

// "d/m" a partir de un weekStart "YYYY-MM-DD".
function weekLabel(ws) {
  if (!ws) return ''
  const [, m, d] = ws.split('-')
  return `${+d}/${+m}`
}

// Nota suave que reemplaza al semáforo crudo (no expone etiquetas "down"/"stuck") —
// mismo criterio y mismos textos que MyProductivity.jsx en la web.
function softNote(d, c) {
  if (!d.hasData) return null
  if (d.status === 'up') return { color: c.successText, text: '💪 Vas por encima de tu ritmo del mes pasado.' }
  if (d.stats.stuckTasks > 0) {
    const n = d.stats.stuckTasks
    return { color: c.primarySoftText, text: `Tenés ${n} tarea${n !== 1 ? 's' : ''} frenada${n !== 1 ? 's' : ''} hace más de una semana — quizá valga la pena retomarlas o cerrarlas.` }
  }
  if (d.status === 'inactive' || d.status === 'down') {
    return { color: c.textMuted, text: 'Tu ritmo bajó respecto al mes pasado. Puede ser un buen momento para reorganizar prioridades.' }
  }
  return null
}

// Réplica del sparkline SVG de la web (mismos ejes/gradiente de línea, con
// `preserveAspectRatio="none"` para que el ancho del viewBox estire 1:1 al
// contenedor y las etiquetas del eje X posicionadas en % calcen exacto).
function Sparkline({ history, colors }) {
  const data = history || []
  if (!data.length) return null
  const W = 320, H = 90, padT = 6, padB = 6
  const max = Math.max(...data.map(d => d.hours), 1)
  const n = data.length
  const x = i => (n === 1 ? W / 2 : (i * W) / (n - 1))
  const y = v => padT + (H - padT - padB) - (v / max) * (H - padT - padB)
  const points = data.map((d, i) => `${x(i).toFixed(1)},${y(d.hours).toFixed(1)}`).join(' ')
  const xTicks = data.map((_, i) => i).filter(i => i % 3 === 0 || i === n - 1)

  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {[0, 0.5, 1].map(f => (
          <Line key={f} x1="0" x2={W} y1={y(max * f)} y2={y(max * f)} stroke={colors.border} strokeWidth="1" />
        ))}
        <Polyline points={points} fill="none" stroke={colors.primary} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <Circle key={i} cx={x(i)} cy={y(d.hours)} r={i === n - 1 ? 3 : 2} fill={colors.primary} />
        ))}
      </Svg>
      <View style={{ height: 16, marginTop: 4 }}>
        {data.map((d, i) => (
          xTicks.includes(i) ? (
            <Text
              key={i}
              style={{
                position: 'absolute', fontSize: 10, color: colors.textFaint,
                left: `${n === 1 ? 50 : (i * 100) / (n - 1)}%`,
                transform: i === n - 1 ? [{ translateX: -22 }] : undefined,
              }}
            >
              {weekLabel(d.weekStart)}
            </Text>
          ) : null
        ))}
      </View>
    </View>
  )
}

function Metric({ label, value, team, styles }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      {team != null && <Text style={styles.metricTeam}>equipo {team}</Text>}
    </View>
  )
}

export default function MyProductivityScreen({ navigation }) {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [back, setBack] = useState(0)
  const [history, setHistory] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const d = await getMyProductivity()
      setData(d)
      setHistory(d.stats?.hoursHistory ?? null)
      setBack(0)
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos cargar tu productividad.')
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function goTo(next) {
    if (next < 0 || next === back || historyLoading) return
    setHistoryLoading(true)
    try {
      if (next === 0) {
        setHistory(data.stats?.hoursHistory ?? null)
      } else {
        const { history: h } = await getMyHoursHistory(next)
        setHistory(h)
      }
      setBack(next)
    } catch {
      // se queda con el historial que ya tenía cargado
    } finally {
      setHistoryLoading(false)
    }
  }

  const rangeLabel = history?.length
    ? `${weekLabel(history[0].weekStart)} – ${weekLabel(history[history.length - 1].weekStart)}`
    : ''

  const s = data?.stats
  const b = data?.benchmark
  const util = s?.utilization != null ? `${Math.round(s.utilization * 100)}%` : '—'
  const utilTeam = b?.utilizationMedian != null ? `${Math.round(b.utilizationMedian * 100)}%` : null
  const note = data ? softNote(data, colors) : null
  const ins = data?.insight

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.backButton}>‹ Volver</Text>
        </Pressable>
        <Text style={styles.title}>Mi productividad</Text>
        <Text style={styles.subtitle}>Mes en curso</Text>
      </View>

      {loading ? (
        <View style={styles.centered}><BlissLoader size={56} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        >
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => load()}><Text style={styles.retryText}>Reintentar</Text></Pressable>
            </View>
          ) : !data?.hasData ? (
            <Text style={styles.empty}>Todavía no hay actividad registrada este mes.</Text>
          ) : (
            <>
              <View style={styles.metricsGrid}>
                <Metric label="Δ horas" value={util} team={utilTeam} styles={styles} />
                <Metric label="Tareas completadas" value={s.completed} team={b ? Math.round(b.completed) : null} styles={styles} />
                <Metric label="Horas registradas" value={fmtHours(s.hours)} team={b ? fmtHours(b.horas) : null} styles={styles} />
                <Metric label="Tasa de cierre" value={`${Math.round(s.tasaCompletado * 100)}%`} team={b ? `${Math.round(b.tasaCompletado * 100)}%` : null} styles={styles} />
              </View>

              {history?.some(w => w.hours > 0) && (
                <View style={styles.sparklineSection}>
                  <View style={styles.sparklineHeader}>
                    <Text style={styles.sparklineTitle}>Horas por semana · últimas 12</Text>
                    <View style={styles.sparklineNav}>
                      <Pressable onPress={() => goTo(back + 1)} disabled={historyLoading} hitSlop={6}>
                        <Text style={styles.navText}>← antes</Text>
                      </Pressable>
                      <Text style={styles.rangeText}>{rangeLabel}</Text>
                      <Pressable onPress={() => goTo(back - 1)} disabled={historyLoading || back === 0} hitSlop={6}>
                        <Text style={[styles.navText, back === 0 && styles.navTextDisabled]}>después →</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Sparkline history={history} colors={colors} />
                </View>
              )}

              {note && <Text style={[styles.note, { color: note.color }]}>{note.text}</Text>}

              {ins && (ins.tendencias || ins.fortalezas || ins.areasDeAtencion) && (
                <View style={styles.insightBox}>
                  <Text style={styles.insightTitle}>Análisis IA</Text>
                  {ins.tendencias && <Text style={styles.insightLine}><Text style={styles.insightLabel}>Cambio: </Text>{ins.tendencias}</Text>}
                  {ins.fortalezas && <Text style={[styles.insightLine, { color: colors.successText }]}><Text style={styles.insightLabel}>Fortaleza: </Text>{ins.fortalezas}</Text>}
                  {ins.areasDeAtencion && <Text style={[styles.insightLine, { color: colors.dangerText }]}><Text style={styles.insightLabel}>A mejorar: </Text>{ins.areasDeAtencion}</Text>}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}

function makeStyles(c) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
      paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backButton: { color: c.primary, fontWeight: '600', fontSize: 14, marginBottom: 8 },
    title: { fontSize: 20, fontWeight: '700', color: c.text },
    subtitle: { fontSize: 13, color: c.textFaint, marginTop: 2 },
    content: { padding: 16, paddingBottom: 40 },
    empty: { textAlign: 'center', color: c.textFaint, marginTop: 24 },
    errorBox: { backgroundColor: c.dangerSoft, borderRadius: 10, padding: 12 },
    errorText: { color: c.dangerText, fontSize: 13 },
    retryText: { color: c.dangerText, fontWeight: '600', fontSize: 13, marginTop: 4, textDecorationLine: 'underline' },
    metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
    metricCard: {
      flexBasis: '47%', flexGrow: 1, backgroundColor: c.surface, borderRadius: 14,
      borderWidth: 1.5, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 12,
    },
    metricValue: { fontSize: 22, fontWeight: '700', color: c.text },
    metricLabel: { fontSize: 12, color: c.textMuted, marginTop: 4 },
    metricTeam: { fontSize: 11, color: c.textFaint, marginTop: 2 },
    sparklineSection: {
      backgroundColor: c.surface, borderRadius: 14, borderWidth: 1.5, borderColor: c.border,
      padding: 14, marginBottom: 16,
    },
    sparklineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 },
    sparklineTitle: { fontSize: 10, fontWeight: '700', color: c.textFaint, textTransform: 'uppercase' },
    sparklineNav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    navText: { fontSize: 12, color: c.textMuted, fontWeight: '600' },
    navTextDisabled: { color: c.border },
    rangeText: { fontSize: 11, color: c.textFaint },
    note: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
    insightBox: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12, gap: 6 },
    insightTitle: { fontSize: 10, fontWeight: '700', color: c.textFaint, textTransform: 'uppercase', marginBottom: 4 },
    insightLine: { fontSize: 14, color: c.textSecondary, lineHeight: 20 },
    insightLabel: { color: c.textFaint },
  })
}
