import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import ReportViewer from '../components/marketing/ReportViewer'
import { twemojify } from '../utils/twemoji'

const API = import.meta.env.VITE_API_URL || ''

// Vista de impresión del informe — SOLO la abre el render de PDF del backend
// (Chromium headless, con un token de impresión de vida corta). No es una página
// para personas: sin navegación ni controles, formato A4 vertical con portada.
//
// Protocolo con el renderer (services/pdfRenderer.service.js): cuando todo está
// cargado (datos + imágenes + fuentes) setea window.__REPORT_PRINT_READY__ = true;
// si algo falla, window.__REPORT_PRINT_READY___ERROR con el motivo.
const READY_FLAG = '__REPORT_PRINT_READY__'

// CSS content:"…" — escapa comillas y barras para meter texto dinámico en un margin box
const cssStr = (v) => `"${String(v ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`

function waitForImages(timeoutMs = 15000) {
  const imgs = Array.from(document.images)
  const pending = imgs.filter(img => !img.complete).map(img => new Promise(resolve => {
    img.addEventListener('load', resolve, { once: true })
    img.addEventListener('error', resolve, { once: true })
  }))
  return Promise.race([Promise.all(pending), new Promise(resolve => setTimeout(resolve, timeoutMs))])
}

function Cover({ data, report, workspace, portal, brandPrimary, brandSecondary }) {
  const [bannerOk, setBannerOk] = useState(true)
  const { project, dataMonth, month, period } = data
  const agencyName  = workspace?.companyName || workspace?.name || ''
  const periodTitle = report?.periodLabel || period?.label || ''
  const periodRange = period?.dataLabel || null
  const hasBanner   = !!portal?.slug && bannerOk

  return (
    <section className="print-cover">
      {hasBanner ? (
        <>
          <img
            src={`${API}/api/public/client-portal-banner/${portal.slug}`}
            alt=""
            className="print-cover-bg"
            onError={() => setBannerOk(false)}
          />
          <div className="print-cover-bg" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.82), rgba(0,0,0,.35) 55%, rgba(0,0,0,.15))' }} />
        </>
      ) : (
        <div className="print-cover-bg" style={{ background: `linear-gradient(135deg, ${brandPrimary}, ${brandSecondary})` }} />
      )}

      <div className="print-cover-body">
        <div className="print-cover-top">
          {workspace?.hasLogo && workspace?.slug ? (
            <img
              src={`${API}/api/public/logo/${workspace.slug}`}
              alt={agencyName}
              className="print-cover-logo"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : agencyName ? (
            <span className="print-cover-agency">{agencyName}</span>
          ) : <span />}
        </div>

        <div className="print-cover-title">
          <p className="print-cover-kicker">Informe de marketing</p>
          <h1>{project?.name}</h1>
          <p className="print-cover-period">{periodTitle}</p>
          {periodRange && <p className="print-cover-range">{periodRange}</p>}
          {project?.websiteUrl && (
            <p className="print-cover-site">{project.websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>
          )}
        </div>

        <div className="print-cover-foot">
          {agencyName && <span>{agencyName}</span>}
          <span>Generado el {new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>
    </section>
  )
}

export default function ReportPrint() {
  const { printToken } = useParams()
  const [payload, setPayload] = useState(null)

  useEffect(() => {
    document.documentElement.classList.remove('dark')   // el PDF siempre sale en modo claro
    document.title = 'Informe'
    axios.get(`${API}/api/public/report-print/${printToken}`)
      .then(r => setPayload(r.data))
      .catch(err => { window[`${READY_FLAG}_ERROR`] = err.response?.data?.error || err.message || 'No se pudo cargar el informe' })
  }, [printToken])

  // Avisar al renderer cuando el documento está completo
  useEffect(() => {
    if (!payload) return
    let cancelled = false
    ;(async () => {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))   // dejar que React pinte
      twemojify(document.querySelector('.report-print'))
      await Promise.all([waitForImages(), document.fonts?.ready])
      if (!cancelled) window[READY_FLAG] = true
    })()
    return () => { cancelled = true }
  }, [payload])

  if (!payload) return null

  const { data, report, workspace, portal } = payload
  const brandColors    = workspace?.brandColors || []
  const brandPrimary   = brandColors[0]?.hex || '#f97316'
  const brandSecondary = brandColors[1]?.hex || '#3b82f6'
  const agencyName     = workspace?.companyName || workspace?.name || ''
  const footerLeft     = [agencyName, `Informe de marketing · ${report?.periodLabel || ''}`].filter(Boolean).join('  ·  ')

  return (
    <div className="report-print">
      <style>{`
        @page {
          size: A4;
          margin: 16mm 14mm 20mm;
          @bottom-left  { content: ${cssStr(footerLeft)}; font: 8pt system-ui, sans-serif; color: #9ca3af; }
          @bottom-right { content: counter(page) " / " counter(pages); font: 8pt system-ui, sans-serif; color: #9ca3af; }
        }
        @page cover { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }

        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Symbols:wght@400;700&family=Noto+Sans+Symbols+2&display=swap');

        html, body { background: #fff !important; margin: 0; }
        /* Símbolos (✓ ↑ ↓ →) con fuente de respaldo: el Linux del servidor solo trae una sans básica */
        .report-print { -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #111827;
          font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Symbols', 'Noto Sans Symbols 2', sans-serif; }
        .print-emoji { display: inline-block; height: 1.1em; width: 1.1em; vertical-align: -0.18em; margin: 0 .04em; }

        /* Layout de hoja A4: una sola columna (las tarjetas de dos columnas quedan angostas y parten los números) */
        .report-print .grid[class*="sm:grid-cols-2"] { grid-template-columns: minmax(0, 1fr) !important; }
        /* Nada de tarjetas ni títulos cortados a la mitad; un título de grupo viaja con lo que sigue */
        .report-print .print-break-avoid, .report-print table, .report-print tr { break-inside: avoid; }
        .report-print .print-keep-with-next { break-after: avoid; }

        .print-cover { page: cover; position: relative; width: 210mm; height: 297mm; overflow: hidden; break-after: page; color: #fff; }
        .print-cover-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .print-cover-body { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 22mm 20mm 18mm; box-sizing: border-box; }
        .print-cover-logo { height: 16mm; max-width: 70mm; object-fit: contain; object-position: left; filter: drop-shadow(0 1px 3px rgba(0,0,0,.45)); }
        .print-cover-agency { font-size: 15pt; font-weight: 700; text-shadow: 0 1px 4px rgba(0,0,0,.4); }
        .print-cover-kicker { font-size: 10pt; letter-spacing: .22em; text-transform: uppercase; font-weight: 600; opacity: .8; margin: 0 0 4mm; }
        .print-cover-title h1 { font-size: 36pt; line-height: 1.1; font-weight: 800; margin: 0; text-shadow: 0 2px 14px rgba(0,0,0,.35); }
        .print-cover-period { font-size: 17pt; font-weight: 500; margin: 6mm 0 0; text-transform: capitalize; opacity: .95; }
        .print-cover-range { font-size: 10pt; margin: 2mm 0 0; opacity: .7; }
        .print-cover-site { font-size: 10pt; margin: 6mm 0 0; opacity: .85; text-decoration: underline; text-underline-offset: 2px; }
        .print-cover-foot { display: flex; justify-content: space-between; font-size: 9pt; opacity: .8; border-top: 1px solid rgba(255,255,255,.35); padding-top: 4mm; }
      `}</style>

      <Cover data={data} report={report} workspace={workspace} portal={portal} brandPrimary={brandPrimary} brandSecondary={brandSecondary} />

      <ReportViewer data={data} isPublic={true} printMode={true} report={report} workspace={workspace} showFooter={false} />
    </div>
  )
}
