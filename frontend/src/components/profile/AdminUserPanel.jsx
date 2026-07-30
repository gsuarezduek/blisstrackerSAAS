import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'
import { useFeatureFlag } from '../../hooks/useFeatureFlag'
import useLegajoFields from '../../hooks/useLegajoFields'
import { fieldValue, displayValue } from '../legajo/legajoUtils'
import { Field, VacationEditModal, LoginDaysModal } from '../../pages/rrhh/legajos'
import { REQUEST_STATUS, LEAVE_TYPE_LABELS } from '../../pages/rrhh/vacaciones'
import { leaveDayCount, leaveRangeLabel } from '../../pages/rrhh/shared'
import { ModeToggle, PersonProductivityDetail } from '../admin/ProductivityTab'

// Panel de administración del perfil de usuario: unifica en un solo lugar la info que hoy
// vive dispersa en /admin/productivity, /admin/rrhh (Ingresos/Legajos) y /admin/eos → Personas.
// Solo se monta si el usuario que MIRA el perfil es admin (ver UserProfile.jsx).

const BASE_TABS = [
  { id: 'productividad', label: '📈 Productividad' },
  { id: 'ingresos', label: '🕐 Ingresos' },
  { id: 'legajo', label: '📋 Legajo' },
  { id: 'vacaciones', label: '🏖️ Vacaciones y Licencias' },
  { id: 'people', label: '🧭 People Analyzer', eosOnly: true },
  { id: 'preferencias', label: '🤖 Preferencias IA' },
]

export default function AdminUserPanel({ userId, userName }) {
  const { enabled: eosEnabled } = useFeatureFlag('eos')
  const tabs = BASE_TABS.filter(t => !t.eosOnly || eosEnabled)
  const [tab, setTab] = useState('productividad')

  const [summary, setSummary] = useState(null)
  const [detail, setDetail] = useState(null)
  const [requests, setRequests] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadSummary = useCallback(() => api.get(`/admin/rrhh/user-summary/${userId}`).then(r => setSummary(r.data)), [userId])
  const loadDetail  = useCallback(() => api.get(`/users/${userId}/admin-detail`).then(r => setDetail(r.data)), [userId])

  useEffect(() => {
    setLoading(true)
    setTab('productividad')
    Promise.all([
      loadSummary(),
      loadDetail(),
      api.get('/vacation/admin/requests', { params: { userId } }).then(r => setRequests(r.data)),
    ]).finally(() => setLoading(false))
  }, [userId, loadSummary, loadDetail])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 pt-4">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">🔒 Panel de administración</p>
      </div>
      <div className="flex gap-1 px-3 pt-3 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              tab === t.id
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-5 border-t border-gray-100 dark:border-gray-700 mt-3">
        {loading ? (
          <LoadingSpinner className="py-10" />
        ) : (
          <>
            {tab === 'productividad' && <ProductividadSection userId={userId} />}
            {tab === 'ingresos' && <IngresosSection userId={userId} userName={userName} summary={summary} onChanged={loadSummary} />}
            {tab === 'legajo' && <LegajoSection detail={detail} />}
            {tab === 'vacaciones' && (
              <VacacionesSection userId={userId} userName={userName} detail={detail} requests={requests} onDetailChanged={loadDetail} />
            )}
            {tab === 'people' && eosEnabled && <PeopleAnalyzerSection userId={userId} />}
            {tab === 'preferencias' && <PreferenciasSection detail={detail} />}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Productividad ────────────────────────────────────────────────────────────

function ProductividadSection({ userId }) {
  const [mode, setMode] = useState('current')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/admin/productivity/users/${userId}/overview`, { params: { mode } })
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [userId, mode])

  useEffect(() => { load() }, [load])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await api.post(`/admin/productivity/${userId}/refresh`)
      await load()
    } finally { setRefreshing(false) }
  }

  if (loading) return <LoadingSpinner className="py-10" />
  if (!data) return <p className="text-sm text-gray-400 py-8 text-center">No se pudo cargar la productividad.</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <ModeToggle mode={mode} onChange={setMode} />
        {!data.member.stats.hasData && (
          <span className="text-xs text-gray-400 dark:text-gray-500">Sin actividad en este período.</span>
        )}
      </div>
      <PersonProductivityDetail m={data.member} benchmark={data.benchmark} mode={mode} onRefresh={handleRefresh} refreshing={refreshing} />
    </div>
  )
}

// ─── Ingresos ─────────────────────────────────────────────────────────────────

function IngresosSection({ userId, userName, summary, onChanged }) {
  const [showDays, setShowDays] = useState(false)
  if (!summary) return <p className="text-sm text-gray-400 py-8 text-center">Sin datos de ingresos.</p>

  const hasDays = summary.loginDays?.length > 0
  const p = summary.punctuality

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Horario promedio de ingreso</p>
          {summary.avgLoginTime ? (
            <>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.avgLoginTime}</p>
              {p ? (
                <>
                  <p className={`text-xs font-medium mt-0.5 ${p.avgLateMins > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    Esperado {p.expectedStart}{p.toleranceMins > 0 ? ` (+${p.toleranceMins} min tol.)` : ''} · {p.avgLateMins > 0 ? `+${p.avgLateMins} min promedio` : 'a horario'}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {p.onTimeDays}/{p.daysCount} día{p.daysCount !== 1 ? 's' : ''} puntual ({p.punctualityPct}%)
                  </p>
                </>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">sobre {summary.loginCount} ingreso{summary.loginCount !== 1 ? 's' : ''}</p>
              )}
            </>
          ) : <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Sin registros</p>}
        </div>
        {hasDays && (
          <button
            onClick={() => setShowDays(true)}
            className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex-shrink-0"
          >
            Ver desglose por día →
          </button>
        )}
      </div>

      {showDays && (
        <LoginDaysModal user={{ id: userId, name: userName }} summary={summary} onChanged={onChanged} onClose={() => setShowDays(false)} />
      )}
    </div>
  )
}

