// Catálogo de la Guía Contextual (ver <HowToButton /> + <HowToGuideModal />).
// No es documentación de interfaz ("este botón hace X"): cada entrada enseña
// el modelo mental de esa sección — qué problema resuelve, la lógica detrás,
// cómo usarla bien, con qué se conecta y qué evitar. Shape de cada entrada:
//
//   {
//     title: string,        // nombre del módulo, sin "¿Cómo funciona...?"
//     hook: string,         // obligatorio: 1-2 frases, problema + idea central
//     sections: [           // todas opcionales
//       { id: 'logica'|'uso'|'conecta'|'ejemplo', bullets?: (string|{text, tone?})[], text?: string },
//     ],
//     nextStep: string,     // opcional, próximo paso concreto
//     glossary: [[term, desc], ...],  // opcional, glosario colapsable (solo cuando aplica)
//   }
//
// `tone` en un bullet: 'do' (✅), 'dont' (🚫) dentro de la sección `uso`;
// 'warn' (⚡, chip ámbar) dentro de `conecta`, para automatizaciones o
// dependencias externas. Agregar una pantalla nueva acá y usar el mismo
// `topic` al renderizar <HowToButton topic="..." /> — si la clave no existe,
// el ícono simplemente no se muestra.
export const HOW_TO_CATALOG = {
  'dashboard.backlog': {
    title: 'Backlog',
    hook: 'El Backlog es donde viven las tareas que todavía no necesitan tu atención inmediata — la idea es que no todo se vuelva urgente. Cuando una tarea está lista para trabajarse, la activás y pasa a tu foco del día.',
    sections: [
      {
        id: 'logica',
        bullets: [
          'Backlog = lo que querés hacer. Foco de hoy = lo que estás haciendo ahora.',
          'Pasar una tarea del Backlog al foco es una decisión tuya, no un trámite de orden — recién ahí empieza a contar como algo en curso.',
        ],
      },
      {
        id: 'uso',
        bullets: [
          { text: 'Antes de activar una tarea, asegurate de que tenga la información necesaria para poder ejecutarla ya.', tone: 'do' },
          { text: 'Separá lo que querés hacer (Backlog) de lo que necesitás hacer ahora (foco).', tone: 'do' },
          { text: 'No lo conviertas en una lista infinita de pendientes que nunca revisás.', tone: 'dont' },
        ],
      },
      {
        id: 'conecta',
        bullets: [
          { text: 'Proyectos, Objetivos, Tareas recurrentes y otras funcionalidades pueden crear tareas directo en tu Backlog.' },
        ],
      },
      {
        id: 'ejemplo',
        text: '"Rediseñar la propuesta comercial" no es urgente hoy: la mandás al Backlog. Cuando el alcance está claro y es momento de encararla, la activás y pasa a tu foco del día.',
      },
    ],
    nextStep: 'Revisá tu Backlog una vez por semana y activá solo lo que vas a poder atacar en los próximos días.',
  },

  'rrhh.productividad': {
    title: 'Productividad del equipo',
    hook: 'Esta vista no mide "quién trabajó más horas" — mide cómo viene cada persona respecto a sí misma y al equipo, para que sepas a quién mirar primero sin leer 20 filas de números.',
    sections: [
      {
        id: 'logica',
        bullets: [
          'Todo se compara contra la mediana del equipo, no el promedio — así una sola persona con un mes atípico no corre la vara para todos.',
          'El semáforo de Estado es automático (inactivo, en baja, con atascos, en alza, OK) y resume varias métricas en una sola lectura.',
          'Δ horas necesita el horario (inicio y fin) cargado en Admin → Equipo para esa persona; sin eso muestra "—".',
        ],
      },
      {
        id: 'uso',
        bullets: [
          { text: 'Empezá por los chips de estado (En baja, Atascos, Inactivos) para filtrar, no por la tabla completa ordenada alfabéticamente.', tone: 'do' },
          { text: 'Abrí la fila de una persona antes de sacar conclusiones: ahí ves el desglose por proyecto y la asistencia, no solo el número final.', tone: 'do' },
          { text: 'No juzgues la Tasa aislada: más de 100% sostenido puede ser "está bajando backlog viejo", no necesariamente algo malo.', tone: 'dont' },
          { text: 'No confundas "menos horas" con "menos compromiso" sin mirar Asistencia primero — puede haber una licencia aprobada de por medio.', tone: 'dont' },
        ],
      },
      {
        id: 'conecta',
        bullets: [
          { text: 'Se alimenta de las mismas tareas y horarios que ves en el Dashboard de cada persona — no es un sistema de medición aparte.' },
          { text: 'El aviso semanal por mail a admins/owners (Preferencias → Globales) usa exactamente este mismo cálculo de alertas.', tone: 'warn' },
        ],
      },
      {
        id: 'ejemplo',
        text: 'Alguien con Δ horas al 60% y 0 tareas atascadas puede estar simplemente en un mes con licencias — mirá el bloque de Asistencia antes de tratarlo como una baja de rendimiento.',
      },
    ],
    nextStep: 'Andá directo a las personas en rojo o ámbar del resumen de arriba antes de recorrer toda la tabla.',
    glossary: [
      ['Δ horas', 'Horas registradas ÷ horas disponibles (días esperados × la jornada del horario configurado). Mide cuánto del tiempo disponible quedó registrado en tareas. Requiere horario (inicio y fin) cargado; si no, muestra "—".'],
      ['Tareas', 'Tareas completadas en el período, por fecha de completado (incluye las que se arrastraron de días previos). Compará contra la mediana del equipo (▲/▼).'],
      ['Horas', 'Tiempo activo de esas tareas (completado − iniciado − pausas, tope 8h por tarea, o el ajuste manual). No cuenta tiempo en tareas sin terminar.'],
      ['Tasa', 'Completadas ÷ creadas en el período: ritmo de cierre vs creación. >100% = está bajando backlog; <100% sostenido = lo está acumulando.'],
      ['Horas y Asistencia', 'Al expandir la fila: Δ horas, horas disponibles vs registradas, presencia (días hábiles trabajados / esperados = hábiles − licencias) y tardanzas (primer login vs su horario). Separa "el mes está a medias" de "faltó".'],
      ['Estado', 'Semáforo automático: inactivo (vino ≥3 días la última semana y no completó nada), ↓ baja (cae fuerte en tareas/horas/tasa), atascos (≥5 tareas frenadas >7d), ↑ alta (sube ≥30%), OK. Mirá primero a los rojos y ámbar.'],
      ['vs equipo', 'El ▲/▼ y la barra comparan a la persona contra la mediana del equipo (no el promedio, para que un outlier no la distorsione).'],
      ['Período', 'En "Mes en curso" se compara el mes a la fecha contra los mismos días del mes anterior, para que los números sean comparables. "Mes cerrado" usa el último mes completo.'],
    ],
  },

  'ventas.whatsapp': {
    title: 'WhatsApp',
    hook: 'Es el inbox de WhatsApp del equipo comercial, con un bot opcional que puede responder solo y un motor de reglas que reabre conversaciones frías sin que nadie tenga que acordarse de hacerlo.',
    sections: [
      {
        id: 'logica',
        bullets: [
          'Meta solo permite reabrir una conversación después de 24hs de silencio con una plantilla pre-aprobada, no con un mensaje libre — por eso las Plantillas existen como algo distinto de responder normal.',
          'El bot no improvisa sobre cualquier tema: si no está seguro, si el cliente pide hablar con una persona, o detecta una de tus palabras de "escalar", corta solo y avisa (queda en el panel de Calidad).',
        ],
      },
      {
        id: 'uso',
        bullets: [
          { text: 'Cargá ejemplos reales de buenas respuestas y subí tus documentos (precios, políticas, FAQs) en la config del bot — mejora mucho más que un prompt largo.', tone: 'do' },
          { text: 'Revisá el panel de Calidad de vez en cuando: ahí ves en qué mensajes el bot decidió pasarte la posta, y por qué.', tone: 'do' },
          { text: 'No dejes el bot activo en una conversación que ya se puso sensible o compleja — tomá el control manualmente.', tone: 'dont' },
        ],
      },
      {
        id: 'conecta',
        bullets: [
          { text: 'Las conversaciones se linkean a un Lead del Pipeline — ahí queda el contacto comercial completo.' },
          { text: 'Las Automatizaciones reabren leads fríos con una plantilla, según su estado en el Pipeline.' },
          { text: 'Necesita una cuenta de WhatsApp conectada (vía Chakra) para funcionar — sin eso el módulo queda inerte.', tone: 'warn' },
        ],
      },
      {
        id: 'ejemplo',
        text: 'Un lead en "Propuesta" que no responde hace 5 días puede reactivarse solo, de madrugada, con una plantilla que le recuerda la propuesta — sin que nadie del equipo tenga que acordarse.',
      },
    ],
    nextStep: 'Configurá al menos una regla de Automatización para los leads que más se te enfrían en el Pipeline.',
  },

  'tarea.recurrente': {
    title: 'Tareas futuras y recurrentes',
    hook: 'Sirve para sacar del medio tareas que no son de hoy sin perderlas: una tarea futura aparece sola en la fecha que elegís, y una recurrente se recrea sola según la frecuencia que definas.',
    sections: [
      {
        id: 'logica',
        bullets: [
          'Mientras la fecha no llegó, la tarea no aparece en ningún lado (ni foco, ni Backlog, ni Actividad) — no ensucia tu día a día.',
          'Una recurrente es una plantilla: cada vez que se cumple la frecuencia, se crea una instancia nueva. Si no completás una, se acumula como carry-over — la próxima igual se genera sola.',
        ],
      },
      {
        id: 'uso',
        bullets: [
          { text: 'Usá "futura" para algo puntual que sabés que no podés encarar todavía.', tone: 'do' },
          { text: 'Usá "recurrente" para lo que se repite siempre igual (un reporte semanal, un chequeo mensual).', tone: 'do' },
          { text: 'No uses una recurrente para algo que en realidad es "cuando tenga tiempo" — eso es Backlog, no una fecha fija.', tone: 'dont' },
        ],
      },
      {
        id: 'conecta',
        bullets: [
          { text: 'Se pueden editar o borrar "solo esta ocurrencia" o "esta y todas las siguientes" — el ícono 🔁 en la tarjeta indica que pertenece a una serie.' },
        ],
      },
      {
        id: 'ejemplo',
        text: 'Una tarea recurrente semanal "Revisar métricas de Ads" aparece sola cada lunes, sin que nadie tenga que crearla a mano cada vez.',
      },
    ],
    nextStep: 'Si te encontrás recreando la misma tarea todas las semanas a mano, convertila en recurrente.',
  },

  'contenido.calendario': {
    title: 'Calendario de contenido',
    hook: 'Es el tablero donde el equipo produce piezas de RRSS y el cliente las aprueba, todo en un mismo lugar — sin ida y vuelta por mail o WhatsApp para "¿ya viste el post del jueves?".',
    sections: [
      {
        id: 'logica',
        bullets: [
          'Cada pieza recorre 8 estados: idea → producción → revisión interna → esperando aprobación → (cambios pedidos o aprobado) → programado → publicado. Archivado queda aparte, fuera de ese flujo.',
          'El cliente ve TODAS las piezas del proyecto en el portal, en cualquier estado (incluidas idea y producción) — pero nunca las notas internas ni los comentarios marcados como internos, sin importar el estado.',
        ],
      },
      {
        id: 'uso',
        bullets: [
          { text: 'Cuando una pieza está lista para el cliente, movela a "esperando aprobación" y usá 📨 Pedir aprobación para avisarle por mail.', tone: 'do' },
          { text: '"Enviar al dashboard" crea una tarea para el responsable; completarla avanza la pieza sola.', tone: 'do' },
          { text: 'No reabras la tarea de una pieza ya avanzada esperando que retroceda de estado — no pasa: el avance automático es de una sola vía.', tone: 'dont' },
        ],
      },
      {
        id: 'conecta',
        bullets: [
          { text: 'Los archivos que subís a una pieza quedan también en el repositorio de Archivos del proyecto, organizados solos.' },
          { text: 'Publicar una pieza deja un mensaje automático en el Chat del proyecto — el equipo se entera sin que nadie avise a mano.' },
        ],
      },
      {
        id: 'ejemplo',
        text: 'Diseño sube el arte de un post a "revisión interna". El Community Manager lo aprueba y lo pasa a "esperando aprobación". El cliente recibe el mail, entra al portal, y aprueba o pide cambios — sin salir del sistema.',
      },
    ],
    nextStep: 'Si tenés piezas paradas en "esperando aprobación" hace más de un par de días, mandá el recordatorio con 📨 Pedir aprobación.',
  },

  'ventas.pipeline': {
    title: 'Pipeline de Ventas',
    hook: 'El Pipeline es el mapa del camino que recorre un lead hasta convertirse en cliente. Cada columna es una etapa con una probabilidad de cierre asociada — no es solo un tablero visual, es la base del Forecast.',
    sections: [
      {
        id: 'logica',
        bullets: [
          'Etapas: Prospecto → Contactado → Reunión → Propuesta → Ganado / Perdido, cada una con su probabilidad de cierre.',
          'El Forecast de Métricas no suma los presupuestos tal cual: multiplica cada monto por la probabilidad de la etapa donde está el lead hoy.',
        ],
      },
      {
        id: 'uso',
        bullets: [
          { text: 'Arrastrá la tarjeta a la etapa real de la conversación, no a la que te gustaría que esté.', tone: 'do' },
          { text: 'Si movés un lead a Perdido, cargá un motivo real — alimenta la automatización de reactivación.', tone: 'do' },
          { text: 'No dejes leads estancados en Propuesta "por las dudas": están inflando tu Forecast con algo que probablemente no cierre.', tone: 'dont' },
        ],
      },
      {
        id: 'conecta',
        bullets: [
          { text: 'La ficha del Lead (notas, propuestas, historial, investigación con IA) está a un clic de cada tarjeta.' },
          { text: 'La reactivación automática por WhatsApp reabre leads fríos con una plantilla — necesita una cuenta de WhatsApp conectada.', tone: 'warn' },
        ],
      },
      {
        id: 'ejemplo',
        text: 'Un lead de $50.000 en etapa Propuesta (40% de probabilidad) aporta $20.000 al Forecast, no los $50.000 completos.',
      },
    ],
    nextStep: 'Si un lead lleva más de dos semanas sin moverse de etapa, avanzalo con una acción concreta o marcalo Perdido.',
  },

  'ventas.leadDetail': {
    title: 'Ficha del Lead',
    hook: 'Es el expediente completo de una oportunidad de venta: lo que se habló, se investigó y se propuso vive acá, en un solo lugar, en vez de repartido entre mails, notas sueltas y la memoria de quien lo llevó.',
    sections: [
      {
        id: 'logica',
        bullets: [
          '"Notas de reunión" es un campo libre y persistente (lo que se habló). El Historial de abajo es distinto: un timeline automático de cada cambio de estado, responsable, propuesta o investigación.',
          '"Investigar empresa" (IA) lee el sitio del lead y arma una ficha comercial interna. El "Informe para el cliente" reescribe esa investigación como un texto persuasivo para mandarle al dueño del negocio, como paso previo a la propuesta.',
          '"Generar propuesta" arma el documento a partir de uno o más planes de precio que cargás vos a mano — el precio nunca lo inventa la IA.',
        ],
      },
      {
        id: 'uso',
        bullets: [
          { text: 'Cargá una Próxima acción con fecha en vez de confiar en tu memoria: crea sola una tarea futura para el responsable.', tone: 'do' },
          { text: 'Regenerá la propuesta cuando cambien las condiciones — queda como versión nueva, nunca pisa la anterior.', tone: 'do' },
          { text: 'No uses "Notas de reunión" para llevar el pulso día a día del lead: para eso está el Historial, que ya queda registrado solo.', tone: 'dont' },
        ],
      },
      {
        id: 'conecta',
        bullets: [
          { text: 'Las Próximas acciones con fecha aparecen como tarea futura del responsable en su Dashboard; completarla ahí resuelve la acción sola.' },
          { text: 'Investigar empresa, el Informe y la Propuesta consumen presupuesto de tokens de IA del workspace.', tone: 'warn' },
        ],
      },
      {
        id: 'ejemplo',
        text: 'Corrés "Investigar empresa", generás el "Informe para el cliente" con ese resultado y se lo mandás antes de la reunión — llegás con algo concreto en vez de una llamada en frío.',
      },
    ],
    nextStep: 'Si el lead está por pasar a Propuesta, corré primero "Investigar empresa": la propuesta sale mejor con ese contexto.',
  },

  'marketing.geoSeo': {
    title: 'GEO / SEO',
    hook: 'Son dos formas de medir lo mismo desde ángulos distintos: SEO mide qué tan bien posicionás en Google, GEO mide qué tan citable sos para IAs como ChatGPT o Perplexity. Acá conviven varias herramientas — la clave es no perderse en cuál usar primero.',
    sections: [
      {
        id: 'logica',
        bullets: [
          'GEO (Generative Engine Optimization) evalúa si una IA generativa citaría o recomendaría tu sitio. SEO clásico evalúa posicionamiento tradicional.',
          '📋 Plan de acción no es una herramienta más: junta los hallazgos de todas las demás (GEO, Canibalización, PageSpeed, Oportunidades) priorizados en una sola lista.',
        ],
      },
      {
        id: 'uso',
        bullets: [
          { text: 'Arrancá siempre por 🤖 GEO y 🔍 SEO para un diagnóstico general del sitio.', tone: 'do' },
          { text: 'Usá 🔬 On-Page, ✍️ Content Brief y 🆚 Content Gap solo con una página o artículo puntual en mente — no son diagnósticos generales.', tone: 'do' },
          { text: 'No repitas un audit todos los días: son procesos que consumen presupuesto de IA, con cadencia mensual alcanza salvo un cambio grande en el sitio.', tone: 'dont' },
        ],
      },
      {
        id: 'conecta',
        bullets: [
          { text: 'Desde 📋 Plan de acción podés crear tareas en bloque para el equipo directamente sobre los hallazgos priorizados.' },
        ],
      },
      {
        id: 'ejemplo',
        text: 'Corrés 🤖 GEO y 🔍 SEO, revisás 📋 Plan de acción para ver qué prioriza el sistema, y creás las tareas del mes desde ahí en vez de decidir a ojo por dónde empezar.',
      },
    ],
    nextStep: 'Si nunca corriste un audit acá, empezá por 🤖 GEO — te da el panorama más completo en un solo click.',
  },

  'eos.traccion': {
    title: 'Tracción (EOS)',
    hook: 'Es donde vive la ejecución del método EOS: los objetivos del trimestre de cada persona (Rocas) y la reunión semanal de seguimiento (L10) que mantiene al equipo de liderazgo alineado.',
    sections: [
      {
        id: 'logica',
        bullets: [
          'Rocas: los 2-3 objetivos prioritarios del trimestre por persona — no son tareas del día a día, son lo más importante que tiene que avanzar en esos 90 días.',
          'Reunión L10: la reunión semanal de 90 minutos del equipo de liderazgo. Al Iniciarla, cada participante pasa a tener una tarea "en curso" que cuenta como tiempo trabajado; al Finalizarla, esas tareas se completan solas.',
          'Los To-Dos son compromisos puntuales que salen de la reunión — no confundir con las Rocas, que son trimestrales.',
        ],
      },
      {
        id: 'uso',
        bullets: [
          { text: 'Definí Rocas concretas y medibles, no aspiraciones vagas — al cierre del trimestre tenés que poder decir sí o no se cumplió.', tone: 'do' },
          { text: 'Enviá los To-Dos al dashboard de la persona responsable en vez de confiar en que se acuerde sola.', tone: 'do' },
          { text: 'No mezcles Asuntos (problemas a resolver, método IDS) con To-Dos (compromisos ya definidos) — son cosas distintas y viven en pestañas separadas.', tone: 'dont' },
        ],
      },
      {
        id: 'conecta',
        bullets: [
          { text: 'Los Asuntos que surgen en la reunión se cargan en la pestaña Asuntos, con el método IDS (Identificar, Discutir, Resolver).' },
          { text: 'Un To-Do enviado al dashboard se comporta como cualquier tarea normal — al completarla, se tilda solo acá.' },
        ],
      },
      {
        id: 'ejemplo',
        text: 'En la L10 semanal surge un problema recurrente de coordinación con un cliente: se anota como Asunto, se discute con método IDS, y si de ahí sale una acción puntual, se carga como To-Do y se envía al dashboard del responsable.',
      },
    ],
    nextStep: 'Si todavía no cargaste las Rocas del trimestre actual, es lo primero que tenés que definir acá.',
  },

  'proyecto.reuniones': {
    title: 'Reuniones del proyecto',
    hook: 'Registra las reuniones de un proyecto (internas o con cliente) igual que una tarea: mide el tiempo real dedicado y deja notas y to-dos asociados, en vez de que la reunión "desaparezca" apenas termina.',
    sections: [
      {
        id: 'logica',
        bullets: [
          'Al tocar Iniciar, cada participante recibe automáticamente una tarea "en curso" en este proyecto. Por eso no se puede iniciar si alguien ya tiene otra tarea activa: primero tiene que cerrarla.',
          'Al Finalizar, esas tareas se completan solas y el tiempo transcurrido queda sumado al proyecto.',
        ],
      },
      {
        id: 'uso',
        bullets: [
          { text: 'Agregá los participantes antes de iniciar — una vez que arranca, el grupo queda fijo.', tone: 'do' },
          { text: 'Usá las notas libres para dejar por escrito lo que se habló, no solo los to-dos que salieron.', tone: 'do' },
          { text: 'No dejes una reunión "iniciada" sin finalizar si ya terminó — sigue contando tiempo a los participantes.', tone: 'dont' },
        ],
      },
      {
        id: 'conecta',
        bullets: [
          { text: 'El tiempo de la reunión aparece en Productividad y Reportes como tiempo trabajado normal, no como una categoría aparte.' },
          { text: 'Los to-dos de la reunión se pueden enviar al dashboard del responsable como una tarea normal de este proyecto.' },
        ],
      },
      {
        id: 'ejemplo',
        text: 'Una reunión con cliente de 45 minutos con 3 participantes suma 45 minutos de tiempo trabajado a cada uno de los 3 — se ve reflejado en sus reportes igual que cualquier tarea.',
      },
    ],
    nextStep: 'Cargá los participantes antes de tocar Iniciar — es lo único que no se puede cambiar después.',
  },

  'marketing.objetivos': {
    title: 'Objetivos de Marketing',
    hook: 'Son metas persistentes por proyecto (no un texto libre que se reescribe cada mes) que el sistema compara solo contra los datos reales ya capturados — vos cargás el número que perseguís, y el resto lo calcula el informe.',
    sections: [
      {
        id: 'logica',
        bullets: [
          'Cada objetivo tiene una periodicidad calendario real (mensual, trimestral o anual) — no una ventana móvil de 30 días.',
          'Las métricas de flujo (visitas, leads, inversión) SUMAN los meses del período. Las de stock (posición SEO, performance, seguidores) toman el último valor del período, no el acumulado.',
          'El progreso no se guarda: se recalcula cada vez que se abre el informe.',
        ],
      },
      {
        id: 'uso',
        bullets: [
          { text: 'Elegí la periodicidad según el tipo de meta: algo que se mide mes a mes no debería cargarse como anual.', tone: 'do' },
          { text: 'Editá la meta si las condiciones cambiaron a mitad de período — el resultado se actualiza al instante, no rompe nada histórico.', tone: 'do' },
          { text: 'No cargues como "flujo" una métrica que en realidad es una foto del momento (ej. seguidores totales) — vas a inflar el resultado sumando algo que no se suma.', tone: 'dont' },
        ],
      },
      {
        id: 'conecta',
        bullets: [
          { text: 'Se calculan sobre los datos ya capturados por GA4, Search Console, RRSS y Ads conectados al proyecto — no piden carga manual aparte.' },
        ],
      },
      {
        id: 'ejemplo',
        text: 'Un objetivo trimestral de "5.000 visitas" suma las visitas de los 3 meses del trimestre; uno de "posición promedio 5 en SEO" toma el valor del mes más reciente, no el promedio de los tres.',
      },
    ],
    nextStep: 'Si un informe muestra un objetivo en rojo, revisá primero si la periodicidad elegida tiene sentido antes de asumir que el resultado está mal.',
  },

  'portal.config': {
    title: 'Portal de cliente',
    hook: 'Es la puerta de entrada del cliente a su propia información, sin que necesite un usuario del sistema ni que vos le mandes nada a mano cada vez — un link, algunas secciones que elegís, y listo.',
    sections: [
      {
        id: 'logica',
        bullets: [
          'Es un link público por proyecto. Informes y Briefs se ven siempre; Datos en vivo, Contenido y Nube son opt-in, los prendés vos acá.',
          'Para Datos en vivo, Contenido y Nube el cliente necesita identificarse: pide un código de 6 dígitos por email a uno de los Contactos que cargues en esta ficha (no usa contraseña).',
          'Solo los contactos con "Puede aprobar" activado pueden aprobar o pedir cambios en una pieza de Contenido — el resto del portal lo ven igual, pero no deciden.',
        ],
      },
      {
        id: 'uso',
        bullets: [
          { text: 'Cargá un Contacto por cada persona del cliente que necesite entrar, no un solo email compartido.', tone: 'do' },
          { text: 'Activá "Puede aprobar" solo en quien realmente tiene mandato para decidir sobre el contenido.', tone: 'do' },
          { text: 'No compartas el link del portal como si fuera privado por sí solo: da acceso a todo el historial de informes generados del proyecto.', tone: 'dont' },
        ],
      },
      {
        id: 'conecta',
        bullets: [
          { text: 'Nube muestra el mismo repositorio de Archivos que ve el equipo, en modo solo lectura: el cliente ve y descarga, pero no sube, mueve ni borra nada.' },
          { text: 'La pestaña Contenido del portal es donde el cliente aprueba o pide cambios en las piezas del Calendario de contenido.' },
        ],
      },
      {
        id: 'ejemplo',
        text: 'Activás Contenido y Datos en vivo para un cliente, cargás a su gerente de marketing como Contacto con "Puede aprobar", y le mandás el link una sola vez — de ahí en más entra solo con su email cada vez que necesita revisar algo.',
      },
    ],
    nextStep: 'Si el portal ya está activo pero el cliente no lo usa, confirmá que tenga al menos un Contacto cargado — sin eso no puede identificarse.',
  },
}
