// Header clickeable compartido por las secciones colapsables del Lead (Notas,
// Investigación, Historial): arrancan cerradas (menos ruido visual en la
// ficha) con un punto que indica si hay contenido adentro, sin tener que
// desplegar la sección para saberlo.
export default function CollapsibleSectionHeader({ title, hasContent, open, onToggle, extra }) {
  return (
    <button onClick={onToggle} className="w-full flex items-center justify-between gap-2 text-left">
      <span className="flex items-center gap-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
        {title}
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${hasContent ? 'bg-primary-500' : 'bg-gray-200 dark:bg-gray-600'}`}
          title={hasContent ? 'Tiene contenido' : 'Sin contenido todavía'}
        />
        {extra}
      </span>
      <span className={`text-gray-400 text-xs shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
    </button>
  )
}
