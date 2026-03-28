import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const guide = [
  {
    icon: '🎯',
    title: 'Para qué sirve este sistema',
    content: (
      <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
        <li className="flex items-start gap-2"><span className="text-primary-500 mt-0.5">•</span> Tener claridad sobre qué está haciendo cada uno</li>
        <li className="flex items-start gap-2"><span className="text-primary-500 mt-0.5">•</span> Evitar olvidos y desorden</li>
        <li className="flex items-start gap-2"><span className="text-primary-500 mt-0.5">•</span> Mejorar la coordinación del equipo</li>
        <li className="flex items-start gap-2"><span className="text-primary-500 mt-0.5">•</span> Trabajar con foco — una cosa a la vez</li>
        <li className="mt-3 font-semibold text-gray-800 dark:text-gray-200 italic">Si no está en el sistema, no existe.</li>
      </ul>
    ),
  },
  {
    icon: '⚖️',
    title: 'Prioridades del día',
    content: (
      <div className="text-sm space-y-2">
        <p className="text-gray-600 dark:text-gray-400">Cada día, elegir máximo <span className="font-bold text-gray-800 dark:text-gray-200">3 a 5 tareas importantes</span> y hacerlas bien.</p>
        <p className="text-gray-500 dark:text-gray-500 text-xs">Una lista infinita no es productividad — es ansiedad disfrazada.</p>
      </div>
    ),
  },
  {
    icon: '✏️',
    title: 'Cómo escribir una buena tarea',
    content: (
      <div className="space-y-3 text-sm">
        <p className="text-gray-500 dark:text-gray-400">Una tarea debe tener un resultado claro y poder completarse en un bloque de trabajo.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-2">✅ Buenas tareas</p>
            <ul className="space-y-1 text-xs text-green-800 dark:text-green-300">
              <li>"Diseñar 3 placas Instagram Cliente X"</li>
              <li>"Armar propuesta comercial Cliente Y"</li>
              <li>"Configurar campaña Meta Ads Cliente Z"</li>
            </ul>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2">❌ Malas tareas</p>
            <ul className="space-y-1 text-xs text-red-800 dark:text-red-300">
              <li>"Trabajar en cliente"</li>
              <li>"Ver cosas"</li>
              <li>"Responder mensajes"</li>
            </ul>
          </div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">⏱ Regla de los 15 minutos</p>
          <p className="text-xs text-amber-800 dark:text-amber-300">Si algo dura menos de 15 min, no va solo. Agrupar tareas cortas en una sola: <span className="font-medium">"Gestión diaria Cliente X"</span></p>
        </div>
      </div>
    ),
  },
  {
    icon: '⚙️',
    title: 'Cómo trabajar durante el día',
    content: (
      <div className="space-y-3 text-sm">
        <div className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs flex-shrink-0">1</span>
          <div>
            <p className="font-medium text-gray-800 dark:text-gray-200">Una sola tarea en progreso</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">No multitasking. Mejor calidad, menos errores.</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs flex-shrink-0">2</span>
          <div>
            <p className="font-medium text-gray-800 dark:text-gray-200">Usar los estados correctamente</p>
            <div className="mt-1.5 space-y-1">
              {[
                { color: 'bg-blue-500', label: 'En curso', desc: 'estoy trabajando ahora' },
                { color: 'bg-yellow-400', label: 'Pausada', desc: 'lo retomo después' },
                { color: 'bg-red-500', label: 'Bloqueada', desc: 'hay un impedimento real' },
                { color: 'bg-green-500', label: 'Completada', desc: 'terminado' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.color}`} />
                  <span className="font-medium text-gray-700 dark:text-gray-300">{s.label}</span>
                  <span>→ {s.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs flex-shrink-0">3</span>
          <div>
            <p className="font-medium text-gray-800 dark:text-gray-200">Algo nuevo aparece</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">No confiar en la memoria — cargarlo en el sistema y decidir si va hoy o después.</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: '🚧',
    title: 'Cuándo usar "Bloqueada"',
    content: (
      <div className="text-sm space-y-2">
        <p className="text-gray-500 dark:text-gray-400">Solo cuando hay un impedimento real, no cuando simplemente no tenés ganas de hacerlo.</p>
        <ul className="space-y-1 text-gray-600 dark:text-gray-400">
          <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">•</span> Necesitás algo de otra persona para avanzar</li>
          <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">•</span> Estás esperando una aprobación o material externo</li>
          <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">•</span> Hay un problema técnico o de acceso</li>
        </ul>
        <p className="text-xs font-semibold text-red-600 dark:text-red-400">Siempre agregar el motivo del bloqueo.</p>
      </div>
    ),
  },
  {
    icon: '🔚',
    title: 'Antes de cerrar el día',
    content: (
      <div className="text-sm space-y-2 text-gray-600 dark:text-gray-400">
        <div className="space-y-1.5">
          {[
            'Completar todo lo que terminaste',
            'Pausar lo que queda pendiente',
            'Bloquear con motivo lo que no podés avanzar',
            'Dejar todo registrado antes de hacer clic en "Finalizar jornada"',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className="text-green-500 font-bold flex-shrink-0">✓</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">Las tareas pendientes/pausadas/bloqueadas aparecen automáticamente el día siguiente.</p>
      </div>
    ),
  },
  {
    icon: '🚫',
    title: 'Reglas del equipo',
    content: (
      <div className="grid grid-cols-2 gap-2 text-xs">
        {[
          'No tareas por WhatsApp',
          'No multitarea',
          'No tareas vagas',
          'No listas infinitas',
        ].map(r => (
          <div key={r} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-300 font-medium">
            <span className="text-red-400">✕</span> {r}
          </div>
        ))}
      </div>
    ),
  },
]

export default function Login2() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const resetOk = searchParams.get('reset') === 'ok'

  if (user) {
    navigate('/', { replace: true })
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-xl mx-auto px-6 py-10">

      {/* Login form */}
      <div className="w-full">
        <div className="w-full">

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bienvenido</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Ingresá con tu cuenta de Bliss</p>
          </div>

          {resetOk && (
            <div className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm rounded-lg px-4 py-3 mb-5">
              Contraseña actualizada. Ya podés iniciar sesión.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="tu@blissmkt.ar"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contraseña</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold rounded-lg px-4 py-2.5 transition-colors"
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>

            <div className="text-center">
              <Link
                to="/forgot-password"
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          </form>
        </div>
      </div>

      {/* Guide sections */}
      <div className="mt-8 space-y-4 pb-12">
          {guide.map(section => (
            <div
              key={section.title}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{section.icon}</span>
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{section.title}</h3>
              </div>
              {section.content}
            </div>
          ))}

          {/* Philosophy */}
          <div className="bg-primary-600 dark:bg-primary-700 rounded-2xl p-6 text-center">
            <p className="text-white/70 text-sm mb-1">💡 Filosofía del sistema</p>
            <p className="text-white font-semibold text-lg leading-snug">
              No buscamos hacer más cosas.
            </p>
            <p className="text-white font-semibold text-lg leading-snug">
              Buscamos hacer mejor las cosas importantes.
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
