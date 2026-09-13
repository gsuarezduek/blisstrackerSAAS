// Detección de "está hablando" sobre un MediaStream de audio — 100% client-side,
// vía Web Audio API. Usado por VoiceCallContext para resaltar quién tiene el
// micrófono activo en la sala de voz (local y cada peer remoto).
let sharedAudioCtx = null
function getAudioContext() {
  if (typeof window === 'undefined') return null
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  if (!sharedAudioCtx) sharedAudioCtx = new Ctx()
  if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume().catch(() => {})
  return sharedAudioCtx
}

const SPEAKING_THRESHOLD = 0.02
const SILENCE_THRESHOLD = 0.015
const SPEAKING_HOLD_MS = 150
const SILENCE_HOLD_MS = 300

// Histéresis (umbral de entrada > umbral de salida, cada uno sostenido un rato) para
// que el indicador no parpadee con el ruido normal del micrófono. `onChange` se llama
// solo cuando el booleano efectivamente cambia, no en cada frame.
export function createSpeakingMonitor(stream, onChange) {
  const ctx = getAudioContext()
  if (!ctx || !stream?.getAudioTracks().length) return { stop() {} }

  let source, analyser
  try {
    source = ctx.createMediaStreamSource(stream)
    analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
  } catch {
    return { stop() {} }
  }

  const data = new Uint8Array(analyser.frequencyBinCount)
  let speaking = false
  let aboveSince = null
  let belowSince = null
  let rafId = null

  function tick() {
    analyser.getByteTimeDomainData(data)
    let sumSquares = 0
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128
      sumSquares += v * v
    }
    const rms = Math.sqrt(sumSquares / data.length)
    const now = performance.now()

    if (rms > SPEAKING_THRESHOLD) {
      belowSince = null
      if (!speaking) {
        if (aboveSince == null) aboveSince = now
        if (now - aboveSince > SPEAKING_HOLD_MS) { speaking = true; onChange(true) }
      }
    } else if (rms < SILENCE_THRESHOLD) {
      aboveSince = null
      if (speaking) {
        if (belowSince == null) belowSince = now
        if (now - belowSince > SILENCE_HOLD_MS) { speaking = false; onChange(false) }
      }
    }
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)

  return {
    stop() {
      cancelAnimationFrame(rafId)
      try { source.disconnect() } catch {}
      try { analyser.disconnect() } catch {}
    },
  }
}
