function toDateStr(d) {
  return d.toLocaleDateString('en-CA') // YYYY-MM-DD using local timezone
}

function getPresets() {
  const now = new Date()
  const todayStr = toDateStr(now)

  // This week: Monday → today
  const dayOfWeek = now.getDay() || 7 // 1=Mon … 7=Sun
  const monday = new Date(now)
  monday.setDate(now.getDate() - dayOfWeek + 1)
  monday.setHours(0, 0, 0, 0)

  // Last week: last Monday → last Sunday
  const lastMonday = new Date(monday)
  lastMonday.setDate(monday.getDate() - 7)
  const lastSunday = new Date(monday)
  lastSunday.setDate(monday.getDate() - 1)

  // This month: 1st → today
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  // Last month: 1st → last day
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

  return [
    { label: 'Hoy',             from: todayStr,                   to: todayStr },
    { label: 'Esta semana',     from: toDateStr(monday),          to: todayStr },
    { label: 'Semana pasada',   from: toDateStr(lastMonday),      to: toDateStr(lastSunday) },
    { label: 'Este mes',        from: toDateStr(firstOfMonth),    to: todayStr },
    { label: 'Mes pasado',      from: toDateStr(firstOfLastMonth),to: toDateStr(lastOfLastMonth) },
  ]
}

export default function DateRangeFilter({ from, to, onFromChange, onToChange, onSearch, loading }) {
  const presets = getPresets()
  const activePreset = presets.find(p => p.from === from && p.to === to)?.label ?? null

  function applyPreset(preset) {
    onFromChange(preset.from)
    onToChange(preset.to)
    onSearch(preset.from, preset.to)
  }

  return (
    <div className="mb-6 space-y-3">
      {/* Preset links */}
      <div className="flex gap-2 flex-wrap">
        {presets.map(p => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activePreset === p.label
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 dark:hover:text-gray-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date inputs */}
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Desde</label>
          <input
            type="date"
            value={from}
            onChange={e => onFromChange(e.target.value)}
            className="mt-1 block border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Hasta</label>
          <input
            type="date"
            value={to}
            onChange={e => onToChange(e.target.value)}
            className="mt-1 block border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <button
          onClick={() => onSearch(from, to)}
          disabled={loading}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        >
          {loading ? 'Cargando...' : 'Ver reporte'}
        </button>
      </div>
    </div>
  )
}
