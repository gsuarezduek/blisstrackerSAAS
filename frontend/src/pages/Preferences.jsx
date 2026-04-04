import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function Preferences() {
  const { user, updateUser } = useAuth()
  const [weeklyEmail,  setWeeklyEmail]  = useState(true)
  const [dailyInsight, setDailyInsight] = useState(true)
  const [togglingW,    setTogglingW]    = useState(false)
  const [togglingD,    setTogglingD]    = useState(false)
  const [sending,      setSending]      = useState(false)
  const [sendMsg,      setSendMsg]      = useState({ text: '', error: false })
  const [loaded,       setLoaded]       = useState(false)

  useEffect(() => {
    api.get('/profile').then(({ data }) => {
      setWeeklyEmail(data.weeklyEmailEnabled   ?? true)
      setDailyInsight(data.dailyInsightEnabled ?? true)
      setLoaded(true)
    })
  }, [])

  async function handleToggleWeekly() {
    const next = !weeklyEmail
    setTogglingW(true)
    try {
      await api.patch('/profile/preferences', { weeklyEmailEnabled: next })
      setWeeklyEmail(next)
    } catch (_) {}
    finally { setTogglingW(false) }
  }

  async function handleToggleInsight() {
    const next = !dailyInsight
    setTogglingD(true)
    try {
      // Al apagar el insight se apagan también los sub-features
      await api.patch('/profile/preferences', {
        dailyInsightEnabled:  next,
        insightMemoryEnabled: next,
        taskQualityEnabled:   next,
      })
      setDailyInsight(next)
      updateUser({ dailyInsightEnabled: next })
    } catch (_) {}
    finally { setTogglingD(false) }
  }

  async function handleSendNow() {
    setSending(true)
    setSendMsg({ text: '', error: false })
    try {
      await api.post('/profile/weekly-email/send')
      setSendMsg({ text: '¡Email enviado! Revisá tu bandeja de entrada.', error: false })
    } catch (err) {
      setSendMsg({ text: err.response?.data?.error || 'Error al enviar el email.', error: true })
    } finally {
      setSending(false)
    }
  }

  function Toggle({ on, onToggle, disabled }) {
    return (
      <button
        onClick={onToggle}
        disabled={disabled || !loaded}
        title={on ? 'Desactivar' : 'Activar'}
        className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
          on ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`} />
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Preferencias</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Configurá cómo querés usar BlissTracker.</p>
        </div>

        {/* Insight diario con IA */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">

          {/* Toggle maestro */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Insight diario con IA</h2>
                <span className="text-xs bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 rounded-full px-2 py-0.5 font-medium">IA</span>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Un coach de productividad personal basado en GTD que analiza tus tareas cada día y genera recomendaciones concretas y accionables.
              </p>
            </div>
            <Toggle on={dailyInsight} onToggle={handleToggleInsight} disabled={togglingD} />
          </div>

          {/* Sub-features — se dimean si el insight está apagado */}
          <div className={`space-y-0 border-t dark:border-gray-700 transition-opacity duration-200 ${dailyInsight ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>

            {/* Memoria de aprendizaje */}
            <div className="flex items-start gap-3 py-4 border-b dark:border-gray-700">
              <div className="mt-0.5 flex-shrink-0 text-green-500">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Memoria de aprendizaje</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">
                  El sistema aprende de tus patrones semana a semana: cuándo tendés a bloquearte, en qué proyectos rendís mejor y qué días son más productivos. El insight evoluciona con vos.
                </p>
              </div>
            </div>

            {/* Coaching de calidad de tareas */}
            <div className={`flex items-start gap-3 py-4 ${user?.isAdmin ? 'border-b dark:border-gray-700' : ''}`}>
              <div className="mt-0.5 flex-shrink-0 text-green-500">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Coaching de calidad de tareas</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">
                  La IA detecta tareas con descripciones vagas y sugiere reformularlas como acciones concretas según GTD. "Trabajar en web" se convierte en "Enviar 3 opciones de homepage para aprobación".
                </p>
              </div>
            </div>

            {/* Conocimiento de roles (solo admins) */}
            {user?.isAdmin && (
              <div className="flex items-start gap-3 py-4">
                <div className="mt-0.5 flex-shrink-0 text-green-500">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Conocimiento de roles</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">
                    El insight detecta tareas recurrentes esperadas según el rol que no fueron registradas.
                  </p>
                </div>
                <Link
                  to="/admin?tab=role-ai"
                  className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/50 border border-primary-200 dark:border-primary-800 transition-colors whitespace-nowrap"
                >
                  Configurar →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Notificaciones y comunicación */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Notificaciones y comunicación</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">Elegí qué comunicaciones querés recibir por email.</p>

          {/* Toggle resumen semanal */}
          <div className="flex items-start justify-between gap-4 py-4 border-b dark:border-gray-700">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Resumen semanal de productividad</span>
                <span className="text-xs bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 rounded-full px-2 py-0.5 font-medium">IA</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Recibís un análisis de tu semana generado por inteligencia artificial cada <strong className="text-gray-600 dark:text-gray-300">viernes a las 14:00</strong>. Incluye tareas completadas, tiempo por proyecto, insights de productividad y recomendaciones accionables.
              </p>
            </div>
            <Toggle on={weeklyEmail} onToggle={handleToggleWeekly} disabled={togglingW} />
          </div>

          {/* Botón de prueba */}
          <div className="pt-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Enviar resumen ahora</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Genera y envía el resumen de esta semana de forma inmediata.</p>
              </div>
              <button
                onClick={handleSendNow}
                disabled={sending}
                className="flex-shrink-0 flex items-center gap-2 bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/50 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 text-sm font-medium rounded-xl px-4 py-2 transition-colors disabled:opacity-50"
              >
                {sending ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Generando...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                    </svg>
                    Enviar ahora
                  </>
                )}
              </button>
            </div>

            {sendMsg.text && (
              <p className={`mt-3 text-sm rounded-lg px-3 py-2 ${
                sendMsg.error
                  ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              }`}>
                {sendMsg.text}
              </p>
            )}
          </div>
        </div>

      </main>
    </div>
  )
}
