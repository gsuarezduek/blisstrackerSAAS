import { fmtNum } from './seoHelpers'

// ─── Barra de dispositivos ────────────────────────────────────────────────────
// Acepta tanto el array de GSC live [ {device, clicks} ]
// como el objeto de snapshot { DESKTOP:{clicks}, MOBILE:{clicks} }
export default function DeviceBar({ devices }) {
  if (!devices) return null

  let entries = []
  if (Array.isArray(devices)) {
    entries = devices.map(d => [d.device, { clicks: d.clicks }])
  } else {
    entries = Object.entries(devices)
  }
  if (!entries.length) return null

  const total = entries.reduce((s, [, v]) => s + (v.clicks ?? 0), 0) || 1
  const COLORS = { DESKTOP: 'bg-primary-500', MOBILE: 'bg-blue-500', TABLET: 'bg-purple-400' }
  const LABELS = { DESKTOP: 'Desktop', MOBILE: 'Mobile', TABLET: 'Tablet' }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Dispositivos</h3>
      <div className="flex rounded-full overflow-hidden h-3 mb-3">
        {entries.map(([device, v]) => (
          <div key={device}
            className={`${COLORS[device] ?? 'bg-gray-300'} transition-all`}
            style={{ width: `${((v.clicks ?? 0) / total) * 100}%` }}
            title={`${LABELS[device] ?? device}: ${fmtNum(v.clicks)} clicks`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {entries.map(([device, v]) => (
          <div key={device} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <span className={`w-2.5 h-2.5 rounded-full inline-block ${COLORS[device] ?? 'bg-gray-300'}`} />
            {LABELS[device] ?? device}
            <span className="font-medium text-gray-800 dark:text-gray-200">{fmtNum(v.clicks)}</span>
            <span className="text-gray-400">({(((v.clicks ?? 0) / total) * 100).toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}
