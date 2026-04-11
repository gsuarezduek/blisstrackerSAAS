import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import useRoles from '../hooks/useRoles'

const TABS = [
  { id: 'filosofia', label: 'Filosofía' },
  { id: 'manual',    label: 'Manual de Uso' },
  { id: 'roles',     label: 'Roles' },
]

// ── Filosofía ──────────────────────────────────────────────────────────────

function FilosofiaTab() {
  const principles = [
    {
      icon: '🚫',
      title: 'Sin prioridades artificiales',
      body: 'En la práctica, todo termina siendo "alta prioridad" y las listas crecen sin control. En lugar de eso: elegir pocas tareas importantes por día y ejecutarlas bien.',
      accent: 'border-red-200 dark:border-red-800',
      iconBg: 'bg-red-50 dark:bg-red-900/30',
    },
    {
      icon: '📅',
      title: 'Sin fechas ni deadlines complejos',
      body: 'Las fechas generan sobrecarga mental y sensación constante de atraso. Trabajamos por día, no por acumulación futura. Las tareas no completadas se trasladan al siguiente día (carry-over).',
      accent: 'border-amber-200 dark:border-amber-800',
      iconBg: 'bg-amber-50 dark:bg-amber-900/30',
    },
    {
      icon: '⚡',
      title: 'Menos ruido, más acción',
      body: 'Cada funcionalidad extra tiene un costo. Por eso el sistema es simple: crear tareas es rápido, entender qué hacer es inmediato, ejecutar es lo principal.',
      accent: 'border-blue-200 dark:border-blue-800',
      iconBg: 'bg-blue-50 dark:bg-blue-900/30',
    },
    {
      icon: '🎯',
      title: 'Foco en ejecución, no en organización',
      body: 'Muchos sistemas optimizan la planificación. Nosotros optimizamos la ejecución: menos tiempo gestionando tareas, más tiempo haciendo trabajo real.',
      accent: 'border-green-200 dark:border-green-800',
      iconBg: 'bg-green-50 dark:bg-green-900/30',
    },
    {
      icon: '🧠',
      title: 'Una forma de trabajo más humana',
      body: 'El trabajo real no es lineal ni perfectamente planificable. Este sistema se adapta: permite reorganizarse diariamente y hace visible el progreso real.',
      accent: 'border-purple-200 dark:border-purple-800',
      iconBg: 'bg-purple-50 dark:bg-purple-900/30',
    },
  ]

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Hero */}
      <div className="bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl p-7 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-200 mb-2">Filosofía de trabajo</p>
        <h2 className="text-2xl font-bold leading-snug mb-3">Simplicidad + Foco Diario</h2>
        <p className="text-primary-100 text-sm leading-relaxed mb-4">
          En lugar de usar múltiples etiquetas, prioridades, fechas y configuraciones complejas, el sistema está diseñado para responder una sola pregunta:
        </p>
        <div className="bg-white/15 rounded-xl px-4 py-3 text-center">
          <p className="text-lg font-semibold">¿Qué es lo importante que tengo que hacer hoy?</p>
        </div>
      </div>

      {/* Principios */}
      <div className="space-y-3">
        {principles.map(p => (
          <div key={p.title} className={`bg-white dark:bg-gray-800 border ${p.accent} rounded-2xl p-5 flex gap-4`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl ${p.iconBg}`}>
              {p.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{p.title}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{p.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Cierre */}
      <div className="bg-gray-900 dark:bg-gray-700 rounded-2xl p-6 text-center">
        <p className="text-white font-semibold text-base leading-relaxed">
          No buscamos hacer más cosas.<br />Buscamos hacer mejor las cosas importantes.
        </p>
        <p className="text-primary-400 font-medium mt-3 text-sm">Y para eso, menos es más.</p>
      </div>
    </div>
  )
}

// ── Manual de Uso ──────────────────────────────────────────────────────────

function ManualTab() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Hero */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Manual de Uso</p>
        <p className="text-xl font-bold text-gray-900 dark:text-white leading-snug">
          Decidir qué hacer hoy.<br />Y hacerlo bien.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">BlissTracker no es para organizar tareas. Es para ejecutarlas con claridad y foco.</p>
      </div>

      {/* Reglas básicas */}
      <DocCard title="Reglas básicas" icon="⚖️">
        <div className="space-y-2">
          {[
            ['1', 'Todo está en BlissTracker', 'Nada queda en WhatsApp, cabeza o mails.'],
            ['2', 'Cada tarea debe ser clara', 'Tiene que ser una acción concreta.'],
            ['3', 'Solo 1 tarea en curso', 'No multitarea.'],
            ['4', 'Máximo 3 tareas destacadas', 'Son tu foco real del día.'],
            ['5', 'Si no es para hoy → Backlog', 'No sobrecargar el día.'],
            ['6', 'Si no podés avanzar → BLOCKED', 'No simular progreso.'],
          ].map(([num, rule, desc]) => (
            <div key={rule} className="flex items-start gap-3 py-2.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <span className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{num}</span>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{rule}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </DocCard>

      {/* Cómo escribir una tarea */}
      <DocCard title="Cómo escribir una tarea" icon="✍️">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Tiene que poder ejecutarse sin pensar.</p>
        <div className="space-y-1.5">
          {[
            [false, 'Ver campaña'],
            [false, 'Trabajar en web'],
            [false, 'Revisar cliente'],
          ].map(([, text]) => (
            <div key={text} className="flex items-center gap-2.5 px-3 py-2 bg-red-50 dark:bg-red-900/10 rounded-xl">
              <span className="text-red-400 text-sm flex-shrink-0">✗</span>
              <span className="text-sm text-red-500 dark:text-red-400 line-through">{text}</span>
            </div>
          ))}
          <div className="border-t border-gray-100 dark:border-gray-700 my-2" />
          {[
            'Ajustar presupuesto campaña Meta cliente X',
            'Diseñar 3 placas para Instagram cliente Y',
            'Enviar propuesta por mail a cliente Z',
          ].map(text => (
            <div key={text} className="flex items-center gap-2.5 px-3 py-2 bg-green-50 dark:bg-green-900/10 rounded-xl">
              <span className="text-green-500 text-sm flex-shrink-0">✓</span>
              <span className="text-sm text-green-800 dark:text-green-300 font-medium">{text}</span>
            </div>
          ))}
        </div>
      </DocCard>

      {/* Cómo organizar tu día */}
      <DocCard title="Cómo organizar tu día" icon="📅">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Cada mañana:</p>
        <div className="space-y-2">
          {[
            ['1', 'Revisar Dashboard', false],
            ['2', 'Ver tareas pendientes', false],
            ['3', 'Elegir 3 tareas clave (destacadas)', true],
          ].map(([n, step, highlight]) => (
            <div key={step} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${highlight ? 'bg-primary-50 dark:bg-primary-900/20' : 'bg-gray-50 dark:bg-gray-700/40'}`}>
              <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${highlight ? 'bg-primary-500 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>{n}</span>
              <p className={`text-sm ${highlight ? 'font-semibold text-primary-700 dark:text-primary-300' : 'text-gray-700 dark:text-gray-300'}`}>{step}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-primary-600 dark:text-primary-400 font-medium mt-3">Si no definís tu foco, el día se desordena solo.</p>
      </DocCard>

      {/* Estados */}
      <DocCard title="Uso correcto de estados" icon="🧱">
        <div className="space-y-2">
          {[
            ['PENDING',     'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',               'Pendiente',     'Todavía no empezaste'],
            ['IN_PROGRESS', 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300','En progreso',   'Estás trabajando ahora mismo'],
            ['PAUSED',      'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',               'Pausada',       'Pausa temporal — vas a retomarlo'],
            ['BLOCKED',     'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',                'Bloqueada',     'No podés avanzar — registrá el motivo'],
            ['COMPLETED',   'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',        'Completada',    'Terminado'],
          ].map(([status, cls, label, desc]) => (
            <div key={status} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg flex-shrink-0 w-28 text-center ${cls}`}>{label}</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">{desc}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-3">No mentirse con los estados.</p>
      </DocCard>

      {/* Backlog */}
      <DocCard title="Uso del backlog" icon="🧠">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl p-4">
            <p className="text-xs font-bold text-red-500 dark:text-red-400 uppercase tracking-wide mb-2">No es</p>
            <ul className="space-y-1.5 text-sm text-red-600 dark:text-red-400">
              <li className="flex items-start gap-1.5"><span>✗</span> Acumulación de tareas</li>
              <li className="flex items-start gap-1.5"><span>✗</span> Cosas olvidadas</li>
            </ul>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-xl p-4">
            <p className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wide mb-2">Sí es</p>
            <ul className="space-y-1.5 text-sm text-green-700 dark:text-green-400">
              <li className="flex items-start gap-1.5"><span>✓</span> Planificación futura</li>
              <li className="flex items-start gap-1.5"><span>✓</span> Lo que no es prioridad hoy</li>
            </ul>
          </div>
        </div>
      </DocCard>

      {/* Errores + IA en fila */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DocCard title="Errores prohibidos" icon="🔥">
          <ul className="space-y-2">
            {[
              'Tareas vagas ("ver", "chequear")',
              'Más de 10 tareas en el día',
              'Varias tareas en progreso',
              'No usar backlog',
              'No completar tareas',
              'No bloquear cuando corresponde',
            ].map(e => (
              <li key={e} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="text-red-400 flex-shrink-0 mt-0.5">—</span>{e}
              </li>
            ))}
          </ul>
        </DocCard>

        <DocCard title="Uso del insight IA" icon="🤖">
          <ul className="space-y-2">
            {[
              'Leerlo todos los días',
              'Aplicar al menos 1 sugerencia',
              'Atender tareas mal definidas',
              'Observar patrones repetidos',
              'Detectar falta de foco',
            ].map(e => (
              <li key={e} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="text-primary-400 flex-shrink-0 mt-0.5">→</span>{e}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-3">Ignorarlo = perder valor del sistema.</p>
        </DocCard>
      </div>

      {/* Regla final */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 dark:from-gray-700 dark:to-gray-800 rounded-2xl p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Regla final</p>
        <p className="text-white font-bold text-lg">Si una tarea no está clara,<br />no se va a hacer.</p>
      </div>
    </div>
  )
}

// ── Roles ──────────────────────────────────────────────────────────────────

const FREQ_GROUPS = {
  monday:     { label: 'Lunes',                icon: '📅', color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' },
  daily:      { label: 'Lunes a viernes',      icon: '🔄', color: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' },
  friday:     { label: 'Viernes',              icon: '📅', color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' },
  weekly:     { label: 'Semanal',              icon: '📆', color: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300' },
  first_week: { label: 'Primera semana',       icon: '🗓️', color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300' },
  monthly:    { label: 'Mensual',              icon: '📊', color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' },
}

function RolesTab() {
  const { user } = useAuth()
  const { labelFor } = useRoles()
  const [expectations, setExpectations] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    api.get('/role-expectations/all').then(r => {
      setExpectations(r.data)
      const mine = r.data.find(e => e.roleName === user?.role)
      if (mine) setExpanded(mine.roleName)
      else if (r.data.length > 0) setExpanded(r.data[0].roleName)
    }).finally(() => setLoading(false))
  }, [user])

  if (loading) return (
    <div className="text-center py-16 text-gray-400 dark:text-gray-500">
      <p className="animate-pulse text-sm">Cargando roles...</p>
    </div>
  )

  if (expectations.length === 0) return (
    <div className="text-center py-16 text-gray-400 dark:text-gray-500">
      <p className="text-3xl mb-3">🎯</p>
      <p className="text-sm">No hay roles configurados todavía.</p>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      {expectations.map(exp => {
        const isOpen  = expanded === exp.roleName
        const isMine  = exp.roleName === user?.role
        const label   = labelFor(exp.roleName)
        const results = Array.isArray(exp.expectedResults) ? exp.expectedResults : []
        const resps   = Array.isArray(exp.operationalResponsibilities) ? exp.operationalResponsibilities : []
        const tasks   = Array.isArray(exp.recurrentTasks) ? exp.recurrentTasks : []
        const hasContent = exp.description || results.length > 0 || resps.length > 0 || tasks.length > 0

        return (
          <div
            key={exp.roleName}
            className={`bg-white dark:bg-gray-800 border rounded-2xl overflow-hidden transition-shadow ${
              isMine
                ? 'border-primary-300 dark:border-primary-700 shadow-md shadow-primary-100 dark:shadow-none ring-1 ring-primary-200 dark:ring-primary-800'
                : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            {/* Header */}
            <button
              onClick={() => setExpanded(isOpen ? null : exp.roleName)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Avatar de rol */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg font-bold ${
                  isMine
                    ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}>
                  {label.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-base font-semibold text-gray-900 dark:text-white">{label}</p>
                    {isMine && (
                      <span className="text-xs bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 rounded-full px-2.5 py-0.5 font-medium">
                        Tu rol
                      </span>
                    )}
                  </div>
                  {exp.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1 pr-4">{exp.description}</p>
                  )}
                  {!exp.description && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Sin descripción cargada</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                {/* Contadores en vista cerrada */}
                {!isOpen && hasContent && (
                  <div className="hidden sm:flex items-center gap-1.5">
                    {results.length > 0 && (
                      <span className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full px-2 py-0.5">{results.length} resultados</span>
                    )}
                    {tasks.length > 0 && (
                      <span className="text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-full px-2 py-0.5">{tasks.length} tareas</span>
                    )}
                  </div>
                )}
                <svg
                  xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                  className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </div>
            </button>

            {/* Contenido expandido */}
            {isOpen && (
              <div className="border-t border-gray-100 dark:border-gray-700">

                {!hasContent && (
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                    Este rol todavía no tiene información cargada.
                  </p>
                )}

                {/* Propósito */}
                {exp.description && (
                  <div className="px-5 pt-5">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed italic border-l-2 border-gray-200 dark:border-gray-600 pl-3">
                      {exp.description}
                    </p>
                  </div>
                )}

                {/* Resultados esperados */}
                {results.length > 0 && (
                  <div className="px-5 pt-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-base">🎯</span>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Resultados esperados</p>
                    </div>
                    <div className="space-y-2">
                      {results.map((r, i) => (
                        <div key={i} className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-900/10 rounded-xl px-3 py-2.5">
                          <span className="text-blue-400 dark:text-blue-500 flex-shrink-0 font-bold text-xs mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                          <p className="text-sm text-blue-900 dark:text-blue-200 leading-snug">{r}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Responsabilidades operativas */}
                {resps.length > 0 && (
                  <div className="px-5 pt-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-base">⚙️</span>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Responsabilidades operativas</p>
                    </div>
                    <div className="space-y-3">
                      {resps.map((r, i) => (
                        <div key={i} className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1.5">{r.category}</p>
                          {Array.isArray(r.items) && r.items.length > 0 && (
                            <ul className="space-y-1">
                              {r.items.map((item, j) => (
                                <li key={j} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                                  <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 flex-shrink-0 mt-2" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tareas recurrentes */}
                {tasks.length > 0 && (
                  <div className="px-5 pt-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-base">🔁</span>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Tareas recurrentes</p>
                    </div>
                    <div className="space-y-2">
                      {tasks.map((t, i) => {
                        const freq = FREQ_GROUPS[t.frequency] || { label: t.frequency, icon: '📌', color: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' }
                        return (
                          <div key={i} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl px-3 py-3">
                            <span className={`text-xs font-medium rounded-lg px-2 py-1 flex-shrink-0 whitespace-nowrap ${freq.color}`}>
                              {freq.icon} {freq.label}
                            </span>
                            <div>
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.task}</p>
                              {t.detail && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.detail}</p>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="h-5" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function DocCard({ title, icon, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">{icon}</span>
        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  )
}

const PILL_COLORS = {
  gray:   'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  blue:   'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
  purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
  orange: 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400',
}

function SectionPill({ color = 'gray', children }) {
  return (
    <span className={`inline-block text-xs font-semibold uppercase tracking-wide rounded-full px-2.5 py-0.5 ${PILL_COLORS[color]}`}>
      {children}
    </span>
  )
}

// ── Página principal ───────────────────────────────────────────────────────

export default function Docs() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TABS.find(t => t.id === searchParams.get('tab')) ? searchParams.get('tab') : 'filosofia'

  function setTab(id) {
    setSearchParams({ tab: id })
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Docs</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Guías y referencias del equipo</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-8 w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'filosofia' && <FilosofiaTab />}
        {tab === 'manual'    && <ManualTab />}
        {tab === 'roles'     && <RolesTab />}
      </div>
    </div>
  )
}