// ─── Legajo ───────────────────────────────────────────────────────────────────

function LegajoSection({ detail }) {
  const { fields } = useLegajoFields()
  if (!detail) return <p className="text-sm text-gray-400 py-8 text-center">Sin datos.</p>

  const rows = fields
    .filter(f => f.enabled !== false)
    .sort((a, b) => a.order - b.order)
    .map(f => ({ key: f.key, label: f.label, value: displayValue(f, fieldValue(detail, f)) }))
    .filter(r => r.value !== null && r.value !== undefined && r.value !== '')

  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">Esta persona aún no completó sus datos personales.</p>
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
      {rows.map(r => <Field key={r.key} label={r.label} value={r.value} />)}
    </div>
  )
}

// ─── Vacaciones y Licencias ───────────────────────────────────────────────────

function VacacionesSection({ userId, userName, detail, requests, onDetailChanged }) {
  const [vacModalOpen, setVacModalOpen] = useState(false)
  if (!detail) return <p className="text-sm text-gray-400 py-8 text-center">Sin datos.</p>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-900/30 rounded-xl p-4">
        <div>
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Días de vacaciones pendientes</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{detail.vacationDays ?? 0}</p>
        </div>
        <button
          onClick={() => setVacModalOpen(true)}
          className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex-shrink-0"
        >
          Editar días
        </button>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
          Historial de solicitudes {requests?.length > 0 && `(${requests.length})`}
        </p>
        {!requests || requests.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Sin solicitudes registradas.</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {requests.map(r => {
              const meta = REQUEST_STATUS[r.status]
              const days = leaveDayCount(r.startDate, r.endDate)
              return (
                <div key={r.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{LEAVE_TYPE_LABELS[r.type] ?? r.type}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{leaveRangeLabel(r.startDate, r.endDate)} · {days} día{days !== 1 ? 's' : ''}</p>
                    {r.reviewNote && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 italic mt-0.5">
                        "{r.reviewNote}"{r.reviewedBy && ` — ${r.reviewedBy.name}`}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${meta?.color ?? ''}`}>{meta?.label ?? r.status}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {vacModalOpen && (
        <VacationEditModal
          user={{ id: userId, name: userName, vacationDays: detail.vacationDays }}
          onClose={() => setVacModalOpen(false)}
          onUpdated={onDetailChanged}
        />
      )}
    </div>
  )
}

// ─── People Analyzer + Strikes (EOS) ──────────────────────────────────────────

const RATING_LABEL = { '+': '+', '+/-': '+/-', '-': '−' }
const RATING_COLOR = {
  '+':   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border-green-200 dark:border-green-800',
  '+/-': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  '-':   'bg-red-100   text-red-700   dark:bg-red-900/40   dark:text-red-400   border-red-200   dark:border-red-800',
}
const GWC_COLUMNS = [
  { key: 'gwc_get',      label: '¿Lo entiende? (Get it)' },
  { key: 'gwc_want',     label: '¿Lo quiere? (Want it)' },
  { key: 'gwc_capacity', label: '¿Tiene capacidad? (Capacity)' },
]

function PeopleAnalyzerSection({ userId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get('/eos/personas').then(r => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false))
  }, [userId])

  if (loading) return <LoadingSpinner className="py-10" />
  if (!data) return <p className="text-sm text-gray-400 py-8 text-center">No se pudo cargar.</p>

  const ratings = data.ratingsMap?.[userId] || {}
  const strikes = data.strikesMap?.[userId] || []
  const columns = [...(data.coreValues || []).map(cv => ({ key: cv.name, label: cv.name })), ...GWC_COLUMNS]

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">People Analyzer</p>
        <div className="space-y-2">
          {columns.map(col => {
            const r = ratings[col.key]
            return (
              <div key={col.key} className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-700 dark:text-gray-300">{col.label}</span>
                <span className={`inline-flex items-center justify-center w-10 h-7 rounded-lg text-xs font-semibold border flex-shrink-0 ${
                  r ? RATING_COLOR[r] : 'bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-600 border-gray-200 dark:border-gray-700'
                }`}>
                  {r ? RATING_LABEL[r] : '·'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
          Faltas (strikes){strikes.length > 0 && ` — ${strikes.length}/3`}
        </p>
        {strikes.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Sin faltas registradas.</p>
        ) : (
          <div className="space-y-2">
            {strikes.map(s => (
              <div key={s.id} className="text-sm bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg px-3 py-2">
                <p className="text-red-700 dark:text-red-400 font-medium">Falta #{s.strikeNumber}</p>
                <p className="text-gray-600 dark:text-gray-300 mt-0.5">{s.reason}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {new Date(s.createdAt).toLocaleDateString('es-AR')}{s.createdBy && ` · por ${s.createdBy.name}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Preferencias de IA (solo lectura) ─────────────────────────────────────────

const PREF_ITEMS = [
  { key: 'dailyInsightEnabled', label: 'Insight diario', desc: 'Análisis de tareas y sugerencias todos los días' },
  { key: 'weeklyEmailEnabled', label: 'Resumen semanal', desc: 'Email de productividad los viernes' },
  { key: 'insightMemoryEnabled', label: 'Memoria de aprendizaje', desc: 'Perfil semanal de tendencias y fortalezas' },
  { key: 'taskQualityEnabled', label: 'Coaching GTD', desc: 'Sugerencias sobre la calidad de sus tareas' },
]

function PreferenciasSection({ detail }) {
  if (!detail) return <p className="text-sm text-gray-400 py-8 text-center">Sin datos.</p>
  return (
    <div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {PREF_ITEMS.map(p => {
          const on = detail[p.key] !== false
          return (
            <div key={p.key} className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{p.label}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{p.desc}</p>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${
                on
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
              }`}>
                {on ? 'Activado' : 'Desactivado'}
              </span>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 pt-3">Solo lectura — cada persona edita sus propias preferencias desde Preferencias → Personales.</p>
    </div>
  )
}
