import ObjectiveProgressBars from '../marketing/ObjectiveProgressBars'

// Pestaña "Inicio" del portal de cliente — punto de entrada único que resume
// lo más accionable/reciente (contenido pendiente de aprobar, último informe,
// próxima reunión, datos en vivo) y linkea al resto de las pestañas, en vez de
// forzar al cliente a explorarlas para encontrar qué cambió.
//
// Todas las tarjetas son condicionales — si `meta` no trae el dato, la
// tarjeta no se muestra. Si ninguna aplica, se muestra un mensaje simple.
// El cumplimiento de objetivos (si showObjectives está activo) va a todo el
// ancho ARRIBA de las tarjetas — es lo más valioso para el cliente, así que
// es lo primero que ve al entrar. ObjectiveProgressBars es el mismo
// componente ya usado en Instagram/TikTok/Informes (frontend/src/components/marketing/),
// se autooculta si no hay objetivos.

function formatDate(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function HomeCard({ icon, title, children, onClick, brandPrimary }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`text-left bg-white rounded-2xl border border-gray-200 p-4 flex gap-3 ${
        onClick ? 'hover:border-gray-300 hover:shadow-sm transition-all' : ''}`}
    >
      <span className="text-2xl shrink-0" aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800 mb-0.5">{title}</p>
        <div className="text-sm text-gray-500">{children}</div>
        {onClick && (
          <p className="text-xs font-medium mt-2" style={{ color: brandPrimary }}>Ver más →</p>
        )}
      </div>
    </Tag>
  )
}

export default function PortalHome({ meta, onNavigate, brandPrimary }) {
  const pendingCount   = meta.pendingApprovalCount || 0
  const pendingPreview = meta.pendingPreview || []
  const latestReport   = meta.latestReportSummary || null
  const nextMeeting    = meta.nextMeeting || null
  const team           = meta.team || []
  const objectives     = meta.objectives || []
  const hasLiveSections = !!meta.hasLiveSections

  const cards = []

  if (pendingCount > 0) {
    cards.push(
      <HomeCard key="contenido" icon="📝" title={`${pendingCount} pieza${pendingCount !== 1 ? 's' : ''} esperando tu aprobación`}
        onClick={() => onNavigate('contenido')} brandPrimary={brandPrimary}>
        {pendingPreview.length > 0 && (
          <p className="truncate">{pendingPreview.map(p => p.title).join(' · ')}</p>
        )}
      </HomeCard>
    )
  }

  if (latestReport) {
    cards.push(
      <HomeCard key="informes" icon="📄" title={`Último informe · ${latestReport.month}`}
        onClick={() => onNavigate('informes')} brandPrimary={brandPrimary}>
        <p className="line-clamp-2">{latestReport.resumen || 'Ver el detalle completo del informe.'}</p>
      </HomeCard>
    )
  }

  if (nextMeeting) {
    cards.push(
      <HomeCard key="reunion" icon="🗓️" title="Próxima reunión" brandPrimary={brandPrimary}>
        <p>{formatDate(nextMeeting.date)}{nextMeeting.title ? ` — ${nextMeeting.title}` : ''}</p>
      </HomeCard>
    )
  }

  if (team.length > 0) {
    cards.push(
      <HomeCard key="equipo" icon="👥" title="Tu equipo" onClick={() => onNavigate('equipo')} brandPrimary={brandPrimary}>
        <p>{team.length} persona{team.length !== 1 ? 's' : ''} trabajando en tu proyecto.</p>
      </HomeCard>
    )
  }

  if (hasLiveSections) {
    cards.push(
      <HomeCard key="vivo" icon="📊" title="Datos Actuales" onClick={() => onNavigate('vivo')} brandPrimary={brandPrimary}>
        <p>Métricas actualizadas de tu proyecto, en tiempo real.</p>
      </HomeCard>
    )
  }

  if (cards.length === 0 && objectives.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
        <p className="text-3xl mb-2">🗂️</p>
        <p className="text-sm text-gray-500">Todavía no hay nada cargado en este portal. Volvé a entrar en unos días.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {objectives.length > 0 && <ObjectiveProgressBars objectives={objectives} />}
      {cards.length > 0 && <div className="grid sm:grid-cols-2 gap-3">{cards}</div>}
    </div>
  )
}
