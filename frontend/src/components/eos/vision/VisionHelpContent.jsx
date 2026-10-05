// ═══════════════════════════════════════════════════════════════════════════════
// Contenidos de ayuda
// ═══════════════════════════════════════════════════════════════════════════════

function HelpStep({ step, children }) {
  return (
    <div>
      <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-1">{step}</p>
      {children}
    </div>
  )
}

function HelpArrows({ items }) {
  return (
    <ul className="space-y-1 mt-2">
      {items.map(q => (
        <li key={q} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
          <span className="text-primary-400 shrink-0 mt-0.5">→</span> {q}
        </li>
      ))}
    </ul>
  )
}

function HelpBox({ label, items }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
      {label && <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{label}</p>}
      <HelpArrows items={items} />
    </div>
  )
}

function HelpExamples({ items }) {
  return (
    <div className="space-y-1 mt-2">
      {items.map(ex => (
        <p key={ex} className="text-xs text-gray-500 dark:text-gray-400 italic pl-2 border-l-2 border-gray-200 dark:border-gray-600">{ex}</p>
      ))}
    </div>
  )
}

// ── Valores Medulares ────────────────────────────────────────────────────────

const CORE_VALUES_STEPS = [
  { step: 'PASO 1', body: 'Pide que cada miembro elabore un listado de tres personas a quienes, si pudieran clonarlos, llevarían a la organización a dominar el mercado. De preferencia, estos tres nombres debieran venir de adentro de la empresa. Al tener cada persona su listado de tres, pon todos los nombres en una pizarra para que todos puedan verlos.' },
  { step: 'PASO 2', body: 'Repasa los nombres y haz un listado de las características que esas personas representan. ¿Qué cualidades ejemplifican? ¿Qué hacen que los pone en la lista?', examples: ['Excelencia inequívoca','Continuamente busca la perfección','Gana','Hace lo correcto','Compasión','Honestidad e integridad','Anhela el éxito','Es entusiasta, energético, tenaz y competitivo','Fomenta la habilidad y creatividad individual','Rinde cuentas','Atiende a clientes por sobre todas las cosas','Trabaja arduamente','Nunca está satisfecho','Se interesa constantemente en su crecimiento personal','Ayuda primero','Exhibe profesionalismo','Promueve la iniciativa individual','Orientado al crecimiento','Trata a todos con respeto','Da oportunidades en base al mérito','Tiene creatividad, sueños e imaginación','Tiene integridad personal','No es cínico','Exhibe modestia y humildad junto con confianza','Practica atención fanática a la consistencia y detalle','Está comprometido','Entiende el valor de la reputación','Es alegre','Es justo','Promueve el trabajo en equipo'] },
  { step: 'PASO 3', body: 'Redúcelo. Circula cuales son realmente importantes, tacha aquellos que no lo son, y combina aquellos que son similares. La regla es tener entre tres y siete.' },
  { step: 'PASO 4', body: 'A través de discusión de grupo y debate, decide qué valores realmente pertenecen y son realmente medulares. Tu meta es bajarlos a un número entre tres y siete.' },
]

