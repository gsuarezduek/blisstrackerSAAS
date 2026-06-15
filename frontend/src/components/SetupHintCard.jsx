import { Link } from 'react-router-dom'

/**
 * Tarjeta-placeholder educativa para tarjetas/métricas que dependen de un
 * prerequisito de configuración rápida (ej: cargar horarios laborales, una URL).
 *
 * Patrón "revelación progresiva": en vez de ocultar la función (el admin nunca
 * la descubre) o de avisar por cada entidad faltante (molesto), se muestra una
 * única tarjeta atenuada que invita a configurar, y desaparece en cuanto hay datos.
 *
 * Props:
 *  - icon      emoji/ícono de la tarjeta
 *  - label     título corto (mismo rol que el `label` de StatCard)
 *  - hint      texto explicativo de qué configurar y por qué
 *  - to        ruta interna (react-router) del call-to-action. Opcional.
 *  - ctaLabel  texto del enlace. Default "Configurar →"
 */
export default function SetupHintCard({ icon, label, hint, to, ctaLabel = 'Configurar →' }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-4 flex items-start gap-4">
      <span className="text-2xl flex-shrink-0 opacity-60">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 leading-tight">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>
        {to && (
          <Link
            to={to}
            className="inline-block text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline mt-1.5"
          >
            {ctaLabel}
          </Link>
        )}
      </div>
    </div>
  )
}
