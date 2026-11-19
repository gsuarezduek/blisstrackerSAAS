// Salud del envío de Mailing → hallazgos de Prioridades (Marketing). Lo que se
// mira es lo que daña la reputación del dominio del cliente o deja una campaña
// trabada sin que nadie se entere. Puro (sin prisma) para testearlo.
const RECENT_DAYS = 30
const MIN_SENT = 100          // por debajo, un rebote o una queja no es una tasa
const MAX_BOUNCE_RATE = 0.05  // arriba de 5% los proveedores empiezan a penalizar
const MAX_COMPLAINT_RATE = 0.001 // 0,1%: el umbral que Gmail publica para remitentes masivos

const pct = (n, d) => `${String(Math.round((n / d) * 1000) / 10).replace('.', ',')}%`

function item(title, detail, priority, sub = 'campanas') {
  return {
    source: 'mailing', category: 'Mailing', title, detail, priority,
    taskPrefix: 'Mailing', link: { tab: 'mailing', sub },
  }
}

/**
 * @param {object} p
 * @param {object|null} p.config     MailingConfig (provider, status, lastError, webhookSecret, webhookId)
 * @param {Array} p.campaigns        campañas lanzadas en los últimos 30 días + las en curso
 * @param {Date}  p.now
 */
function mailingFindings({ config, campaigns, now = new Date() }) {
  const items = []
  const live = campaigns.filter(c => ['sending', 'paused'].includes(c.status))

  if (config?.status === 'invalid') {
    items.push(item(
      'La configuración de envío de Mailing tiene un error',
      `${config.lastError || 'El proveedor rechazó las credenciales.'} Mientras siga así no sale ningún mail${live.length ? ` (hay ${live.length} campaña${live.length > 1 ? 's' : ''} esperando)` : ''}.`,
      'high', 'configuracion',
    ))
  } else if (live.some(c => c.status === 'sending') && config?.status !== 'active') {
    items.push(item(
      'Hay campañas de Mailing frenadas: la configuración de envío no está verificada',
      'Las campañas en curso no mandan nada hasta que se verifique la configuración.',
      'high', 'configuracion',
    ))
  }

  if (config?.status === 'active' && config.provider !== 'smtp') {
    const hooked = config.provider === 'ses' ? !!config.webhookId : !!config.webhookSecret
    if (!hooked) {
      items.push(item(
        'Mailing no está recibiendo los rebotes ni las quejas de spam',
        'Sin el webhook del proveedor, una dirección que rebota o alguien que marca spam sigue recibiendo mails, y eso daña la reputación del dominio. Conectalo en Configuración.',
        'medium', 'configuracion',
      ))
    }
  }

  const since = now.getTime() - RECENT_DAYS * 86400000
  for (const c of campaigns) {
    if (!c.launchedAt || new Date(c.launchedAt).getTime() < since || c.sentCount < MIN_SENT) continue
    if (c.bounceCount / c.sentCount > MAX_BOUNCE_RATE) {
      items.push(item(
        `«${c.name}» rebotó el ${pct(c.bounceCount, c.sentCount)}`,
        'Arriba del 5% los proveedores de correo empiezan a mandar a spam todo lo que sale del dominio. Los rebotados ya quedaron suprimidos; revisá de dónde salió esa base antes de la próxima campaña.',
        'high', 'bases',
      ))
    }
    if (c.complaintCount / c.sentCount > MAX_COMPLAINT_RATE) {
      items.push(item(
        `«${c.name}» tuvo ${c.complaintCount} ${c.complaintCount === 1 ? 'queja' : 'quejas'} de spam (${pct(c.complaintCount, c.sentCount)})`,
        'Gmail pide quedar por debajo del 0,1%. Suele pasar con bases viejas o importadas sin consentimiento claro, o con mucha frecuencia de envío.',
        'high', 'bases',
      ))
    }
  }
  return items
}

module.exports = { mailingFindings, MIN_SENT, MAX_BOUNCE_RATE, MAX_COMPLAINT_RATE }
