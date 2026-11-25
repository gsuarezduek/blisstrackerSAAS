// Datos y cálculos de la página de precios. Los tiers reales vienen de
// GET /api/public/pricing (PlatformSetting, SuperAdmin → Configuración → Comercial);
// lo que vive acá es la grilla de funcionalidades y las preguntas frecuentes, que son
// copy, no configuración.

/** Costo mensual total para `seats` miembros, según los tiers del backend. */
export function calcMonthly(seats, tiers) {
  if (seats <= 0) return 0
  const tier = tiers.find(t => t.upTo == null || seats <= t.upTo) ?? tiers[tiers.length - 1]
  return seats * tier.pricePerSeat
}

/** Precio por seat que aplica a `seats` miembros. */
export function priceForSeats(seats, tiers) {
  const tier = tiers.find(t => t.upTo == null || seats <= t.upTo) ?? tiers[tiers.length - 1]
  return tier.pricePerSeat
}

// `free`/`scale` de la fila "Usuarios" se completan con los valores dinámicos
// (freeSeatLimit / umbral de Scale) en comparisonWithSeats — acá quedan null.
// valores dinámicos (freeSeatLimit / umbral de Scale) — acá quedan null.
export const COMPARISON = [
  { group: 'Gestión de tareas', rows: [
    { feature: 'Usuarios',                                        free: null,       pro: 'Ilimitados',  scale: null },
    { feature: 'Proyectos',                                       free: 'Ilimitados', pro: 'Ilimitados', scale: 'Ilimitados' },
    { feature: 'Foco forzado (1 tarea activa)',                   free: true,       pro: true,          scale: true },
    { feature: 'Tareas destacadas + Backlog',                     free: true,       pro: true,          scale: true },
    { feature: 'Comentarios + menciones',                         free: true,       pro: true,          scale: true },
    { feature: 'Notificaciones (in-app + email)',                 free: true,       pro: true,          scale: true },
  ]},
  { group: 'Inteligencia artificial', rows: [
    { feature: 'Coach IA diario (Claude Haiku)',                  free: true,       pro: true,          scale: true },
    { feature: 'Resumen semanal por email',                       free: true,       pro: true,          scale: true },
    { feature: 'Memoria semanal de aprendizaje',                  free: true,       pro: true,          scale: true },
    { feature: 'Expectativas por rol (Role IA)',                  free: false,      pro: true,          scale: true },
    { feature: 'Límite mensual de tokens IA',                     free: '500K',     pro: '2M',          scale: 'Personalizado' },
  ]},
  { group: 'Marketing toolkit', rows: [
    { feature: 'GEO Audit (AI Overviews + ChatGPT)',              free: false,      pro: true,          scale: true },
    { feature: 'SEO con Google Search Console',                   free: false,      pro: true,          scale: true },
    { feature: 'Keyword tracking + SERP snapshots',               free: false,      pro: true,          scale: true },
    { feature: 'Google Analytics 4',                              free: false,      pro: true,          scale: true },
    { feature: 'Meta Ads + Google Ads',                           free: false,      pro: true,          scale: true },
    { feature: 'Instagram + TikTok',                              free: false,      pro: true,          scale: true },
    { feature: 'PageSpeed + Health Score',                        free: false,      pro: true,          scale: true },
    { feature: 'Canibalización SEO',                              free: false,      pro: true,          scale: true },
    { feature: 'Informes mensuales con URL pública para clientes', free: false,     pro: true,          scale: true },
  ]},
  { group: 'EOS / Traction', rows: [
    { feature: 'Visión + Personas + Datos + Procesos',            free: false,      pro: true,          scale: true },
    { feature: 'Rocks trimestrales + L10 semanal',                free: false,      pro: true,          scale: true },
    { feature: 'Evaluación organizacional con IA',                free: false,      pro: true,          scale: true },
  ]},
  { group: 'RRHH y administración', rows: [
    { feature: 'Legajos del equipo',                              free: false,      pro: true,          scale: true },
    { feature: 'Solicitud de licencias + vacaciones',             free: false,      pro: true,          scale: true },
    { feature: 'Historial de logins + ingresos',                  free: false,      pro: true,          scale: true },
  ]},
  { group: 'Soporte y onboarding', rows: [
    { feature: 'Soporte por email',                               free: true,       pro: true,          scale: true },
    { feature: 'Soporte prioritario',                             free: false,      pro: true,          scale: true },
    { feature: 'Onboarding personalizado',                        free: false,      pro: false,         scale: true },
    { feature: 'Account manager dedicado',                        free: false,      pro: false,         scale: true },
  ]},
]


/** La grilla con la fila "Usuarios" completada con los umbrales reales. */
export function comparisonWithSeats(freeSeatLimit, scaleThreshold) {
  return COMPARISON.map(group => ({
    ...group,
    rows: group.rows.map(row => row.feature === 'Usuarios'
      ? { ...row, free: `Hasta ${freeSeatLimit}`, scale: `Desde ${scaleThreshold}` }
      : row),
  }))
}

/** Preguntas frecuentes de precios. Dependen de los límites reales, así que es función. */
export function pricingFaqs({ freeSeatLimit, trialDays }) {
  return [
    { q: '¿Cómo se factura?',
      a: 'Mensual o anual con tarjeta a través de Stripe. La factura se genera automáticamente cada período y queda disponible en /billing para descarga.' },
    { q: '¿Puedo cancelar cuando quiera?',
      a: 'Sí. Desde /billing entrás al portal de Stripe y cancelás con un click. Mantenés acceso hasta el fin del período pagado y tus datos quedan accesibles después.' },
    { q: '¿Puedo cambiar de plan?',
      a: `Sí. Sumás o restás miembros cuando quieras y el cargo se ajusta prorrateado automáticamente. Si bajás a ${freeSeatLimit} o menos miembros, podés quedarte en Gratis sin perder datos.` },
    { q: '¿Qué cuenta como "usuario"?',
      a: 'Cualquier miembro activo del workspace. Los usuarios desactivados no consumen seat. Los clientes que ven informes mensuales con URL pública NO cuentan — no necesitan cuenta.' },
    { q: '¿Hay descuento anual?',
      a: 'Sí, ~15% (los meses 11 y 12 gratis). Lo configurás al elegir plan en Stripe Checkout.' },
    { q: '¿Qué pasa si supero el límite de tokens de IA?',
      a: 'Recibís un aviso al 90% y otro al 95%. Si superás el 100%, las funciones de IA pausan hasta el mes siguiente — el resto de la app sigue normal. El límite se puede subir desde Pro a Scale o personalizado.' },
    { q: '¿Mis datos son míos?',
      a: 'Siempre. Exportás todo en JSON desde Preferencias en cualquier momento. Si cancelás, programás eliminación con 48h de gracia (cancellable) y todo se borra de manera definitiva.' },
    { q: '¿Necesito tarjeta para el trial?',
      a: `No. Te registrás con email y arrancás. Si decidís continuar después de los ${trialDays} días, ingresás la tarjeta. Si no, automáticamente quedás en Gratis (hasta ${freeSeatLimit} usuarios).` },
  ]
}
