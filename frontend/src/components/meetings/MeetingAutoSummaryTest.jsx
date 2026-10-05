import { useState, useRef, useEffect } from 'react'

// Resumen automático de reuniones: graba audio del micrófono, lo sube al finalizar
// y muestra transcripción + resumen generados por IA. Se guarda en la propia reunión
// (ProjectMeeting.aiTranscript/aiSummary vía onTranscribe) — deliberadamente aparte
// de las notas manuales de arriba.

// Failsafe de seguridad (no un límite de producto): corta sola si alguien se olvida
// la grabación corriendo. A 32kbps (ver audioBitsPerSecond abajo) esto pesa ~21 MB,
// bien por debajo del tope real de 25 MB de la API de Whisper.
const MAX_SECONDS = 90 * 60
const MAX_BYTES = 24 * 1024 * 1024

function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  for (const c of candidates) {
    if (window.MediaRecorder?.isTypeSupported?.(c)) return c
  }
  return ''
}

function extensionFor(mimeType) {
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'webm'
}

function fmt(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

export default function MeetingAutoSummaryTest({ meetingId, savedTranscript, savedSummary, onTranscribe }) {
  const [recording, setRecording] = useState(false)
  const [paused, setPaused]       = useState(false)
  const [seconds, setSeconds]     = useState(0)
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState('')
  const [canPause, setCanPause]   = useState(true)

  const mediaRecorderRef = useRef(null)
  const chunksRef        = useRef([])
  const streamRef        = useRef(null)

  function cleanupStream() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  useEffect(() => () => cleanupStream(), [])

  // Cronómetro: tiquea mientras grabamos y no está en pausa.
  useEffect(() => {
    if (!recording || paused) return
    const id = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [recording, paused])

  // Failsafe: corta sola si se llega al tope de seguridad.
  useEffect(() => {
    if (recording && seconds >= MAX_SECONDS) stopRecording()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, recording])

  async function startRecording() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickMimeType()
      const options = { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 }
      const mr = new MediaRecorder(stream, options)
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = handleStop
      mediaRecorderRef.current = mr
      mr.start()
      setCanPause(typeof mr.pause === 'function')
      setSeconds(0)
      setPaused(false)
      setRecording(true)
    } catch {
      setError('No se pudo acceder al micrófono. Revisá los permisos del navegador.')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    cleanupStream()
    setRecording(false)
    setPaused(false)
  }

  function togglePause() {
    const mr = mediaRecorderRef.current
    if (!mr) return
    if (paused) { mr.resume(); setPaused(false) }
    else        { mr.pause();  setPaused(true) }
  }

  async function handleStop() {
    const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm'
    const blob = new Blob(chunksRef.current, { type: mimeType })
    if (blob.size === 0) { setError('No se grabó audio.'); return }
    if (blob.size > MAX_BYTES) {
      setError('El audio quedó muy pesado para transcribir de una sola vez. Probá grabar menos tiempo.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const data = await onTranscribe(meetingId, blob, `audio.${extensionFor(mimeType)}`)
      if (!data.summary) setError('No se detectó voz en el audio.')
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo transcribir el audio.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-primary-300 dark:border-primary-700 bg-primary-50/40 dark:bg-primary-900/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary-700 dark:text-primary-300">🎙️ Resumen automático</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
            Graba audio y genera una transcripción + resumen con IA. Se guarda acá, aparte de las notas de arriba.
          </p>
        </div>
        {recording ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1.5 text-sm font-mono font-semibold ${paused ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
              <span className={`w-2 h-2 rounded-full ${paused ? 'bg-amber-500' : 'bg-red-500 animate-pulse'}`} />
              {fmt(seconds)}{paused && ' · en pausa'}
            </span>
            {canPause && (
              <button
                onClick={togglePause}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors"
              >
                {paused ? '▶ Reanudar' : '⏸ Pausar'}
              </button>
            )}
            <button
              onClick={stopRecording}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              ■ Detener
            </button>
          </div>
        ) : (
          <button
            onClick={startRecording}
            disabled={busy}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white transition-colors shrink-0"
          >
            {busy ? 'Procesando…' : savedSummary ? '● Grabar de nuevo' : '● Grabar'}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      {busy && !recording && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Transcribiendo y resumiendo…</p>}

      {savedSummary && (
        <div className="mt-3 pt-3 border-t border-primary-200 dark:border-primary-800 space-y-2">
          {savedSummary.resumen && <p className="text-sm text-gray-800 dark:text-gray-200">{savedSummary.resumen}</p>}
          {savedSummary.temas?.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Temas</p>
              <ul className="text-sm text-gray-700 dark:text-gray-300 list-disc list-inside">
                {savedSummary.temas.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}
          {savedSummary.decisiones?.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Decisiones</p>
              <ul className="text-sm text-gray-700 dark:text-gray-300 list-disc list-inside">
                {savedSummary.decisiones.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}
          {savedSummary.pendientes?.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Pendientes</p>
              <ul className="text-sm text-gray-700 dark:text-gray-300 list-disc list-inside">
                {savedSummary.pendientes.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}
          {savedTranscript && (
            <details>
              <summary className="text-[11px] text-gray-400 dark:text-gray-500 cursor-pointer">Ver transcripción cruda</summary>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 whitespace-pre-wrap">{savedTranscript}</p>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
