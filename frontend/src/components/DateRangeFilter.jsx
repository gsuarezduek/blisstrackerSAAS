function toDateStr(d) {
  return d.toLocaleDateString('en-CA') // YYYY-MM-DD using local timezone
}

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// Genera las últimas `count` opciones de mes (más reciente primero)
function getMonthOptions(count = 24) {
  const now = new Date()
  const opts = []
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() // 0-11
    opts.push({ value: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${MONTHS_ES[m]} ${y}` })
  }
  return opts
}

// Rango de un mes completo (el mes en curso se corta en hoy)
function monthRange(value) {
  const [y, m] = value.split('-').map(Number) // m: 1-12
  const first = new Date(y, m - 1, 1)
  const last = new Date(y, m, 0)
  const now = new Date()
  const isCurrent = y === now.getFullYear() && m - 1 === now.getMonth()
  return { from: toDateStr(first), to: isCurrent ? toDateStr(now) : toDateStr(last) }
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

export default function DateRangeFilter({ from, to, onFromChange, onToChange, onSearch, loading, compact = false }) {
  const allPresets = getPresets()
  // En modo compacto: solo Hoy / Esta semana / Este mes / Mes pasado (sin "Semana pasada")
  const presets = compact ? allPresets.filter(p => p.label !== 'Semana pasada') : allPresets
  const activePreset = presets.find(p => p.from === from && p.to === to)?.label ?? null
  const monthOptions = getMonthOptions()
  // El mes está "seleccionado" si el rango actual coincide exactamente con un mes completo
  const selectedMonth = monthOptions.find(o => {
    const r = monthRange(o.value)
    return r.from === from && r.to === to
  })?.value ?? ''

  function applyPreset(preset) {
    onFromChange(preset.from)
    onToChange(preset.to)
    onSearch(preset.from, preset.to)
  }

  function applyMonth(value) {
    if (!value) return
    const r = monthRange(value)
    onFromChange(r.from)
    onToChange(r.to)
    onSearch(r.from, r.to)
  }

  // Modo compacto: presets + selector de mes en una sola línea, sin calendarios.
  if (compact) {
    return (
      <div className="mb-6 flex gap-2 flex-wrap items-center">
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
        <select
          value={selectedMonth}
          onChange={e => applyMonth(e.target.value)}
          className={`text-sm px-3 py-1.5 rounded-lg font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 ${
            selectedMonth
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-primary-400'
          }`}
        >
          <option value="">Elegir mes…</option>
          {monthOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    )
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

      {/* Custom date inputs + month selector */}
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Mes</label>
          <select
            value={selectedMonth}
            onChange={e => applyMonth(e.target.value)}
            className="mt-1 block border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Elegir mes…</option>
            {monthOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="self-stretch flex items-center text-gray-300 dark:text-gray-600">|</div>
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
