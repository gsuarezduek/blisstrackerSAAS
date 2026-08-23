import { useState, useEffect, useRef, useCallback } from 'react'
import DOMPurify from 'dompurify'
import api from '../../api/client'
import RichTextEditor from '../RichTextEditor'
import CollapsibleSectionHeader from './CollapsibleSectionHeader'
import { exportProposalPdf } from './proposalPdf'
import '../situation-editor.css'

const card = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5'

// Campos del resultado estructurado de la investigación IA (orden de render).
const FIELDS = [
  { key: 'description',   label: 'Descripción',          type: 'text' },
  { key: 'services',      label: 'Servicios / productos', type: 'list' },
  { key: 'market',        label: 'Mercado',              type: 'text' },
  { key: 'socialMedia',   label: 'Redes sociales',       type: 'text' },
  { key: 'website',       label: 'Sitio web',            type: 'text' },
  { key: 'seo',           label: 'SEO',                  type: 'text' },
  { key: 'ads',           label: 'Publicidad',           type: 'text' },
  { key: 'needs',         label: 'Posibles necesidades', type: 'list' },
  { key: 'opportunities', label: 'Oportunidades comerciales', type: 'list' },
]

export default function ResearchPanel({ leadId, companyName, onChanged }) {
  const [open, setOpen] = useState(false)
  const [research, setResearch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef(null)

  // Informe de diagnóstico para el cliente (a partir de la investigación), branded + PDF.
  const [genReport, setGenReport] = useState(false)
  const [reportError, setReportError] = useState('')
  const [editingReport, setEditingReport] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftHtml, setDraftHtml] = useState('')
  const [savingReport, setSavingReport] = useState(false)

  const fetchLatest = useCallback(async () => {
    const { data } = await api.get(`/ventas/leads/${leadId}/research`)
    setResearch(data)
    setLoading(false)
    return data
  }, [leadId])

  // Polling mientras la investigación corre.
  useEffect(() => {
    fetchLatest()
      .then(r => { if (r && (r.status === 'pending' || r.status === 'running')) startPolling() })
      .catch(err => { setLoading(false); setError(err.response?.data?.error || 'No se pudo cargar la investigación.') })
    return () => clearInterval(pollRef.current)
  }, [fetchLatest])

  function startPolling() {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetchLatest()
        if (!r || (r.status !== 'pending' && r.status !== 'running')) { clearInterval(pollRef.current); onChanged?.() }
      } catch (err) {
        clearInterval(pollRef.current)
        setError(err.response?.data?.error || 'Se perdió la conexión mientras se investigaba. Reintentá.')
      }
    }, 3000)
  }

  async function run() {
    setStarting(true); setError('')
    try {
      await api.post(`/ventas/leads/${leadId}/research`)
      await fetchLatest()
      startPolling()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo iniciar la investigación')
    } finally {
      setStarting(false)
    }
  }

  async function generateReport() {
    if (genReport) return
    if (research.reportHtml && !window.confirm('Ya hay un informe generado. ¿Regenerarlo con IA? Se pierden los cambios manuales.')) return
    setGenReport(true); setReportError('')
    try {
      const { data } = await api.post(`/ventas/leads/${leadId}/research/${research.id}/report`)
      setResearch(data)
      setEditingReport(false)
      onChanged?.()
    } catch (err) {
      setReportError(err.response?.data?.error || 'No se pudo generar el informe')
    } finally {
      setGenReport(false)
    }
  }

  function startEditReport() {
    setDraftTitle(research.reportTitle || 'Diagnóstico inicial')
    setDraftHtml(research.reportHtml || '')
    setEditingReport(true)
  }

  async function saveReport() {
    setSavingReport(true); setReportError('')
    try {
      const { data } = await api.patch(`/ventas/leads/${leadId}/research/${research.id}/report`, { title: draftTitle, html: draftHtml })
      setResearch(data)
      setEditingReport(false)
    } catch (err) {
      setReportError(err.response?.data?.error || 'No se pudo guardar el informe')
    } finally {
      setSavingReport(false)
    }
  }

  function downloadReportPdf() {
    exportProposalPdf(
      { createdAt: research.updatedAt, title: research.reportTitle || 'Diagnóstico inicial', content: research.reportHtml, signatureId: null },
      { companyName },
    )
  }

  const running = research && (research.status === 'pending' || research.status === 'running')
  const hasContent = !!research?.result

  return (
    <div className={card}>
      <CollapsibleSectionHeader
        title="🔎 Investigación de la empresa (IA)"
        hasContent={hasContent}
        open={open}
        onToggle={() => setOpen(o => !o)}
        extra={running ? <span className="inline-block w-2.5 h-2.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" title="Investigando…" /> : null}
      />

      {open && (
      <div className="mt-3">
      <div className="flex justify-end mb-3">
        <button onClick={run} disabled={starting || running}
          className="bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg px-3 py-1.5 text-xs font-semibold">
          {running ? 'Investigando…' : starting ? 'Iniciando…' : (research ? 'Investigar de nuevo' : 'Investigar empresa')}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : !research ? (
        <p className="text-sm text-gray-400">Todavía no se investigó esta empresa. La IA (Claude) analiza el sitio y arma un resumen comercial con posibles necesidades y oportunidades.</p>
      ) : running ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <span className="inline-block w-3 h-3 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          {research.errorMsg || 'Procesando…'}
        </p>
      ) : research.status === 'failed' ? (
        <p className="text-sm text-red-600 dark:text-red-400">Falló: {research.errorMsg || 'error desconocido'}</p>
      ) : (
        <div className="space-y-3">
          {FIELDS.map(f => {
            const v = research.result?.[f.key]
            if (v == null || (Array.isArray(v) && v.length === 0) || v === '') return null
            return (
              <div key={f.key}>
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-0.5">{f.label}</div>
                {f.type === 'list'
                  ? <ul className="list-disc list-inside text-sm text-gray-800 dark:text-gray-200 space-y-0.5">{v.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  : <p className="text-sm text-gray-800 dark:text-gray-200">{v}</p>}
              </div>
            )
          })}
          {research.createdBy && (
            <p className="text-xs text-gray-400 pt-1">Generado por {research.createdBy.name} · {new Date(research.updatedAt).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
          )}

          {/* Informe de diagnóstico para el cliente — versión branded/persuasiva de la
              investigación de arriba, pensada para captar la atención del dueño/a antes
              de mandar la propuesta. Exportable a PDF con el logo/marca del workspace. */}
          <div className="pt-3 mt-1 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">📣 Informe para el cliente</h4>
              <button onClick={generateReport} disabled={genReport}
                className="text-xs font-semibold text-primary-600 hover:underline disabled:opacity-60">
                {genReport ? 'Generando…' : research.reportHtml ? '🔄 Regenerar' : '✨ Generar con IA'}
              </button>
            </div>

            {reportError && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 mb-2">{reportError}</p>}

            {!research.reportHtml && !genReport && (
              <p className="text-xs text-gray-400">Generá un informe con un mensaje pensado para captar la atención del dueño/a del negocio — un gancho previo a la propuesta, con el logo y colores del workspace. Se arma en PDF.</p>
            )}

            {research.reportHtml && !editingReport && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-900 dark:text-white">{research.reportTitle || 'Diagnóstico inicial'}</div>
                <div className="situation-content text-sm text-gray-700 dark:text-gray-300 max-h-40 overflow-y-auto border border-gray-100 dark:border-gray-700 rounded-lg p-3"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(research.reportHtml) }} />
                <div className="flex gap-2">
                  <button onClick={downloadReportPdf} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-lg px-3 py-1.5 text-xs">🖨️ PDF</button>
                  <button onClick={startEditReport} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-lg px-3 py-1.5 text-xs">✏️ Editar</button>
                </div>
              </div>
            )}

            {editingReport && (
              <div className="space-y-2">
                <input className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" value={draftTitle} onChange={e => setDraftTitle(e.target.value)} placeholder="Título del informe" />
                <RichTextEditor defaultContent={draftHtml} onChange={setDraftHtml} minHeight={220} autoFocus={false} resizable />
                <div className="flex gap-2">
                  <button onClick={() => setEditingReport(false)} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-lg px-3 py-1.5 text-xs">Cancelar</button>
                  <button onClick={saveReport} disabled={savingReport} className="bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold rounded-lg px-3 py-1.5 text-xs">{savingReport ? 'Guardando…' : 'Guardar'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  )
}
