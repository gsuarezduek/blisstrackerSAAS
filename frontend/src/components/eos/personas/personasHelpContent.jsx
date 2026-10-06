// ═══════════════════════════════════════════════════════════════════════════════
// Contenido de los modales de ayuda de Personas
// ═══════════════════════════════════════════════════════════════════════════════

export function PeopleAnalyzerHelp() {
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        El <strong className="text-gray-900 dark:text-white">Analizador de Personas</strong> evalúa a cada miembro del equipo en dos dimensiones: sus <em>Valores Medulares</em> y el <em>GWC</em> de su puesto.
      </p>
      <div>
        <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">Cómo calificar los Valores Medulares</p>
        <div className="space-y-2">
          {[
            { r: '+',   color: 'text-green-600', desc: 'La persona exhibe este valor de manera consistente. Es un ejemplo para el equipo.' },
            { r: '+/-', color: 'text-amber-600', desc: 'La persona vive este valor la mayoría del tiempo pero no siempre. Hay margen de mejora.' },
            { r: '-',   color: 'text-red-600',   desc: 'La persona raramente o nunca exhibe este valor. Requiere atención.' },
          ].map(({ r, color, desc }) => (
            <div key={r} className="flex items-start gap-3">
              <span className={`font-bold text-sm ${color} w-8 shrink-0`}>{r}</span>
              <p className="text-sm text-gray-600 dark:text-gray-400">{desc}</p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">GWC — Get it · Want it · Capacity</p>
        <div className="space-y-2">
          {[
            { label: 'G — ¿Lo entiende?',    desc: '¿La persona comprende naturalmente qué implica su rol, cómo encaja en la empresa y qué se espera de ella?' },
            { label: 'W — ¿Lo quiere?',       desc: '¿La persona genuinamente quiere hacer ese trabajo? No lo hace por obligación ni por el dinero solamente.' },
            { label: 'C — ¿Tiene capacidad?', desc: '¿Tiene el conocimiento, las habilidades y la energía para desempeñar el rol de manera excelente?' },
          ].map(({ label, desc }) => (
            <div key={label}>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-3 leading-relaxed">
          Una persona es "la persona correcta en el puesto correcto" cuando tiene <strong className="text-gray-900 dark:text-white">+ en todos los valores medulares y G, W y C en su rol</strong>.
        </p>
      </div>
    </div>
  )
}

export function AccountabilityHelp() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        El <strong className="text-gray-900 dark:text-white">Organigrama de Rendición de Cuentas</strong> (Accountability Chart) es diferente a un organigrama tradicional. No muestra jerarquías de autoridad, sino <em>quién es responsable de qué función</em> dentro de la empresa.
      </p>
      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Estructura típica EOS</p>
        {[
          'Nivel 1: Visionario + Integrador (o el liderazgo máximo)',
          'Nivel 2: Ventas & Marketing, Operaciones, Finanzas & Admin',
          'Nivel 3: Roles específicos debajo de cada función',
        ].map(l => (
          <p key={l} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
            <span className="text-primary-400 shrink-0">→</span> {l}
          </p>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Claves para construirlo</p>
        {[
          'Cada puesto tiene entre 3 y 7 responsabilidades clave, no más.',
          'Una sola persona puede estar en el puesto correcto; si no, hay que resolverlo.',
          'El organigrama refleja la realidad actual, no la aspiracional.',
          'Revisarlo cada trimestre para asegurarse de que sigue siendo preciso.',
        ].map(l => (
          <p key={l} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
            <span className="text-primary-400 shrink-0">·</span> {l}
          </p>
        ))}
      </div>
    </div>
  )
}
