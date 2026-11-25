/**
 * Inyecta uno o varios JSON-LD en el HTML. Vive en components/ y no en lib/seo.js para
 * que ese archivo quede JavaScript puro (sin JSX) y lo pueda importar un test sin
 * necesitar transformación de React.
 */
export default function JsonLd({ schema }) {
  const list = Array.isArray(schema) ? schema : [schema]
  return list.map((s, i) => (
    <script
      key={i}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(s) }}
    />
  ))
}
