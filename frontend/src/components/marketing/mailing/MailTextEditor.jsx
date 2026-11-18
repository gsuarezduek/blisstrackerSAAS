// Editor del bloque de texto de un mail. Guarda JSON de TipTap (no HTML): el
// servidor lo convierte con el MISMO set de extensiones
// (backend/src/services/mailing/render.js → TEXT_EXTENSIONS). Si se agrega una
// extensión acá, hay que agregarla allá o el texto con esa marca se pierde.
import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import { Bold, Italic, Underline, List, ListOrdered, Link2, Heading2 } from 'lucide-react'
import { Icon } from '../../ui/Icon'
import '../../situation-editor.css'

const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    codeBlock: false,
    code: false,
    blockquote: false,
    horizontalRule: false,
    link: { openOnClick: false, autolink: true },
  }),
  TextStyle,
  Color,
]

function Btn({ active, onClick, title, icon }) {
  return (
    <button type="button" title={title} onMouseDown={e => e.preventDefault()} onClick={onClick}
      className={`p-1.5 rounded ${active ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
      <Icon as={icon} size={14} />
    </button>
  )
}

export default function MailTextEditor({ value, onChange }) {
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: value && value.type === 'doc' ? value : { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate: ({ editor: e }) => onChange(e.getJSON()),
    editorProps: { attributes: { class: 'min-h-[80px] px-3 py-2 text-sm text-gray-800 dark:text-gray-100 focus:outline-none' } },
  })

  // Si el bloque cambia desde afuera (deshacer, duplicar), sincronizar.
  useEffect(() => {
    if (!editor || !value) return
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(value)) editor.commands.setContent(value, { emitUpdate: false })
  }, [value, editor])

  if (!editor) return null

  function setLink() {
    const prev = editor.getAttributes('link').href || 'https://'
    const url = window.prompt('URL del link (vacío para quitarlo)', prev)
    if (url === null) return
    if (!url.trim()) editor.chain().focus().unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }

  return (
    <div className="situation-editor rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900">
      <div className="flex flex-wrap gap-0.5 border-b border-gray-200 dark:border-gray-700 px-1.5 py-1">
        <Btn icon={Bold} title="Negrita" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <Btn icon={Italic} title="Cursiva" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <Btn icon={Underline} title="Subrayado" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
        <Btn icon={Heading2} title="Subtítulo" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <Btn icon={List} title="Lista" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <Btn icon={ListOrdered} title="Lista numerada" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <Btn icon={Link2} title="Link" active={editor.isActive('link')} onClick={setLink} />
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