export function CoreValuesHelp() {
  return (
    <div className="space-y-5">
      {CORE_VALUES_STEPS.map(({ step, body, examples }) => (
        <HelpStep key={step} step={step}>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{body}</p>
          {examples && (
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              {examples.map(ex => <li key={ex} className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1"><span className="text-primary-400 mt-0.5 shrink-0">•</span> {ex}</li>)}
            </ul>
          )}
        </HelpStep>
      ))}
    </div>
  )
}

// ── Enfoque Medular ──────────────────────────────────────────────────────────

export function EnfoqueMedularHelp() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">El <strong className="text-gray-900 dark:text-white">Enfoque Medular</strong> es el punto dulce de tu organización: la intersección entre lo que te apasiona y lo que hacés mejor que nadie. Se compone de dos elementos: el <em>Propósito</em> y el <em>Nicho</em>.</p>
      <div>
        <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">Propósito / Causa / Pasión</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">Es la razón profunda por la que existe tu empresa, más allá de ganar dinero. Un propósito genuino inspira al equipo y orienta las decisiones difíciles.</p>
        <HelpBox label="Preguntas para descubrirlo" items={['¿Por qué hacemos lo que hacemos?','¿Qué cambiaría en el mundo si dejáramos de existir?','¿Qué queremos lograr para nuestros clientes más allá del servicio puntual?','¿Qué causa o valor nos da energía cada mañana?']} />
        <HelpExamples items={['"Mejorar la vida de las personas a través del diseño."','"Democratizar el acceso a la tecnología para las PyMEs."','"Ayudar a los emprendedores a alcanzar su máximo potencial."']} />
      </div>
      <div>
        <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">Nicho</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">El nicho define <em>qué hacés</em> y <em>para quién</em>. Cuanto más específico, más fácil es tomar decisiones sobre qué proyectos aceptar y qué rechazar.</p>
        <HelpBox label="Preguntas para descubrirlo" items={['¿Quién es tu cliente ideal? (industria, tamaño, ubicación)','¿Qué problema específico resolvés mejor que cualquier competidor?','¿Cuándo sentís que estás en tu mejor versión como empresa?']} />
        <HelpExamples items={['"Agencia de marketing digital para e-commerce de moda en LATAM."','"Consultoría de procesos para PyMEs industriales argentinas."']} />
      </div>
    </div>
  )
}

// ── Meta a 10 años ───────────────────────────────────────────────────────────

export function TenYearHelp() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">Reúnete con tu equipo de liderazgo y discutan hacia dónde quieren llevar tu organización. Nunca he visto que un equipo aterrice en la misma página con respecto a su meta de 10 años en la primera discusión. Ten paciencia en el primer intento.</p>
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">Recomiendo empezar preguntándole a todos qué tan lejos quieren ver. Después les preguntaría a todos qué nivel de ingresos creen que la organización podría tener para ese punto. Puede tomar varias reuniones llegar a la respuesta final.</p>
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">Al tomar esa decisión, confirma que todos se sientan motivados por ella. Tu meta a 10 años debe ser <strong className="text-gray-900 dark:text-white">específica y medible</strong>. Sabrás cuál es la meta correcta cuando cause pasión, emoción y energía en cada persona de tu organización.</p>
      <HelpBox label="Preguntas para arrancar la discusión" items={['¿Qué tan lejos queremos ver? ¿Cuál es nuestra ambición máxima?','¿Qué nivel de ingresos podríamos tener en 10 años?','¿Cómo queremos que nos conozca el mercado dentro de una década?','¿Qué impacto queremos haber generado en nuestros clientes y en la industria?']} />
    </div>
  )
}

// ── Estrategia de Marketing ──────────────────────────────────────────────────

