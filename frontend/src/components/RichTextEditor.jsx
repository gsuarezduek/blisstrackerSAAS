/**
 * RichTextEditor — editor WYSIWYG reutilizable basado en Tiptap.
 * Usado en ProjectSituation y ReportViewer.
 *
 * Props:
 *   defaultContent  — HTML inicial (string)
 *   onChange(html)  — callback en cada cambio (opcional)
 *   minHeight       — altura mínima del área de texto (px, default 140)
 *   placeholder     — texto placeholder cuando está vacío
 */

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import { TableKit } from '@tiptap/extension-table'
import { useEffect } from 'react'
import './situation-editor.css'

export const COLORS = [
  '#111827', // negro
  '#ef4444', // rojo
  '#f97316', // naranja
  '#eab308', // amarillo
  '#22c55e', // verde
  '#3b82f6', // azul
  '#8b5cf6', // violeta
  '#ec4899', // rosa
  '#6b7280', // gris
]

export function ToolBtn({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      className={`px-2 py-1 text-xs rounded font-medium transition-colors select-none ${
        active
          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

export function Toolbar({ editor }) {
  if (!editor) return null
  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 dark:border-gray-600 flex-wrap bg-gray-50 dark:bg-gray-750 rounded-t-xl">
      <ToolBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrita">
        <strong>B</strong>
      </ToolBtn>
      <ToolBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Cursiva">
        <em>I</em>
      </ToolBtn>

      <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />

      <ToolBtn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Título">
        H2
      </ToolBtn>
      <ToolBtn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Subtítulo">
        H3
      </ToolBtn>

      <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />

      <ToolBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista con viñetas">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
          <path fillRule="evenodd" d="M6 4.75A.75.75 0 016.75 4h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 4.75zM6 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 10zm0 5.25a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75a.75.75 0 01-.75-.75zM2.5 5.5a1 1 0 100-2 1 1 0 000 2zm0 5.5a1 1 0 100-2 1 1 0 000 2zm0 5a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
      </ToolBtn>
      <ToolBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Lista numerada">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
          <path fillRule="evenodd" d="M12 4.75A.75.75 0 0112.75 4h4.5a.75.75 0 010 1.5h-4.5A.75.75 0 0112 4.75zm0 5.5A.75.75 0 0112.75 10h4.5a.75.75 0 010 1.5h-4.5A.75.75 0 0112 10.25zm0 5a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75zM2.68 4.51l.77-.27a.75.75 0 011.02.7v3.3a.75.75 0 01-1.5 0V5.64L2.5 5.72a.75.75 0 01-.5-1.41l.68-.24v.43zm-.44 7.22a.75.75 0 01.58-.72c.5-.11.88-.26 1.12-.44.13-.1.2-.2.23-.3a.75.75 0 011.46.25c-.07.43-.3.78-.62 1.04-.24.19-.52.33-.83.44v.41h1a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5h.21a3.06 3.06 0 01-.71-.5.75.75 0 01-.01-1.18zM2.81 15.75a.75.75 0 01.69-.75 2.7 2.7 0 001.15-.35.75.75 0 01.6 1.37 4.2 4.2 0 01-1.71.48.75.75 0 01-.73-.75z" clipRule="evenodd" />
        </svg>
      </ToolBtn>

      <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />

      {/* Línea horizontal */}
      <ToolBtn active={false} onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Línea separadora">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
          <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 10z" clipRule="evenodd" />
        </svg>
      </ToolBtn>

      <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />

      {/* Colores */}
      <div className="flex items-center gap-1">
        {COLORS.map(color => (
          <button
            key={color}
            type="button"
            title={color}
            onMouseDown={e => { e.preventDefault(); editor.chain().focus().setColor(color).run() }}
            className="w-4 h-4 rounded-full border border-white dark:border-gray-700 shadow-sm hover:scale-125 transition-transform flex-shrink-0"
            style={{ backgroundColor: color }}
          />
        ))}
        <button
          type="button"
          title="Color por defecto"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().unsetColor().run() }}
          className="w-4 h-4 rounded-full border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 hover:scale-125 transition-transform text-[8px] flex items-center justify-center text-gray-500"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export default function RichTextEditor({ defaultContent = '', onChange, onBlur, minHeight = 140, autoFocus = true, resizable = false }) {
  const editor = useEditor({
    extensions: [StarterKit, TextStyle, Color, TableKit.configure({ table: { resizable: false } })],
    content: defaultContent,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
    onBlur: () => {
      onBlur?.()
    },
  })

  // Sincronizar si el contenido inicial cambia desde afuera
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (defaultContent !== current) {
      editor.commands.setContent(defaultContent || '', false)
    }
  }, [defaultContent]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editor && autoFocus) {
      setTimeout(() => editor.commands.focus('end'), 0)
    }
  }, [editor, autoFocus])

  const contentStyle = resizable
    ? { minHeight, maxHeight: 800, height: minHeight, resize: 'vertical', overflow: 'auto' }
    : { minHeight }

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
      <Toolbar editor={editor} />
      <EditorContent
        editor={editor}
        className="situation-editor p-3 text-sm text-gray-800 dark:text-gray-200 focus:outline-none"
        style={contentStyle}
      />
    </div>
  )
}
