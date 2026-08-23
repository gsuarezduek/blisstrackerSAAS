// Catálogo de ayudas contextuales (ver <HowToButton />). Cada entrada es
// { title, body: [párrafos], steps?: [pasos numerados], requires?: nota corta
// sobre una dependencia externa/config previa }. Agregar una pantalla nueva
// acá y usar el mismo `topic` al renderizar <HowToButton topic="..." /> —
// si la clave no existe, el ícono simplemente no se muestra.
export const HOW_TO_CATALOG = {
  'contenido.calendario': {
    title: '¿Cómo funciona el Calendario de contenido?',
    body: [
      'Cada pieza pasa por 8 estados: idea → producción → revisión interna → esperando aprobación → (cambios pedidos o aprobado) → programado → publicado. Hay un noveno estado, archivado, que queda fuera de este flujo.',
      'El cliente recién ve la pieza en su portal a partir de "esperando aprobación" — todo lo anterior (idea, producción, revisión interna) es interno, igual que las notas internas y los comentarios marcados como internos.',
      'Cuando una o varias piezas quedan "esperando aprobación", usá el botón 📨 Pedir aprobación para avisarle al cliente por mail. Desde ahí el cliente solo puede Aprobar o Pedir cambios.',
      '"Enviar al dashboard" crea una tarea para el responsable; completarla avanza la pieza sola (producción → revisión → esperando aprobación). Ojo: reabrir esa tarea NO hace retroceder la pieza.',
    ],
  },

  'ventas.pipeline': {
    title: '¿Cómo funciona el Pipeline?',
    body: [
      'Cada columna es un estado del lead (Prospecto → Contactado → Reunión → Propuesta → Ganado/Perdido) con una probabilidad de cierre asociada.',
      'Arrastrá una tarjeta a otra columna para cambiar el estado. Si la movés a Perdido, te va a pedir el motivo.',
      'El Forecast de la pestaña Métricas no suma los presupuestos tal cual: multiplica cada monto por la probabilidad de su etapa actual.',
    ],
    requires: 'Las automatizaciones de reactivación por WhatsApp (reabrir conversaciones vencidas con una plantilla) necesitan tener una cuenta de WhatsApp conectada — se conecta desde la pestaña WhatsApp con las credenciales de tu cuenta en Chakra.',
  },

  'ventas.leadDetail': {
    title: '¿Cómo funciona la ficha del Lead?',
    body: [
      'Notas de reunión es un campo libre y persistente (lo que se habló), distinto del Historial de abajo, que es un timeline automático de cada cambio.',
      'Investigar empresa (IA) lee el sitio web del lead y arma una ficha comercial interna. El Informe para el cliente reescribe esa investigación en un texto persuasivo pensado para mandarle al dueño del negocio, como paso previo a la propuesta.',
      'Generar propuesta arma el documento final a partir de uno o más planes de precio que cargás vos a mano — el precio nunca lo inventa la IA. Cada vez que la generás de nuevo queda como una versión nueva, no pisa la anterior.',
      'Las Próximas acciones con fecha crean automáticamente una tarea futura para el responsable (si hay un proyecto de tareas de Ventas configurado); completarla desde el dashboard resuelve la acción sola.',
    ],
    requires: 'Investigar empresa, el Informe y la Propuesta consumen presupuesto de tokens de IA del workspace.',
  },

  'marketing.geoSeo': {
    title: 'GEO/SEO — ¿por dónde empiezo?',
    body: [
      'GEO (Generative Engine Optimization) mide qué tan citable es el sitio para IAs como ChatGPT o Perplexity. SEO clásico mide posicionamiento en Google.',
      'Orden sugerido: arrancá por 🤖 GEO y 🔍 SEO para un diagnóstico general. 📋 Plan de acción junta los hallazgos de todas las herramientas (GEO, Canibalización, PageSpeed, Oportunidades) priorizados en una sola lista, con la opción de crear tareas en bloque.',
      '🔬 On-Page, ✍️ Content Brief y 🆚 Content Gap son herramientas puntuales para mejorar o planificar una página/artículo específico, no diagnósticos generales del sitio.',
    ],
  },

  'eos.traccion': {
    title: 'Vocabulario de Tracción (EOS)',
    body: [
      'Rocas: los 2-3 objetivos prioritarios del trimestre para cada persona — no son tareas del día a día, son lo más importante que tiene que avanzar.',
      'Reunión L10 (Level 10): la reunión semanal de 90 minutos del equipo de liderazgo. Al Iniciarla, cada participante pasa a tener una tarea "en curso" que cuenta como tiempo trabajado; al Finalizarla, esas tareas se completan solas.',
      'Los Asuntos que se tratan en esta reunión siguen el método IDS (Identificar, Discutir, Resolver) — se ven en la pestaña Asuntos, no acá.',
      'Los To-Dos son compromisos puntuales que salen de la reunión (no Rocas). Se pueden enviar al dashboard de la persona como una tarea normal.',
    ],
  },

  'proyecto.reuniones': {
    title: '¿Cómo funcionan las Reuniones?',
    body: [
      'Agregá los participantes antes de iniciar la reunión — una vez que arranca, el grupo queda fijo.',
      'Al tocar Iniciar, cada participante recibe automáticamente una tarea "en curso" en este proyecto (Reunión de equipo / Reunión con cliente). Por eso no se puede iniciar si alguien ya tiene otra tarea activa: primero tiene que cerrarla.',
      'Al Finalizar, esas tareas se completan solas y el tiempo transcurrido queda sumado al proyecto — aparece en Productividad y Reportes como tiempo trabajado normal.',
    ],
  },

  'marketing.objetivos': {
    title: '¿Cómo funcionan los Objetivos?',
    body: [
      'Cada objetivo tiene una periodicidad calendario (mensual, trimestral o anual) — no es una ventana móvil de 30 días, es el mes/trimestre/año calendario real.',
      'Las métricas de flujo (visitas, leads, inversión) SUMAN los meses del período. Las de stock (posición SEO, performance, seguidores) toman el último valor del período, no el acumulado.',
      'El progreso no se guarda: se recalcula cada vez que se abre el informe, así que si editás una meta el resultado cambia al instante.',
    ],
  },

  'portal.config': {
    title: '¿Cómo funciona el Portal de cliente?',
    body: [
      'Es un link público por proyecto (sin usuario del sistema) donde el cliente ve Informes y Briefs siempre, y — si lo habilitás acá — Datos en vivo y Contenido.',
      'Para Datos en vivo y Contenido el cliente necesita identificarse: pide un código de 6 dígitos por email (no usa contraseña) a uno de los Contactos que cargues en esta ficha.',
      'Solo los contactos con "Puede aprobar" activado pueden aprobar o pedir cambios en una pieza de Contenido — el resto del portal lo pueden ver igual, pero no decidir.',
    ],
  },
}
