import { useSearchParams } from 'react-router-dom'
import ConfiguracionGeneral from './ConfiguracionGeneral'
import ConfiguracionFormularioWeb from './ConfiguracionFormularioWeb'

const SECTIONS = [
  { id: 'general',    label: 'General' },
  { id: 'formulario', label: 'Formulario web' },
]

// Página de Configuración de Ventas: reemplaza al viejo modal SalesTeamModal —
// vive como una pestaña más de Ventas.jsx (?tab=configuracion) con su propio
// menú de secciones a la izquierda, para que se sienta como una página propia
// en vez de un modal largo con todo mezclado.
export default function ConfiguracionTab({ onSaved }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const section = SECTIONS.some(s => s.id === searchParams.get('section')) ? searchParams.get('section') : 'general'

  function setSection(id) {
    setSearchParams({ tab: 'configuracion', section: id }, { replace: true })
  }

  return (
    <div className="flex flex-col sm:flex-row gap-6">
      <nav className="sm:w-48 shrink-0">
        <div className="flex sm:flex-col gap-1 overflow-x-auto sm:overflow-visible">
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)}
              className={`text-left px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                section === s.id
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}>
              {s.label}
            </button>
          ))}
        </div>
      </nav>
      <div className="flex-1 min-w-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
        {section === 'general'    && <ConfiguracionGeneral onSaved={onSaved} />}
        {section === 'formulario' && <ConfiguracionFormularioWeb />}
      </div>
    </div>
  )
}
