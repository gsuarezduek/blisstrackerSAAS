/**
 * Resalta una frase dentro de un título (la parte en itálica subrayada de
 * "Cómo funciona"). Markup puro: server component.
 */
export default function HighlightedTitle({ text, phrase }) {
  const idx = text.toLowerCase().indexOf(phrase.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span className="italic text-primary-500 underline underline-offset-8 decoration-4 decoration-primary-200">
        {text.slice(idx, idx + phrase.length)}
      </span>
      {text.slice(idx + phrase.length)}
    </>
  )
}