export function MarketingHelp() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">La <strong className="text-gray-900 dark:text-white">Estrategia de Marketing</strong> define con precisión a quién le hablás, qué te hace único, cómo entregás tu servicio y qué prometés. Estos cuatro elementos alinean a todo el equipo y simplifican la toma de decisiones comerciales.</p>

      <div>
        <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">La Lista / Cliente Ideal</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-2">Describí con la mayor precisión posible a tu cliente ideal. Cuanto más específico, más efectiva tu estrategia.</p>
        <HelpBox label="Dimensiones a definir" items={['Industria o sector','Tamaño de empresa (empleados, facturación)','Ubicación geográfica','Cargo del tomador de decisiones','Problemas o dolores que tiene']} />
        <HelpExamples items={['"Dueños de PyMEs industriales con 10-50 empleados en Argentina."','"CMOs de startups tech de LATAM en etapa Serie A o B."']} />
      </div>

      <div>
        <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">Tres Diferenciadores</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-2">Exactamente <strong className="text-gray-900 dark:text-white">3 cosas</strong> que te hacen diferente y mejor a tu competencia. Deben ser genuinas, verificables y relevantes para tu cliente ideal.</p>
        <HelpBox label="Preguntas" items={['¿Por qué un cliente elegiría trabajar con vos sobre cualquier alternativa?','¿Qué cosas hacés que tu competencia no puede copiar fácilmente?','¿Qué aspectos de tu servicio generan más comentarios positivos?']} />
        <HelpExamples items={['"Resultados garantizados en 90 días."','"Equipo 100% senior — nunca trabajás con juniors."','"Metodología propia probada en +200 clientes."']} />
      </div>

      <div>
        <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">Proceso Probado</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-2">Los pasos específicos que seguís para entregar tus resultados. Un proceso claro genera confianza en el cliente y consistencia interna.</p>
        <HelpExamples items={['"1. Diagnóstico → 2. Estrategia → 3. Implementación → 4. Optimización → 5. Reporte."']} />
      </div>

      <div>
        <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">Garantía</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-2">¿Qué le prometés al cliente que, si no se cumple, corregís sin costo o devolvés el dinero? Remueve el riesgo percibido y comunica confianza.</p>
        <HelpExamples items={['"Si no ves resultados medibles en 90 días, devolvemos el dinero."','"Satisfacción garantizada: si no estás conforme, revisamos sin cargo adicional."']} />
      </div>
    </div>
  )
}

// ── Imagen a 3 años ──────────────────────────────────────────────────────────

export function ThreeYearHelp() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">La <strong className="text-gray-900 dark:text-white">Imagen a 3 años</strong> es una descripción vívida y específica de cómo se ve tu negocio en tres años. Su propósito es que todos en el equipo de liderazgo tengan exactamente la misma imagen mental.</p>
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">Empieza con los números concretos (ingresos, rentabilidad, headcount) y luego describí cómo <em>se ve, se siente y actúa</em> la organización. Incluí cuántos clientes tenés, en qué mercados operás, qué productos o servicios ofrecés.</p>
      <HelpBox label="Preguntas para construirla" items={['¿Cuántos clientes activos tenemos en 3 años?','¿En qué países o regiones operamos?','¿Qué productos o servicios nuevos lanzamos?','¿Cómo es la cultura del equipo? ¿Cuántos somos?','¿Cuál es nuestra reputación en el mercado?','¿Qué procesos o sistemas tenemos en funcionamiento?']} />
      <HelpBox label="Formato sugerido de objetivos específicos" items={['$X en ingresos anuales','X% de margen neto','X empleados a tiempo completo','Presencia en X países o ciudades','X clientes activos recurrentes']} />
    </div>
  )
}

// ── Plan a 1 año ─────────────────────────────────────────────────────────────

export function OneYearHelp() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">El <strong className="text-gray-900 dark:text-white">Plan a 1 año</strong> establece los objetivos más importantes para los próximos 12 meses. Debe estar alineado con la Imagen a 3 años y ser alcanzable con los recursos actuales.</p>
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">Define entre <strong className="text-gray-900 dark:text-white">3 y 7 prioridades anuales</strong> (llamadas <em>Rocks</em> en EOS). Si todo se cayera y solo pudieras hacer una cosa, ¿cuáles serían las más importantes? Esas son tus Rocks.</p>
      <HelpBox label="Cómo escribir un Rock anual" items={['Comenzá con un verbo de acción: Lanzar, Contratar, Alcanzar, Implementar, Cerrar…','Incluí una métrica o fecha de vencimiento concreta','Asigná un responsable para cada uno','Ejemplos: "Alcanzar $X en ventas", "Contratar 2 developers senior", "Lanzar producto Y en Q3"']} />
      <HelpBox label="Preguntas para identificar los Rocks" items={['¿Qué debe pasar este año para estar en camino a la Imagen a 3 años?','¿Cuáles son los 3-7 proyectos o cambios más importantes?','¿Qué problemas críticos hay que resolver en los próximos 12 meses?','¿Qué oportunidades grandes hay que capturar este año?']} />
    </div>
  )
}
