// Sonido de notificación del Chat + preferencia de cuándo sonar, persistida por
// usuario en localStorage (nunca sincronizada al backend — es una preferencia de
// audio del dispositivo, no del workspace). Sin archivo de audio: genera un
// "ding" corto de dos tonos con Web Audio API para no depender de un asset.
export const CHAT_SOUND_OPTIONS = ['mentions', 'favorites', 'none']
const DEFAULT_PREF = 'mentions'

function prefKey(userId) {
  return `bliss_chat_sound_pref_${userId}`
}

export function getChatSoundPref(userId) {
  if (!userId) return DEFAULT_PREF
  try {
    const v = localStorage.getItem(prefKey(userId))
    return CHAT_SOUND_OPTIONS.includes(v) ? v : DEFAULT_PREF
  } catch {
    return DEFAULT_PREF
  }
}

export function setChatSoundPref(userId, value) {
  if (!userId || !CHAT_SOUND_OPTIONS.includes(value)) return
  try {
    localStorage.setItem(prefKey(userId), value)
  } catch {
    // ignorar (private browsing / storage lleno)
  }
}

let audioCtx = null
function getAudioContext() {
  if (typeof window === 'undefined') return null
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  if (!audioCtx) audioCtx = new Ctx()
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
  return audioCtx
}

export function playChatNotificationSound() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime
    // Dos notas ascendentes cortas (estilo "ding-dong" sutil).
    ;[[880, 0], [1108, 0.09]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, now + delay)
      gain.gain.linearRampToValueAtTime(0.18, now + delay + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.16)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + delay)
      osc.stop(now + delay + 0.18)
    })
  } catch {
    // ignorar: autoplay bloqueado por el navegador / API no disponible
  }
}
