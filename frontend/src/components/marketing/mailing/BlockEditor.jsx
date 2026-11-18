// Lista de bloques del mail: agregar, editar, reordenar y quitar. Los tipos y
// sus campos son espejo de `sanitizeBlocks` en backend/src/services/mailing/render.js.
import { useRef, useState } from 'react'
import { ArrowUp, ArrowDown, Copy, Trash2 } from 'lucide-react'
import api from '../../../api/client'
import { Icon } from '../../ui/Icon'
import MailTextEditor from './MailTextEditor'
import { inputCls, btnGhost, ErrorNote, apiError } from './ui'

export const BLOCK_CATALOG = [
  { type: 'heading', label: 'Título' },
  { type: 'text',    label: 'Texto' },
  { type: 'image',   label: 'Imagen' },
  { type: 'button',  label: 'Botón' },
  { type: 'divider', label: 'Separador' },
  { type: 'spacer',  label: 'Espacio' },
]

const newId = () => Math.random().toString(36).slice(2, 10)

export function newBlock(type) {
  const id = newId()
  switch (type) {
    case 'heading': return { id, type, text: 'Título', align: 'left', size: 'lg' }
    case 'text':    return { id, type, doc: { type: 'doc', content: [{ type: 'paragraph' }] } }
    case 'image':   return { id, type, url: '', alt: '', href: '', width: 100, align: 'center' }
    case 'button':  return { id, type, label: 'Ver más', href: 'https://', color: null, align: 'center' }
    case 'spacer':  return { id, type, height: 24 }
    default:        return { id, type }
  }
}

function AlignPicker({ value, onChange }) {
  return (
    <select className={`${inputCls} w-28`} value={value} onChange={e => onChange(e.target.value)}>
      <option value="left">Izquierda</option>
      <option value="center">Centro</option>
      <option value="right">Derecha</option>
    </select>
  )
}

function ImageFields({ block, set, uploadUrl }) {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function upload(file) {
    if (!file) return
    setBusy(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post(uploadUrl, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      set({ url: data.url })
    } catch (err) { setError(apiError(err, 'No se pudo subir la imagen')) }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className={inputCls} placeholder="URL de la imagen (https://…)" value={block.url} onChange={e => set({ url: e.target.value })} />
        <button type="button" className={`${btnGhost} whitespace-nowrap border border-gray-300 dark:border-gray-600`} disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Subiendo…' : 'Subir'}
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={e => upload(e.target.files?.[0])} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className={inputCls} placeholder="Texto alternativo" value={block.alt} onChange={e => set({ alt: e.target.value })} />
        <input className={inputCls} placeholder="Link al hacer clic (opcional)" value={block.href} onChange={e => set({ href: e.target.value })} />
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          Ancho
          <input type="range" min={20} max={100} step={5} value={block.width} onChange={e => set({ width: Number(e.target.value) })} />
          {block.width}%
        </label>
        <AlignPicker value={block.align} onChange={align => set({ align })} />
      </div>
      <ErrorNote>{error}</ErrorNote>
    </div>
  )
}

function BlockFields({ block, set, uploadUrl }) {
  switch (block.type) {
    case 'heading':
      return (
        <div className="flex gap-2">
          <input className={inputCls} value={block.text} onChange={e => set({ text: e.target.value })} />
          <select className={`${inputCls} w-28`} value={block.size} onChange={e => set({ size: e.target.value })}>
            <option value="lg">Grande</option>
            <option value="sm">Chico</option>
          </select>
          <AlignPicker value={block.align} onChange={align => set({ align })} />
        </div>
      )
    case 'text':
      return <MailTextEditor value={block.doc} onChange={doc => set({ doc })} />
    case 'image':
      return <ImageFields block={block} set={set} uploadUrl={uploadUrl} />
    case 'button':
      return (
        <div className="grid sm:grid-cols-2 gap-2">
          <input className={inputCls} placeholder="Texto del botón" value={block.label} onChange={e => set({ label: e.target.value })} />
          <input className={inputCls} placeholder="https://…" value={block.href} onChange={e => set({ href: e.target.value })} />
          <div className="flex items-center gap-2">
            <input type="color" className="h-9 w-12 rounded border border-gray-300 dark:border-gray-600 bg-transparent" value={block.color || '#E67A1F'} onChange={e => set({ color: e.target.value })} />
            {block.color && <button type="button" className={btnGhost} onClick={() => set({ color: null })}>Color de marca</button>}
          </div>
          <AlignPicker value={block.align} onChange={align => set({ align })} />
        </div>
      )
    case 'spacer':
      return (
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          Alto
          <input type="range" min={8} max={80} step={4} value={block.height} onChange={e => set({ height: Number(e.target.value) })} />
          {block.height}px
        </label>
      )
    default:
      return <p className="text-xs text-gray-400">Línea divisoria.</p>
  }
}

export default function BlockEditor({ blocks, onChange, uploadUrl, disabled }) {
  const update = (i, patch) => onChange(blocks.map((b, k) => (k === i ? { ...b, ...patch } : b)))
  const move = (i, d) => {
    const j = i + d
    if (j < 0 || j >= blocks.length) return
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const remove = i => onChange(blocks.filter((_, k) => k !== i))
  const duplicate = i => onChange([...blocks.slice(0, i + 1), { ...structuredClone(blocks[i]), id: newId() }, ...blocks.slice(i + 1)])
  const add = (type, at = blocks.length) => onChange([...blocks.slice(0, at), newBlock(type), ...blocks.slice(at)])

  return (
    <fieldset disabled={disabled} className="space-y-2">
      {blocks.map((b, i) => (
        <div key={b.id || i} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40">
          <div className="flex items-center justify-between px-3 pt-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{BLOCK_CATALOG.find(c => c.type === b.type)?.label}</span>
            <div className="flex items-center">
              <button type="button" className={btnGhost} title="Subir" onClick={() => move(i, -1)} disabled={i === 0}><Icon as={ArrowUp} size={13} /></button>
              <button type="button" className={btnGhost} title="Bajar" onClick={() => move(i, 1)} disabled={i === blocks.length - 1}><Icon as={ArrowDown} size={13} /></button>
              <button type="button" className={btnGhost} title="Duplicar" onClick={() => duplicate(i)}><Icon as={Copy} size={13} /></button>
              <button type="button" className={btnGhost} title="Quitar" onClick={() => remove(i)}><Icon as={Trash2} size={13} /></button>
            </div>
          </div>
          <div className="px-3 pb-3 pt-1.5"><BlockFields block={b} set={patch => update(i, patch)} uploadUrl={uploadUrl} /></div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-xs text-gray-500 mr-1">Agregar:</span>
        {BLOCK_CATALOG.map(c => (
          <button key={c.type} type="button" onClick={() => add(c.type)}
            className="text-xs px-2.5 py-1 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-primary-400 hover:text-primary-700">
            + {c.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
