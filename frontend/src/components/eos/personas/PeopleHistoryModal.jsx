import { useState, useEffect } from 'react'
import api from '../../../api/client'
import PeopleAnalyzer from './PeopleAnalyzer'
import { Inbox } from 'lucide-react'
import { Icon } from '../../ui/Icon'

// ─── Historial mensual del People Score ───────────────────────────────────────
// Snapshot automático: cada visita al tab actualiza la captura del mes en curso, así se
// construye el historial con el uso; un cron congela el mes cerrado si nadie lo visitó.

function scoreBarColor(score) {
  if (score == null) return 'bg-gray-300 dark:bg-gray-600'
  if (score >= 80) return 'bg-green-500'
  if (score >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}

function PeopleHistoryList({ snapshots, year, years, onYearChange, onSelectMonth, loading }) {
  const withData = snapshots.filter(s => s.score != null)
  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Evolución mensual del People Score · {year ? `año ${year}` : 'últimos 12 meses'}
        </p>
        {years.length > 1 && (
          <select value={year ?? ''} onChange={e => onYearChange(e.target.value ? Number(e.target.value) : null)}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">Últimos 12 meses</option>
            {years.slice().reverse().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : withData.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="mb-2"><Icon as={Inbox} size={28} className="inline-block text-gray-300 dark:text-gray-600" /></p>
          <p className="text-sm font-medium">Todavía no hay historial</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Se guarda una captura automática cada mes.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {snapshots.map(s => (
            <button key={s.month} disabled={s.score == null} onClick={() => onSelectMonth(s.month)}
              className={`w-full flex items-center gap-3 text-left px-1.5 py-1.5 rounded-lg transition-colors ${
                s.score != null ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer' : 'cursor-default'
              }`}>
              <span className="text-xs text-gray-500 dark:text-gray-400 w-24 flex-shrink-0 capitalize">{s.label}</span>
              <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 min-w-0">
                {s.score != null && (
                  <div className={`h-2.5 rounded-full transition-all ${scoreBarColor(s.score)}`} style={{ width: `${Math.max(4, s.score)}%` }} />
                )}
              </div>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 tabular-nums w-14 text-right flex-shrink-0">
                {s.score != null ? `${s.score}%` : '—'}
              </span>
              <span className="text-[11px] text-gray-400 dark:text-gray-500 w-16 text-right flex-shrink-0 hidden sm:block">
                {s.total != null ? `${s.rightPeople}/${s.total} ok` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PeopleHistoryModal({ onClose }) {
  const [data,          setData]          = useState(null)
  const [loading,        setLoading]      = useState(true)
  const [year,           setYear]         = useState(null) // null = últimos 12 meses
  const [detailMonth,    setDetailMonth]  = useState(null)
  const [detail,         setDetail]       = useState(null)
  const [detailLoading,  setDetailLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (year) params.set('year', year)
    api.get(`/eos/personas/history?${params}`)
      .then(res => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [year])

  function selectMonth(month) {
    setDetailMonth(month)
    setDetail(null)
    setDetailLoading(true)
    api.get(`/eos/personas/history/${month}`)
      .then(res => setDetail(res.data))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false))
  }

  const snapshots = data?.snapshots ?? []
  const years      = data?.availableYears ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
          {detailMonth ? (
            <button onClick={() => setDetailMonth(null)} className="flex items-center gap-1.5 text-base font-semibold text-gray-900 dark:text-white hover:underline">
              ← Historial del People Score
            </button>
          ) : (
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Historial del People Score</h2>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto px-6 py-5">
          {!detailMonth ? (
            <PeopleHistoryList
              snapshots={snapshots} year={year} years={years}
              onYearChange={setYear} onSelectMonth={selectMonth} loading={loading}
            />
          ) : detailLoading || !detail ? (
            <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 capitalize">
                Captura de {detail.label} · solo lectura
              </p>
              <PeopleAnalyzer
                members={detail.members} coreValues={detail.coreValues} ratingsMap={detail.ratingsMap}
                readOnly
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
