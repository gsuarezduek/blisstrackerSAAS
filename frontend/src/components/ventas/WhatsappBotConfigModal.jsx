import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'

const TABS = [
  { id: 'personalidad', label: 'Personalidad' },
  { id: 'seguridad',    label: '🛡️ Reglas de seguridad' },
  { id: 'ejemplos',     label: '💬 Ejemplos' },
  { id: 'documentos',   label: '📄 Documentos' },
  { id: 'calidad',      label: '📊 Calidad' },
  { id: 'probar',       label: '🧪 Probar' },
]

function fmtBytes(n) {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDateTime(d) {
  return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const TRIGGER_LABEL = {
  confidence: 'Baja confianza del bot',
  escalation_word: 'Palabra del cliente',
  blocked_word: 'Palabra prohibida persistente',
}

// Input de "chips" de texto libre: escribir + Enter/botón agrega, click en la
// pill (o su ×) la saca. Estado local, no persiste hasta "Guardar" — mismo
// criterio que el resto del formulario (enabled/prompt).
function WordChipsInput({ words, onChange, placeholder }) {
  const [draft, setDraft] = useState('')

  function add() {
    const v = draft.trim()
    if (!v || words.includes(v)) { setDraft(''); return }
    onChange([...words, v])
    setDraft('')
  }
  function remove(idx) {
    onChange(words.filter((_, i) => i !== idx))
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={placeholder}
          className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button type="button" onClick={add} className="px-3 py-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg">
          Agregar
        </button>
      </div>
      {words.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {words.map((w, i) => (
            <span key={`${w}-${i}`} className="group inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-full px-2.5 py-1 text-xs">
              {w}
              <button type="button" onClick={() => remove(i)} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400">✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// Editor de ejemplos few-shot: pares pregunta/respuesta, agregar con los dos
// campos completos, cada par mostrado con botón eliminar. Mismo criterio de
// estado local (no persiste hasta "Guardar") que WordChipsInput.
function ExamplesEditor({ examples, onChange }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')

  function add() {
    const q = question.trim(), a = answer.trim()
    if (!q || !a) return
    onChange([...examples, { question: q, answer: a }])
    setQuestion(''); setAnswer('')
  }
  function remove(idx) {
    onChange(examples.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Pares de pregunta/respuesta ideal para guiar el estilo y la precisión del bot — no son respuestas fijas que copia
        textual, le muestran cómo responder casos parecidos.
      </p>
      <div className="space-y-2 bg-gray-50 dark:bg-gray-900/30 rounded-xl p-3">
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Pregunta del cliente, ej. ¿Cuánto sale el plan básico?"
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <textarea
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          placeholder="Respuesta ideal…"
          rows={2}
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
        />
        <div className="flex justify-end">
          <button type="button" onClick={add} disabled={!question.trim() || !answer.trim()} className="px-3 py-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 disabled:opacity-40 rounded-lg">
            + Agregar ejemplo
          </button>
        </div>
      </div>

      {examples.length === 0 ? (
        <p className="text-sm text-gray-400">Todavía no hay ejemplos cargados.</p>
      ) : (
        <div className="space-y-2">
          {examples.map((ex, i) => (
            <div key={i} className="flex items-start justify-between gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-gray-500 dark:text-gray-400">Cliente: {ex.question}</p>
                <p className="text-gray-800 dark:text-gray-100">→ {ex.answer}</p>
              </div>
              <button type="button" onClick={() => remove(i)} className="text-xs font-medium text-red-500 hover:text-red-600 shrink-0">Eliminar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DocumentsPanel({ documents, loading, uploading, error, onUpload, onDelete }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        PDF, DOCX o TXT que el bot usa como contexto (manual de servicios, FAQ, políticas…). El texto se extrae una sola vez al
        subir y se agrega a cada respuesta del bot — cuanto más grande, más tokens de IA consume cada mensaje.
      </p>

      <label className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl cursor-pointer disabled:opacity-50">
        {uploading ? 'Subiendo…' : '+ Subir documento'}
        <input type="file" accept=".pdf,.docx,.txt" className="hidden" disabled={uploading} onChange={onUpload} />
      </label>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-gray-400">Todavía no hay documentos cargados.</p>
      ) : (
        <div className="space-y-2">
          {documents.map(d => (
            <div key={d.id} className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{d.fileName}</span>
                  {d.status === 'processing' && <span className="text-xs text-amber-500">procesando…</span>}
                  {d.status === 'error' && <span className="text-xs text-red-500" title={d.errorMsg}>error</span>}
                  {d.summarized && <span className="text-xs text-primary-500" title="Se usó IA para resumirlo conservando lo más útil, en vez de cortarlo a lo bruto">resumido con IA</span>}
                  {d.truncated && <span className="text-xs text-amber-500" title="El texto se recortó por tamaño">recortado</span>}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500">
                  {fmtBytes(d.sizeBytes)} · {d.charCount.toLocaleString('es-AR')} caracteres extraídos
                </div>
              </div>
              <button onClick={() => onDelete(d.id)} className="text-xs font-medium text-red-500 hover:text-red-600 shrink-0">Eliminar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Panel de calidad: últimos casos donde el bot pasó a un humano — revisar
// patrones reales para ajustar prompt/reglas en vez de a ciegas.
function QualityPanel({ escalations, loading }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Últimas conversaciones donde el bot pasó a un humano (baja confianza, palabra del cliente, o palabra prohibida
        persistente) — revisá los casos reales para ajustar el prompt o las reglas de seguridad.
      </p>
      {loading ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : escalations.length === 0 ? (
        <p className="text-sm text-gray-400">Todavía no hubo ningún caso escalado.</p>
      ) : (
        <div className="space-y-2">
          {escalations.map(e => (
            <div key={e.id} className="bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                  {e.conversation?.contactName || e.conversation?.phoneE164 || 'Contacto desconocido'}
                </span>
                <span className="text-xs text-gray-400 shrink-0">{fmtDateTime(e.createdAt)}</span>
              </div>
              <span className="inline-block text-[11px] font-semibold text-amber-600 dark:text-amber-400 mb-1">
                {TRIGGER_LABEL[e.trigger] || e.trigger}
              </span>
              {e.reason && <p className="text-xs text-gray-500 dark:text-gray-400">{e.reason}</p>}
              {e.clientMessage && <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 italic">"{e.clientMessage}"</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TestPanel({ messages, input, setInput, loading, error, onSend }) {
  return (
    <div className="flex flex-col h-full">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        Probá el bot con la configuración actual del formulario (aunque no la hayas guardado todavía) — no se manda nada por
        WhatsApp real ni se guarda en ninguna conversación.
      </p>
      <div className="flex-1 min-h-[240px] overflow-y-auto space-y-2 bg-gray-50 dark:bg-gray-900/30 rounded-xl p-3 mb-3">
        {messages.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Escribí como si fueras el cliente para empezar.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'cliente' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.role === 'cliente' ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100' : 'bg-primary-600 text-white'}`}>
              {m.text}
              {m.escalate && (
                <div className="mt-1 text-[11px] font-semibold text-amber-200" title={m.escalateReason}>🚩 Esto pasaría a un humano</div>
              )}
            </div>
          </div>
        ))}
        {loading && <p className="text-xs text-gray-400 text-center">El bot está pensando…</p>}
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</p>}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !loading) { e.preventDefault(); onSend() } }}
          placeholder="Escribí un mensaje de prueba…"
          className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button type="button" onClick={onSend} disabled={loading || !input.trim()} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg">
          Enviar
        </button>
      </div>
    </div>
  )
}

// Config del bot de WhatsApp del workspace — solo admin/owner (ver
// whatsapp.routes.js): interruptor maestro + prompt + reglas de seguridad
// (palabras bloqueadas/de escalamiento) + base de conocimiento (documentos) +
// modo de prueba, todo en un mismo modal con pestañas.
export default function WhatsappBotConfigModal({ config, onClose, onSaved }) {
  const [tab, setTab] = useState('personalidad')
  const [enabled, setEnabled] = useState(Boolean(config?.enabled))
  const [onlyNewConversations, setOnlyNewConversations] = useState(Boolean(config?.onlyNewConversations))
  const [prompt, setPrompt] = useState(config?.prompt || '')
  const [blockedWords, setBlockedWords] = useState(config?.blockedWords || [])
  const [escalationWords, setEscalationWords] = useState(config?.escalationWords || [])
  const [examples, setExamples] = useState(config?.examples || [])
  const [handoffMessage, setHandoffMessage] = useState(config?.handoffMessage || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [documents, setDocuments] = useState([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [docError, setDocError] = useState(null)

  const [escalations, setEscalations] = useState([])
  const [escalationsLoading, setEscalationsLoading] = useState(true)

  const [testMessages, setTestMessages] = useState([])
  const [testInput, setTestInput] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [testError, setTestError] = useState(null)

  const loadDocuments = useCallback(async () => {
    setDocsLoading(true)
    try {
      const { data } = await api.get('/whatsapp/bot/documents')
      setDocuments(data)
    } catch {
      // silencioso — la pestaña de documentos igual muestra "no hay documentos"
    } finally {
      setDocsLoading(false)
    }
  }, [])

  useEffect(() => { loadDocuments() }, [loadDocuments])

  useEffect(() => {
    api.get('/whatsapp/bot/escalations')
      .then(({ data }) => setEscalations(data))
      .catch(() => {}) // silencioso — la pestaña igual muestra "no hubo casos"
      .finally(() => setEscalationsLoading(false))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const { data } = await api.put('/whatsapp/bot', { enabled, onlyNewConversations, prompt, blockedWords, escalationWords, examples, handoffMessage })
      onSaved(data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo después
    if (!file) return
    setUploadingDoc(true)
    setDocError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await api.post('/whatsapp/bot/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      await loadDocuments()
    } catch (err) {
      setDocError(err.response?.data?.error || 'No se pudo subir el documento')
    } finally {
      setUploadingDoc(false)
    }
  }

  async function handleDeleteDoc(id) {
    await api.delete(`/whatsapp/bot/documents/${id}`)
    await loadDocuments()
  }

  async function handleTestSend() {
    const text = testInput.trim()
    if (!text) return
    const nextMessages = [...testMessages, { role: 'cliente', text }]
    setTestMessages(nextMessages)
    setTestInput('')
    setTestLoading(true)
    setTestError(null)
    try {
      const { data } = await api.post('/whatsapp/bot/test', {
        config: { prompt, blockedWords, escalationWords, examples, handoffMessage },
        messages: nextMessages,
      })
      setTestMessages(msgs => [...msgs, { role: 'bot', text: data.replyText, escalate: data.escalate, escalateReason: data.escalateReason }])
    } catch (err) {
      setTestError(err.response?.data?.error || 'No se pudo generar una respuesta de prueba')
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-0 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">🤖 Bot de WhatsApp</h2>
            <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">✕</button>
          </div>
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="w-4 h-4 rounded" />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Bot activo</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer mb-3">
            <input type="checkbox" checked={onlyNewConversations} onChange={e => setOnlyNewConversations(e.target.checked)} className="w-4 h-4 rounded" />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Solo en conversaciones nuevas
              <span className="block text-xs text-gray-400 dark:text-gray-500 font-normal">
                El bot sigue respondiendo todas las veces que haga falta mientras nadie del equipo intervino; en cuanto alguien del equipo contesta a mano, deja de responder solo en esa conversación.
              </span>
            </span>
          </label>

          <div className="flex gap-1 -mb-px overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 text-sm font-medium rounded-t-lg border-b-2 whitespace-nowrap transition-colors ${
                  tab === t.id
                    ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {tab === 'personalidad' && (
            <div className="flex flex-col h-full">
              <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Personalidad / instrucciones</span>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Sos un asistente comercial que responde por WhatsApp en nombre del equipo. Respondé de forma breve, cordial y directa…"
                className="w-full flex-1 min-h-[300px] px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-y font-mono"
              />
              <span className="block text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                Vacío = usa un texto genérico por defecto. Los servicios activos del catálogo (Admin → Servicios) se agregan
                solos al contexto — no hace falta listarlos acá. El bot no inventa respuestas de las que no está seguro: cuando
                no sabe algo, avisa que en un momento lo contacta el equipo (ver pestaña Probar).
              </span>
            </div>
          )}

          {tab === 'seguridad' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Palabras prohibidas en la respuesta</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">El bot nunca debe usar estas palabras/frases al responder — si las genera igual, se reintenta una vez y si sigue fallando, pasa la conversación a un humano.</p>
                <WordChipsInput words={blockedWords} onChange={setBlockedWords} placeholder="Ej. garantizado, el mejor del mercado…" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Palabras que pasan la charla a un humano</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Si el cliente escribe alguna de estas, el bot no responde: avisa con el mensaje de abajo y un humano toma la conversación.</p>
                <WordChipsInput words={escalationWords} onChange={setEscalationWords} placeholder="Ej. cancelar, reembolso, hablar con una persona…" />
              </div>
              <div>
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Aviso al pasar a un humano</span>
                <input
                  value={handoffMessage}
                  onChange={e => setHandoffMessage(e.target.value)}
                  placeholder="Ya te va a estar contactando alguien de nuestro equipo 👋"
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          )}

          {tab === 'ejemplos' && (
            <ExamplesEditor examples={examples} onChange={setExamples} />
          )}

          {tab === 'documentos' && (
            <DocumentsPanel documents={documents} loading={docsLoading} uploading={uploadingDoc} error={docError} onUpload={handleUpload} onDelete={handleDeleteDoc} />
          )}

          {tab === 'calidad' && (
            <QualityPanel escalations={escalations} loading={escalationsLoading} />
          )}

          {tab === 'probar' && (
            <TestPanel messages={testMessages} input={testInput} setInput={setTestInput} loading={testLoading} error={testError} onSend={handleTestSend} />
          )}
        </div>

        <div className="px-6 pb-6 pt-3 border-t border-gray-100 dark:border-gray-700 shrink-0">
          {error && <p className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-xl">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
