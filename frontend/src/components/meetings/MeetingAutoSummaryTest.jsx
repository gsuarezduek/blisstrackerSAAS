import { useState, useRef, useEffect } from 'react'

// Prototipo: graba audio del micrófono (reunión presencial), lo sube al finalizar
// y muestra transcripción + resumen generados por IA. No persiste nada — es
// deliberadamente aparte de las notas manuales de la reunión, para evaluar si la
// calidad del resultado sirve antes de integrarlo de verdad al modelo de datos.
const MAX_SECONDS = 5 * 60

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
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function MeetingAutoSummaryTest({ meetingId, onTranscribe }) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds]     = useState(0)
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState('')
  const [result, setResult]       = useState(null)

  const mediaRecorderRef = useRef(null)
  const chunksRef        = useRef([])
  const streamRef        = useRef(null)

  function cleanupStream() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  useEffect(() => () => cleanupStream(), [])

  // Cronómetro: tiquea mientras grabamos.
  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [recording])

  // Corta sola al llegar al tope de 5 minutos.
  useEffect(() => {
    if (recording && seconds >= MAX_SECONDS) stopRecording()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, recording])

  async function startRecording() {
    setError('')
    setResult(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickMimeType()
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = handleStop
      mediaRecorderRef.current = mr
      mr.start()
      setSeconds(0)
      setRecording(true)
    } catch {
      setError('No se pudo acceder al micrófono. Revisá los permisos del navegador.')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    cleanupStream()
    setRecording(false)
  }

  async function handleStop() {
    const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm'
    const blob = new Blob(chunksRef.current, { type: mimeType })
    if (blob.size === 0) { setError('No se grabó audio.'); return }
    setBusy(true)
    try {
      const data = await onTranscribe(meetingId, blob, `audio.${extensionFor(mimeType)}`)
      setResult(data)
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo transcribir el audio.')
    } finally {
      setBusy(false)
    }
  }

  const summary = result?.summary

  return (
    <div className="rounded-xl border border-dashed border-primary-300 dark:border-primary-700 bg-primary-50/40 dark:bg-primary-900/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary-700 dark:text-primary-300">🎙️ Resumen automático (prueba)</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
            Graba hasta 5 min de audio y genera una transcripción + resumen con IA. No se guarda — es aparte de las notas de arriba.
          </p>
        </div>
        {recording ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 text-sm font-mono font-semibold text-red-600 dark:text-red-400">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {fmt(seconds)} / {fmt(MAX_SECONDS)}
            </span>
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
            {busy ? 'Procesando…' : '● Grabar'}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      {busy && !recording && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Transcribiendo y resumiendo…</p>}

      {result && (
        <div className="mt-3 pt-3 border-t border-primary-200 dark:border-primary-800 space-y-2">
          {!summary ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">No se detectó voz en el audio.</p>
          ) : (
            <>
              {summary.resumen && <p className="text-sm text-gray-800 dark:text-gray-200">{summary.resumen}</p>}
              {summary.temas.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Temas</p>
                  <ul className="text-sm text-gray-700 dark:text-gray-300 list-disc list-inside">
                    {summary.temas.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              )}
              {summary.decisiones.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Decisiones</p>
                  <ul className="text-sm text-gray-700 dark:text-gray-300 list-disc list-inside">
                    {summary.decisiones.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              )}
              {summary.pendientes.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Pendientes</p>
                  <ul className="text-sm text-gray-700 dark:text-gray-300 list-disc list-inside">
                    {summary.pendientes.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}
          {result.transcript && (
            <details>
              <summary className="text-[11px] text-gray-400 dark:text-gray-500 cursor-pointer">Ver transcripción cruda</summary>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 whitespace-pre-wrap">{result.transcript}</p>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
