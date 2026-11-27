// Mismo array de extensiones Tiptap que frontend/src/components/RichTextEditor.jsx
// (StarterKit, TextStyle, Color, Highlight multicolor, TableKit no-resizable, Link
// autolink) — necesario acá para que el servidor pueda derivar HTML/JSON desde un
// Y.Doc con el MISMO schema de ProseMirror que usa el editor del cliente. Si el
// editor cambia sus extensiones, actualizar acá también o el HTML derivado puede
// divergir del que generaría el editor (ver CollaborativeRichTextEditor.jsx).
const StarterKit = require('@tiptap/starter-kit').default
const { Color, TextStyle } = require('@tiptap/extension-text-style')
const { TableKit } = require('@tiptap/extension-table')
const Link = require('@tiptap/extension-link').default
const Highlight = require('@tiptap/extension-highlight').default

const collabExtensions = [
  // StarterKit v3 ya trae Link: se apaga ahí porque va aparte con su configuración
  // (dos extensiones con el mismo nombre → "Duplicate extension names found: ['link']").
  StarterKit.configure({ link: false }),
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  TableKit.configure({ table: { resizable: false } }),
  Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
]

module.exports = { collabExtensions }
