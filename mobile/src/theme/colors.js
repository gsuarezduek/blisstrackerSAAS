// Tokens semánticos de color — reemplazan los hex hardcodeados que se
// repetían a mano en cada `StyleSheet.create`. Los valores dark siguen la
// paleta gray-900/800/700/100 de Tailwind (mismos `dark:` que ya usa la web),
// para que ambas apps se sientan coherentes. `primary` (naranja de marca) y
// `white` se mantienen idénticos en los dos modos a propósito.
export const light = {
  bg: '#f9fafb',
  surface: '#ffffff',
  surfaceAlt: '#f3f4f6',
  border: '#e5e7eb',
  borderLight: '#f0f0f0',

  text: '#1a1a1a',
  textSecondary: '#374151',
  textMuted: '#6b7280',
  textFaint: '#9ca3af',
  placeholder: '#9ca3af',

  primary: '#F7931A',
  primarySoft: '#fef3e2',
  primarySoftText: '#c2670a',
  white: '#ffffff',

  success: '#16a34a',
  successSoft: '#dcfce7',
  successText: '#15803d',
  star: '#22c55e',
  starPaused: '#eab308',
  starUrgent: '#ef4444',

  warning: '#eab308',

  danger: '#dc2626',
  dangerSoft: '#fee2e2',
  dangerText: '#b91c1c',
  dangerBorder: '#fca5a5',

  info: '#4338ca',
  infoSoft: '#eef2ff',
  infoBorder: '#c7d2fe',

  accent: '#7e22ce',
  accentSoft: '#f3e8ff',

  overlay: 'rgba(0,0,0,0.4)',
  shadow: '#000000',
}

export const dark = {
  bg: '#0f1420',
  surface: '#1a2130',
  surfaceAlt: '#242c3d',
  border: '#333e54',
  borderLight: '#242c3d',

  text: '#f3f4f6',
  textSecondary: '#d1d5db',
  textMuted: '#9ca3af',
  textFaint: '#6b7280',
  placeholder: '#6b7280',

  primary: '#F7931A',
  primarySoft: 'rgba(247,147,26,0.18)',
  primarySoftText: '#fbbf6a',
  white: '#ffffff',

  success: '#4ade80',
  successSoft: 'rgba(34,197,94,0.18)',
  successText: '#4ade80',
  star: '#4ade80',
  starPaused: '#facc15',
  starUrgent: '#f87171',

  warning: '#facc15',

  danger: '#f87171',
  dangerSoft: 'rgba(239,68,68,0.18)',
  dangerText: '#f87171',
  dangerBorder: 'rgba(239,68,68,0.4)',

  info: '#a5b4fc',
  infoSoft: 'rgba(99,102,241,0.18)',
  infoBorder: 'rgba(99,102,241,0.4)',

  accent: '#d8b4fe',
  accentSoft: 'rgba(168,85,247,0.18)',

  overlay: 'rgba(0,0,0,0.6)',
  shadow: '#000000',
}
