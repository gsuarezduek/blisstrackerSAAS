import { useParams } from 'react-router-dom'
import ReportPublic from './ReportPublic'
import ClientPortal from './ClientPortal'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// /report/:token sirve dos cosas distintas según el formato de la clave:
//   - UUID (token de un MonthlyReport individual)     → informe público de siempre
//   - slug corto (ej. "kahuak", portal de cliente)     → portal nuevo (informes+briefs+datos en vivo)
export default function ReportOrClientPortal() {
  const { token } = useParams()
  return UUID_RE.test(token || '') ? <ReportPublic /> : <ClientPortal />
}
