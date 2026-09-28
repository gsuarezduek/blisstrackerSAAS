import ObjectiveProgressBars from '../marketing/ObjectiveProgressBars'
import { monthLabel } from '../marketing/ReportViewerParts'
import { Card, Icon, PrimaryButton, friendlyDate, withAlpha } from './portalUi'

// Inicio del portal de cliente. Responde, en este orden, las tres preguntas
// que trae alguien que entra: (1) ¿tengo que hacer algo? → tarjeta de acción
// arriba de todo, dominante si hay piezas para aprobar y tranquila ("estás al
// día") si no; (2) ¿qué hay de nuevo? → último informe + próxima reunión;
// (3) ¿cómo vamos? → objetivos. Lo demás (archivos, equipo, briefs) queda como
// accesos secundarios al final: se consulta, no se "hace".
//
// Todo es condicional a lo que trae `meta` — nada se muestra vacío.

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s }

function firstName(viewer) {
  const n = viewer?.name?.trim()
  return n ? n.split(/\s+/)[0] : null
}

function ActionCard({ pendingCount, preview, onReview, brandPrimary, viewerCanApprove }) {
  if (pendingCount === 0) {
    return (
      <Card className="p-5 sm:p-6 flex items-center gap-4">
        <div className="w-11 h-11 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <Icon name="check" className="w-6 h-6" strokeWidth={2.4} />
        </div>
        <div>
          <p className="text-base font-semibold text-gray-900">Estás al día</p>
          <p className="text-sm text-gray-500">No hay nada esperando tu aprobación. Te avisamos por email cuando haya algo nuevo.</p>
        </div>
      </Card>
    )
  }

  const items = preview.slice(0, Math.min(pendingCount, 3))
  const extra = pendingCount - items.length
  return (
    <div className="rounded-3xl p-[1.5px]" style={{ background: `linear-gradient(135deg, ${brandPrimary}, ${withAlpha(brandPrimary, 0.35)})` }}>
      <div className="rounded-[22px] bg-white p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: brandPrimary }}>
              {viewerCanApprove ? 'Necesitamos tu OK' : 'Pendiente de aprobación'}
            </p>
            <p className="mt-1 text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight">
              {pendingCount} {pendingCount === 1 ? 'pieza espera' : 'piezas esperan'} tu revisión
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {viewerCanApprove
                ? 'Revisalas y aprobalas o pedí cambios — te lleva un par de minutos.'
                : 'Podés verlas y dejar comentarios; la aprobación la hace otra persona de tu equipo.'}
            </p>
          </div>
          <PrimaryButton brandPrimary={brandPrimary} onClick={() => onReview()} className="sm:self-center !px-6 !py-3 text-[15px]">
            {viewerCanApprove ? 'Revisar ahora' : 'Ver piezas'} <Icon name="chevronRight" className="w-4 h-4" strokeWidth={2.4} />
          </PrimaryButton>
        </div>

        {items.length > 0 && (
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {items.map(p => (
              <button key={p.id} type="button" onClick={() => onReview(p.id)}
                className="flex items-center gap-3 rounded-2xl border border-gray-200 p-2.5 text-left hover:border-gray-300 hover:bg-gray-50 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center text-gray-400">
                  {p.thumbUrl ? <img src={p.thumbUrl} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Icon name="content" className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.title}</p>
                  <p className="text-xs text-gray-500">{p.scheduledDate ? `Sale el ${friendlyDate(p.scheduledDate)}` : 'Sin fecha'}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        {extra > 0 && <p className="mt-2 text-xs text-gray-400">y {extra} más</p>}
      </div>
    </div>
  )
}

function InfoCard({ icon, eyebrow, title, children, cta, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Card as={Tag} type={onClick ? 'button' : undefined} onClick={onClick}
      className={`p-5 text-left flex flex-col ${onClick ? 'hover:border-gray-300 hover:shadow-md transition-all group' : ''}`}>
      <div className="flex items-center gap-2 text-gray-400 mb-3">
        <Icon name={icon} className="w-4 h-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{eyebrow}</span>
      </div>
      <p className="text-base font-semibold text-gray-900">{title}</p>
      {children && <div className="text-sm text-gray-500 mt-1 flex-1">{children}</div>}
      {cta && (
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-gray-900 group-hover:gap-2 transition-all">
          {cta} <Icon name="chevronRight" className="w-4 h-4" />
        </span>
      )}
    </Card>
  )
}

function QuickLink({ icon, label, hint, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-gray-200/80 bg-white/70 px-4 py-3 text-left hover:bg-white hover:border-gray-300 transition-colors">
      <span className="w-9 h-9 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center shrink-0"><Icon name={icon} className="w-[18px] h-[18px]" /></span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-900">{label}</span>
        <span className="block text-xs text-gray-500 truncate">{hint}</span>
      </span>
    </button>
  )
}

export default function PortalHome({ meta, pendingCount, onNavigate, onReview, brandPrimary, projectName }) {
  const viewer          = meta.viewer || null
  const viewerCanApprove = viewer ? viewer.canApprove !== false : true
  const latestReport    = meta.latestReportSummary || null
  const nextMeeting     = meta.nextMeeting || null
  const objectives      = meta.objectives || []
  const name            = firstName(viewer)

  const quickLinks = []
  if (meta.hasLiveSections) quickLinks.push({ icon: 'pulse', label: 'Métricas en vivo', hint: 'Cómo viene el mes, al día de hoy', to: ['informes', 'vivo'] })
  if (meta.showFiles) quickLinks.push({ icon: 'folder', label: 'Archivos', hint: 'Materiales y entregables del proyecto', to: ['proyecto', 'archivos'] })
  if (meta.team?.length > 0 || meta.meetings?.length > 0) quickLinks.push({ icon: 'users', label: 'Equipo y reuniones', hint: meta.team?.length ? `${meta.team.length} personas en tu proyecto` : 'Notas y acuerdos', to: ['proyecto', 'equipo'] })
  if (meta.briefs?.length > 0) quickLinks.push({ icon: 'file', label: 'Briefs', hint: 'Lo que relevamos sobre tu marca', to: ['proyecto', 'briefs'] })

  const hasNews = !!(latestReport || nextMeeting)

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
          {name ? `Hola, ${name}` : 'Hola'} <span aria-hidden="true">👋</span>
        </h1>
        <p className="text-sm sm:text-base text-gray-500 mt-1">Este es el espacio de {projectName || 'tu proyecto'}.</p>
      </div>

      {meta.hasContent && (
        <ActionCard pendingCount={pendingCount} preview={meta.pendingPreview || []} onReview={onReview}
          brandPrimary={brandPrimary} viewerCanApprove={viewerCanApprove} />
      )}

      {hasNews && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 mb-3">Novedades</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {latestReport && (
              <InfoCard icon="reports" eyebrow="Último informe" title={capitalize(monthLabel(latestReport.month))}
                cta="Leer informe" onClick={() => onNavigate('informes', 'mensuales', { report: latestReport.token })}>
                <p className="line-clamp-3">{latestReport.resumen || 'Resultados, aprendizajes y próximos pasos del período.'}</p>
              </InfoCard>
            )}
            {nextMeeting && (
              <InfoCard icon="calendar" eyebrow="Próxima reunión" title={friendlyDate(nextMeeting.date)}>
                {nextMeeting.title && <p>{nextMeeting.title}</p>}
              </InfoCard>
            )}
          </div>
        </section>
      )}

      {objectives.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 mb-3">Cómo vamos con los objetivos</h2>
          <ObjectiveProgressBars objectives={objectives} />
        </section>
      )}

      {quickLinks.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 mb-3">Tu proyecto</h2>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {quickLinks.map(l => <QuickLink key={l.label} {...l} onClick={() => onNavigate(...l.to)} />)}
          </div>
        </section>
      )}

      {!meta.hasContent && !hasNews && objectives.length === 0 && quickLinks.length === 0 && (
        <Card className="p-10 text-center">
          <p className="text-sm font-semibold text-gray-800">Estamos preparando tu portal</p>
          <p className="text-sm text-gray-500 mt-1">Muy pronto vas a ver acá tus informes y el contenido para revisar.</p>
        </Card>
      )}
    </div>
  )
}
