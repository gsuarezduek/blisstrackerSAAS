// Catálogo de briefs por proyecto (espejo del backend: backend/src/lib/briefCatalog.js).
// El Brief 1 (Marca) es el documento madre: se completa una sola vez y reúne todo lo
// transversal. Los briefs 2–6 son específicos por servicio y asumen que Marca ya está
// completo (no repiten lo ya respondido). Cada brief se completa modularmente.
//
// Cada campo: { k: claveEstable, q: pregunta, short?: true (input de una línea, default textarea),
//   big?: true (textarea alto para notas libres) }
// Las claves (k) solo necesitan ser únicas dentro de cada brief.

export const BRIEFS = [
  {
    key: 'memoria',
    title: 'Memoria',
    badge: 'Notas internas',
    intro: 'Anotaciones libres sobre el cliente: cosas que nos dijo, pedidos especiales y todo lo que tengamos que tener en cuenta. Un espacio para notas varias que no encajan en los otros briefs.',
    sections: [
      {
        title: 'Anotaciones',
        fields: [
          { k: 'notas', q: 'Notas y cosas a tener en cuenta', big: true },
        ],
      },
    ],
  },

  {
    key: 'marca',
    title: 'Marca',
    n: 1,
    badge: 'Documento madre',
    intro: 'Se completa una sola vez al iniciar la relación con el cliente. Reúne todo lo transversal (qué hace la empresa, público, competencia, identidad). El resto de los briefs parten de esta información.',
    estimate: '20–30 min',
    sections: [
      {
        title: 'Información del cliente',
        fields: [
          { k: 'nombre_marca', q: 'Nombre de la marca / empresa', short: true },
          { k: 'slogan', q: 'Slogan o mensaje clave', short: true },
          { k: 'industria', q: 'Industria o sector', short: true },
          { k: 'antiguedad', q: 'Antigüedad de la empresa', short: true },
        ],
      },
      {
        title: 'Qué hace la empresa',
        fields: [
          { k: 'actividad_principal', q: 'Servicio / actividad principal (lo que más venden o mejor hacen)' },
          { k: 'productos_estrella', q: '¿Cuáles son sus productos / servicios estrella?' },
        ],
      },
      {
        title: 'Identidad de marca',
        fields: [
          { k: 'mision_vision', q: 'Misión y visión (¿por qué existe la marca? ¿hacia dónde va en 1–3 años?)' },
          { k: 'valores', q: 'Valores clave que guían el negocio' },
          { k: 'personalidad', q: 'Personalidad de la marca en pocas palabras (ej. moderna, cercana, profesional, innovadora)' },
          { k: 'percepcion_deseada', q: '¿Qué percepción quieren que el público tenga de la marca?' },
        ],
      },
      {
        title: 'Público objetivo',
        fields: [
          { k: 'publico_principal', q: '¿A quién se dirigen principalmente? (edad, género, ubicación, intereses, poder adquisitivo)' },
          { k: 'cliente_ideal', q: 'Describan a su cliente ideal' },
          { k: 'problema_resuelto', q: '¿Qué problema o necesidad de ese público resuelven?' },
          { k: 'objeciones', q: '¿Qué objeciones suelen presentar los clientes antes de comprar?' },
          { k: 'testimonios', q: '¿Cuentan con testimonios o reseñas?' },
        ],
      },
      {
        title: 'Diferenciación y competencia',
        fields: [
          { k: 'diferencial', q: '¿Qué hace único a su producto / servicio? ¿Por qué comprarles a ustedes y no a la competencia?' },
          { k: 'competencia_directa', q: 'Competencia directa (ejemplos)' },
          { k: 'competencia_indirecta', q: 'Competencia indirecta (ejemplos)' },
          { k: 'marcas_referencia', q: 'Marcas de referencia o que admiran dentro (o fuera) del rubro' },
        ],
      },
      {
        title: 'FODA',
        fields: [
          { k: 'fortalezas', q: 'Fortalezas' },
          { k: 'oportunidades', q: 'Oportunidades' },
          { k: 'debilidades', q: 'Debilidades' },
          { k: 'amenazas', q: 'Amenazas' },
        ],
      },
      {
        title: 'Identidad visual y tono',
        fields: [
          { k: 'logo_paleta', q: '¿Tienen logotipo y/o paleta de colores definida? (aunque no sepan los códigos, ¿usan siempre los mismos colores?)' },
          { k: 'imagen_actual', q: '¿Sienten que su imagen actual representa bien el negocio? ¿Por qué?' },
          { k: 'tono', q: 'Tono de comunicación deseado (formal, cercano, amigable, educativo, etc.)' },
          { k: 'ejemplos_visuales', q: 'Ejemplos visuales o de comunicación que les gusten (links de webs, campañas o perfiles, no necesariamente del rubro)' },
        ],
      },
      {
        title: 'Comercial (referencia para todos los servicios)',
        fields: [
          { k: 'ticket_promedio', q: 'Ticket promedio', short: true },
          { k: 'margen', q: 'Margen de contribución aproximado del producto/servicio a promocionar', short: true },
          { k: 'fechas_clave', q: 'Fechas / temporadas clave del año (Hot Sale, Día del Padre, fin de año, etc.)' },
        ],
      },
      {
        title: 'Adicionales',
        fields: [
          { k: 'comentarios', q: 'Comentarios o información que consideren importante' },
        ],
      },
    ],
  },

  {
    key: 'organico',
    title: 'Contenido Orgánico (RRSS)',
    n: 2,
    intro: 'Completar después del Brief de Marca. Acá nos enfocamos solo en la gestión de contenido orgánico.',
    sections: [
      {
        title: 'Estado actual',
        fields: [
          { k: 'redes_frecuencia', q: '¿Qué redes gestionan hoy y con qué frecuencia publican?' },
          { k: 'quien_crea', q: '¿Quién crea el contenido actualmente (interno, freelance, nadie)?' },
          { k: 'resultados', q: '¿Qué resultados están teniendo? ¿Qué les funciona y qué no?' },
          { k: 'perfiles', q: 'Link a los perfiles que vamos a gestionar' },
        ],
      },
      {
        title: 'Objetivos',
        fields: [
          { k: 'objetivos', q: '¿Qué buscan lograr con redes? (comunidad, alcance, consultas, ventas, posicionamiento)' },
          { k: 'medicion_exito', q: '¿Cómo medirán si la gestión es exitosa?' },
        ],
      },
      {
        title: 'Contenido',
        fields: [
          { k: 'tipo_contenido', q: '¿Tienen preferencia por algún tipo de contenido? (reels, carruseles, stories, fotos, infografías, testimonios)' },
          { k: 'temas_evitar', q: '¿Qué temas NO quieren tocar o qué deben evitar?' },
          { k: 'material_propio', q: '¿Tienen material propio disponible? (fotos, videos, banco de imágenes, productos para fotografiar)' },
          { k: 'material_nuevo', q: '¿Pueden generar material nuevo cuando se necesite? ¿Quién y cada cuánto?' },
          { k: 'cuentas_referencia', q: 'Cuentas de referencia cuyo contenido les guste (del rubro o no)' },
        ],
      },
      {
        title: 'Operativa',
        fields: [
          { k: 'aprobacion', q: '¿Quién aprueba el contenido del lado del cliente? ¿En cuánto tiempo?' },
          { k: 'urgencias', q: '¿Suelen necesitar piezas urgentes o casi todo se puede planificar?' },
          { k: 'gestion_mensajes', q: '¿Responden ustedes los mensajes/comentarios o lo gestionamos nosotros?' },
          { k: 'lanzamientos', q: 'Productos, promos o lanzamientos previstos para los próximos meses' },
        ],
      },
      {
        title: 'Accesos',
        fields: [
          { k: 'accesos', q: 'Accesos necesarios: Meta Business Suite, usuarios de cada red' },
        ],
      },
    ],
  },

  {
    key: 'meta_ads',
    title: 'Performance / Meta Ads',
    n: 3,
    intro: 'Completar después del Brief de Marca. Enfocado en publicidad paga en Meta (Facebook / Instagram).',
    sections: [
      {
        title: 'Objetivo de la pauta',
        fields: [
          { k: 'objetivo', q: '¿Qué objetivo principal busca la pauta? (ventas, leads, mensajes de WhatsApp, tráfico, reconocimiento)' },
          { k: 'cierre_ventas', q: '¿Dónde se cierran efectivamente las ventas? (web, WhatsApp, local, teléfono)' },
          { k: 'presupuesto', q: 'Presupuesto mensual estimado de inversión publicitaria', short: true },
          { k: 'meta_facturacion', q: '¿Tienen una meta de facturación o cantidad de consultas/ventas por mes?' },
        ],
      },
      {
        title: 'Datos comerciales (clave para calcular rentabilidad)',
        fields: [
          { k: 'ticket_promedio', q: 'Ticket promedio', short: true },
          { k: 'margen', q: 'Margen de contribución del producto/servicio a promocionar', short: true },
          { k: 'tasa_conversion', q: 'Tasa de conversión estimada actual en el canal de cierre (web/WhatsApp)', short: true },
          { k: 'ciclo_venta', q: 'Duración aproximada del ciclo de venta', short: true },
        ],
      },
      {
        title: 'Producto y oferta',
        fields: [
          { k: 'producto_promocionar', q: '¿Qué producto/servicio puntual quieren promocionar primero?' },
          { k: 'oferta_gancho', q: '¿Tienen alguna promoción, oferta o gancho para usar en los anuncios? (envío gratis, descuento, etc.)' },
          { k: 'fechas_importantes', q: 'Promociones / fechas importantes a futuro' },
        ],
      },
      {
        title: 'Insumos para los anuncios',
        fields: [
          { k: 'base_datos', q: '¿Tienen base de datos de clientes? (sirve para audiencias y señales a Meta)' },
          { k: 'material_audiovisual', q: '¿Cuentan con material audiovisual para anuncios o lo producimos nosotros?' },
          { k: 'resena_ideal', q: '¿Cómo sería una reseña de 5 estrellas ideal de un cliente? (nos ayuda a redactar copys)' },
          { k: 'marcas_anuncios', q: 'Marcas cuyos anuncios les llamen la atención' },
        ],
      },
      {
        title: 'Accesos',
        fields: [
          { k: 'accesos', q: 'Accesos necesarios: Meta Business / Administrador de Anuncios, píxel, GA4, GTM, plataforma de venta (TiendaNube, WordPress, etc.)' },
        ],
      },
    ],
  },

  {
    key: 'web',
    title: 'Diseño y Desarrollo Web',
    n: 4,
    intro: 'Completar después del Brief de Marca. Enfocado en el proyecto web. Completar con la mayor cantidad de detalle posible; este contenido también alimenta el posicionamiento en Google.',
    sections: [
      {
        title: 'Objetivo del sitio',
        fields: [
          { k: 'problema', q: '¿Qué problema concreto debe resolver la web? ¿Qué quieren lograr con ella? (vender, generar consultas, dar información, captar leads)' },
          { k: 'acciones_visitante', q: '¿Qué debería poder hacer un visitante en el sitio?' },
          { k: 'web_actual', q: '¿Tienen web actual? Si es así, link y qué les gusta / qué no funciona.' },
        ],
      },
      {
        title: 'Alcance y secciones',
        fields: [
          { k: 'secciones', q: '¿Qué secciones debería tener? (ej. Inicio, Nosotros, Servicios, Tienda, Blog, Contacto)' },
          { k: 'servicios_secciones', q: 'Nombren al menos 4 servicios o secciones que ofrecerían en el sitio' },
          { k: 'tienda_funciones', q: '¿Necesitan tienda online / pagos / reservas / turnos?' },
          { k: 'textos_imagenes', q: '¿Tienen los textos y las imágenes o hay que producirlos?' },
        ],
      },
      {
        title: 'Contenido y posicionamiento',
        fields: [
          { k: 'palabras_clave', q: 'Lluvia de ideas: palabras clave con las que un cliente los buscaría en Google (las primeras que se les ocurran)' },
          { k: 'diferencia_competencia', q: '¿En qué se diferencian de la competencia? (texto para la web)' },
          { k: 'confianza', q: 'Convenios, certificaciones, premios o datos que den confianza' },
        ],
      },
      {
        title: 'Estilo',
        fields: [
          { k: 'percepcion', q: '¿Qué percepción debe transmitir el sitio? (moderna, clásica, fresca, minimalista, etc.)' },
          { k: 'webs_referencia', q: 'Webs que les gusten como referencia (del rubro o no) y qué les gusta de cada una' },
          { k: 'elementos_marca', q: '¿Hay elementos de marca obligatorios a respetar? (logo, colores, tipografías)' },
        ],
      },
      {
        title: 'Datos de contacto a mostrar',
        fields: [
          { k: 'direccion', q: 'Dirección o ubicación', short: true },
          { k: 'email', q: 'E-mail de contacto público', short: true },
          { k: 'telefono', q: 'Teléfono / WhatsApp', short: true },
          { k: 'redes', q: 'Redes a enlazar' },
        ],
      },
      {
        title: 'Técnico y accesos',
        fields: [
          { k: 'dominio_hosting', q: '¿Tienen dominio y hosting contratados? ¿A nombre de quién?' },
          { k: 'accesos_dominio', q: '¿Tienen accesos a su dominio/hosting actual?' },
          { k: 'integraciones', q: 'Integraciones necesarias (WhatsApp, medios de pago, mailing, reservas)' },
        ],
      },
    ],
  },

  {
    key: 'seo_sem',
    title: 'SEO / SEM (Google)',
    n: 5,
    intro: 'Completar después del Brief de Marca. Enfocado en Google: posicionamiento orgánico (SEO) y publicidad paga (SEM).',
    sections: [
      {
        title: 'Objetivo',
        fields: [
          { k: 'objetivo', q: '¿Qué buscan lograr en Google? (aparecer en búsquedas, generar consultas, ventas, llamadas)' },
          { k: 'zona_geografica', q: '¿Qué zona geográfica les interesa cubrir? (barrio, ciudad, país, internacional)' },
          { k: 'rapidos_sostenidos', q: '¿Buscan resultados rápidos (Ads), sostenidos (SEO) o ambos?' },
        ],
      },
      {
        title: 'SEO (posicionamiento orgánico)',
        fields: [
          { k: 'terminos', q: '¿Con qué términos creen que un cliente los buscaría? (lluvia de ideas)' },
          { k: 'servicios_posicionar', q: '¿Qué productos/servicios les interesa más posicionar?' },
          { k: 'blog', q: '¿Tienen blog o generan contenido escrito? ¿Pueden hacerlo?' },
          { k: 'google_business', q: '¿Tienen ficha de Google Business Profile (Google Maps)? ¿Está actualizada?' },
        ],
      },
      {
        title: 'SEM (Google Ads)',
        fields: [
          { k: 'presupuesto', q: 'Presupuesto mensual estimado para Google Ads', short: true },
          { k: 'producto_promocionar', q: '¿Qué producto/servicio quieren promocionar primero?' },
          { k: 'destino_clic', q: '¿A dónde llegará el usuario al hacer clic? (web, landing, WhatsApp)' },
          { k: 'promociones', q: '¿Tienen promociones o diferenciales para destacar en los anuncios?' },
          { k: 'datos_comerciales', q: 'Datos comerciales: ticket promedio, margen y tasa de conversión del canal de cierre' },
        ],
      },
      {
        title: 'Estado y competencia',
        fields: [
          { k: 'experiencia_previa', q: '¿Han hecho SEO o Google Ads antes? ¿Resultados?' },
          { k: 'competidores', q: '¿Qué competidores ven bien posicionados en Google?' },
        ],
      },
      {
        title: 'Accesos',
        fields: [
          { k: 'accesos', q: 'Accesos necesarios: Google Ads, Google Analytics (GA4), Google Tag Manager, Google Search Console, Google Business Profile, acceso a la web/CMS' },
        ],
      },
    ],
  },

  {
    key: 'crm',
    title: 'CRM y Automatizaciones',
    n: 6,
    intro: 'Completar después del Brief de Marca. Enfocado en sistematizar la gestión de leads y automatizar tareas (bot de WhatsApp).',
    sections: [
      {
        title: 'Situación actual',
        fields: [
          { k: 'base_datos', q: '¿Tienen base de datos de leads/clientes? ¿Dónde está alojada?' },
          { k: 'herramientas', q: '¿Qué herramientas usan hoy? (CRM, email, calendario, WhatsApp, planilla, etc.)' },
          { k: 'inventario_facturacion', q: '¿Tienen sistema de inventario o facturación / eCommerce? ¿Cuál?' },
          { k: 'captacion_leads', q: '¿Cómo captan leads actualmente? (formularios, ads, redes, llamadas)' },
          { k: 'consultas_frecuentes', q: '¿Cuáles son las consultas más frecuentes que reciben?' },
          { k: 'envios', q: '¿Hacen envíos? ¿Cómo gestionan ese proceso?' },
        ],
      },
      {
        title: 'Proceso de venta',
        fields: [
          { k: 'pasos', q: '¿Qué pasos siguen desde que entra un lead hasta que se cierra (o se pierde) la venta?' },
          { k: 'tasa_cierre', q: 'De cada 10 leads, ¿cuántos cierran aproximadamente?' },
          { k: 'ciclo_venta', q: 'Duración promedio del ciclo de venta', short: true },
          { k: 'segmentacion', q: '¿Tienen segmentación o scoring de leads? ¿Usan embudos / funnels?' },
          { k: 'remarketing', q: '¿Hacen remarketing o seguimiento a quienes no compraron?' },
        ],
      },
      {
        title: 'Comunicación y bot',
        fields: [
          { k: 'canales', q: '¿Qué canales usan para hablar con clientes? (WhatsApp, email, Messenger, SMS)' },
          { k: 'tono', q: 'Tono deseado para los mensajes automáticos (formal, cercano, etc.)' },
          { k: 'plantillas', q: '¿Tienen plantillas de mensajes o respuestas frecuentes ya escritas?' },
          { k: 'bot_vs_humano', q: '¿Qué debería resolver el bot por sí solo y en qué casos debe pasar a un humano?' },
        ],
      },
      {
        title: 'Tareas a automatizar',
        fields: [
          { k: 'tareas_manuales', q: '¿Qué tareas hacen hoy manualmente que les gustaría automatizar? (seguimientos, recordatorios, carga de datos, etc.)' },
          { k: 'procesos_optimizar', q: '¿Qué procesos quieren optimizar? (seguimiento, ventas, onboarding, fidelización)' },
        ],
      },
      {
        title: 'Integraciones',
        fields: [
          { k: 'formularios', q: 'Formularios externos en uso (Typeform, WPForms, Jotform, etc.)' },
          { k: 'calendarios', q: '¿Necesitan integrar con calendarios? (Google Calendar, Calendly)' },
          { k: 'landings', q: '¿Tienen landing pages o web a conectar?' },
        ],
      },
      {
        title: 'Expectativas y plan',
        fields: [
          { k: 'expectativas', q: '¿Qué esperan del servicio?' },
          { k: 'responsable', q: '¿Quién será el responsable interno de validar procesos y contenido?' },
          { k: 'fecha_inicio', q: 'Fecha de inicio deseada', short: true },
          { k: 'resultados_90', q: '¿Qué resultados esperan en los próximos 90 días?' },
          { k: 'metricas', q: 'Métricas más importantes para ustedes (ventas, reuniones agendadas, tasa de cierre, etc.)' },
        ],
      },
    ],
  },
]

export function briefByKey(key) {
  return BRIEFS.find(b => b.key === key) || null
}

export function briefFieldKeys(brief) {
  return brief.sections.flatMap(s => s.fields.map(f => f.k))
}

// Cuántos campos del brief tienen respuesta, sobre el total.
export function briefProgress(brief, answers = {}) {
  const keys = briefFieldKeys(brief)
  const answered = keys.filter(k => {
    const v = answers[k]
    return v != null && String(v).trim() !== ''
  }).length
  return { answered, total: keys.length }
}
