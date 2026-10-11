import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || ''

// Vista de impresión de una factura — SOLO la abre el render de PDF del
// backend (Chromium headless, con un token de impresión de vida corta). No
// es una página para personas: sin navegación ni controles, formato A4.
//
// Protocolo con el renderer (services/pdfRenderer.service.js): cuando todo
// está cargado setea window.__INVOICE_PRINT_READY__ = true; si algo falla,
// window.__INVOICE_PRINT_READY___ERROR con el motivo.
const READY_FLAG = '__INVOICE_PRINT_READY__'

function waitForImages(timeoutMs = 10000) {
  const imgs = Array.from(document.images)
  const pending = imgs.filter(img => !img.complete).map(img => new Promise(resolve => {
    img.addEventListener('load', resolve, { once: true })
    img.addEventListener('error', resolve, { once: true })
  }))
  return Promise.race([Promise.all(pending), new Promise(resolve => setTimeout(resolve, timeoutMs))])
}

function fmtMoney(cents) {
  return (cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const CONDITION_LETTER = { A: 'A', B: 'B', C: 'C' }

export default function FacturaPrint() {
  const { printToken } = useParams()
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    document.documentElement.classList.remove('dark')
    document.title = 'Factura'
    axios.get(`${API}/api/public/invoice-print/${printToken}`)
      .then(r => setPayload(r.data))
      .catch(err => {
        const msg = err.response?.data?.error || err.message || 'No se pudo cargar la factura'
        setError(msg)
        window[`${READY_FLAG}_ERROR`] = msg
      })
  }, [printToken])

  useEffect(() => {
    if (!payload) return
    let cancelled = false
    ;(async () => {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      await Promise.all([waitForImages(), document.fonts?.ready])
      if (!cancelled) window[READY_FLAG] = true
    })()
    return () => { cancelled = true }
  }, [payload])

  if (error) return <div style={{ padding: 40, fontFamily: 'sans-serif', color: '#b91c1c' }}>{error}</div>
  if (!payload) return null

  const { document: doc, qrDataUrl, workspace } = payload
  const agencyName = workspace?.name || ''

  return (
    <div className="invoice-print">
      <style>{`
        @page { size: A4; margin: 14mm; }
        html, body { background: #fff !important; margin: 0; }
        .invoice-print { -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #111827;
          font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 10pt; }
        .inv-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 10px; }
        .inv-issuer { max-width: 60%; }
        .inv-issuer-logo { height: 14mm; max-width: 60mm; object-fit: contain; object-position: left; margin-bottom: 4mm; }
        .inv-issuer h1 { font-size: 13pt; margin: 0 0 2mm; }
        .inv-issuer p { margin: 0; font-size: 9pt; color: #374151; line-height: 1.5; }
        .inv-letterbox { border: 2px solid #111827; border-radius: 4px; width: 26mm; text-align: center; padding: 3mm 0; }
        .inv-letterbox .letter { font-size: 24pt; font-weight: 800; line-height: 1; }
        .inv-letterbox .code { font-size: 7pt; color: #4b5563; margin-top: 1mm; }
        .inv-letterbox .num { font-size: 8pt; margin-top: 2mm; font-weight: 600; }
        .inv-meta { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 9pt; }
        .inv-receiver { border: 1px solid #d1d5db; border-radius: 4px; padding: 8px; margin-bottom: 10px; }
        .inv-receiver p { margin: 0 0 2px; }
        table.inv-lines { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        table.inv-lines th { text-align: left; font-size: 8pt; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #111827; padding: 4px 6px; }
        table.inv-lines td { font-size: 9.5pt; border-bottom: 1px solid #e5e7eb; padding: 5px 6px; }
        table.inv-lines td.num { text-align: right; }
        .inv-totals { display: flex; justify-content: flex-end; margin-bottom: 14px; }
        .inv-totals table { border-collapse: collapse; }
        .inv-totals td { padding: 2px 8px; font-size: 9.5pt; }
        .inv-totals .grand td { font-size: 12pt; font-weight: 700; border-top: 1px solid #111827; padding-top: 5px; }
        .inv-footer { display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #d1d5db; padding-top: 10px; }
        .inv-cae p { margin: 0 0 2px; font-size: 9.5pt; }
        .inv-cae .label { color: #6b7280; }
        .inv-qr { width: 28mm; height: 28mm; }
        .inv-legends { margin-top: 10px; font-size: 7.5pt; color: #4b5563; }
      `}</style>

      <div className="inv-header">
        <div className="inv-issuer">
          {workspace?.hasLogo && workspace?.slug && (
            <img className="inv-issuer-logo" src={`${API}/api/public/logo/${workspace.slug}`} alt={agencyName}
              onError={(e) => { e.currentTarget.style.display = 'none' }} />
          )}
          <h1>{doc.issuer.legalName}{doc.issuer.tradeName ? ` (${doc.issuer.tradeName})` : ''}</h1>
          <p>{doc.issuer.address}</p>
          <p>CUIT {doc.issuer.taxId} · {doc.issuer.conditionLegend}</p>
          <p>Ingresos Brutos: {doc.issuer.grossIncome}{doc.issuer.activitiesStartDate && ` · Inicio de actividades: ${fmtDate(doc.issuer.activitiesStartDate)}`}</p>
        </div>
        <div className="inv-letterbox">
          <div className="letter">{CONDITION_LETTER[doc.voucherClass] || doc.voucherClass}</div>
          <div className="code">Código N° {doc.code}</div>
          <div className="num">{doc.title} {doc.number}</div>
        </div>
      </div>

      <div className="inv-meta">
        <span>Fecha de emisión: {fmtDate(doc.issueDate)}</span>
        <span>Condición de venta: {doc.saleConditions}</span>
      </div>

      <div className="inv-receiver">
        <p><strong>{doc.receiver.name || 'Consumidor Final'}</strong></p>
        {doc.receiver.address && <p>{doc.receiver.address}</p>}
        <p>{doc.receiver.document ? `${doc.receiver.document.label || 'Doc.'}: ${doc.receiver.document.number}` : ''} · {doc.receiver.conditionLegend}</p>
      </div>

      <table className="inv-lines">
        <thead>
          <tr><th>Descripción</th><th className="num">Cant.</th><th className="num">Precio unit.</th><th className="num">Importe</th></tr>
        </thead>
        <tbody>
          {doc.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.description}</td>
              <td className="num">{l.quantity}</td>
              <td className="num">{l.unitPrice}</td>
              <td className="num">{fmtMoney(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="inv-totals">
        <table>
          <tbody>
          {doc.totals.vatRates?.map(r => (
            <tr key={r.id}><td>IVA {r.rate != null ? `${r.rate}%` : ''}</td><td className="num">{fmtMoney(r.amount)}</td></tr>
          ))}
          <tr className="grand"><td>Total</td><td className="num">$ {fmtMoney(doc.totals.total)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="inv-footer">
        <div className="inv-cae">
          <p><span className="label">C.A.E. N°: </span>{doc.authorization.code}</p>
          <p><span className="label">Fecha Vto. CAE: </span>{fmtDate(doc.authorization.dueDate)}</p>
        </div>
        <img className="inv-qr" src={qrDataUrl} alt="QR AFIP" />
      </div>

      {doc.legends?.length > 0 && (
        <div className="inv-legends">
          {doc.legends.map((l, i) => <p key={i}>{l.text}</p>)}
        </div>
      )}
    </div>
  )
}
