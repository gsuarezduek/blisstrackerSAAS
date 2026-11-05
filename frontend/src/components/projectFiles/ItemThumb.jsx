import { Folder, Play } from 'lucide-react'
import { iconFor } from '../../lib/fileIcons'
import { Icon } from '../ui/Icon'

// ─── El cuadrito de un ítem: miniatura si la tiene, ícono por tipo si no ─────
//
// Lo comparten la grilla (<ItemCard>, 56px) y la lista (<ItemRow>, 32px), que
// resuelven igual qué imagen va y qué rótulo lleva encima — lo único que
// cambia es el tamaño.
//
// `posterUrl` es la miniatura liviana que generó el browser al subir (~40KB):
// se prefiere al original siempre que exista. Una imagen vieja, subida antes de
// que hubiera miniaturas, cae a `url` — el original completo, que es lo que
// hacía lenta la grilla. Un video o un PDF sin miniatura no tienen a qué caer,
// así que se quedan con el ícono por tipo (no hay backfill: lo subido antes de
// que esto existiera sigue con el ícono).
export default function ItemThumb({ item, size = 56 }) {
  const isFolder = item.type === 'folder'
  const isImage = !isFolder && item.mimeType?.startsWith('image/')
  const isVideo = !isFolder && item.mimeType?.startsWith('video/')
  const isPdf = !isFolder && item.mimeType === 'application/pdf'
  const thumbUrl = isFolder ? null : (item.posterUrl || (isImage ? item.url : null))
  // El rótulo "PDF" se omite en el tamaño chico, donde no se leería; ahí la
  // extensión del nombre, que está al lado, hace el mismo trabajo.
  const showPdfLabel = isPdf && thumbUrl && size >= 48

  return (
    <div
      style={{ width: size, height: size }}
      className="flex-shrink-0 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-900/40 overflow-hidden relative"
    >
      {thumbUrl ? (
        <>
          {/* draggable={false}: que se arrastre la fila o la tarjeta entera y
              no la imagen sola. */}
          <img src={thumbUrl} alt="" loading="lazy" draggable={false} className="w-full h-full object-cover" />
          {/* Con miniatura, un video y una imagen se ven igual — el ▸ es lo que
              los distingue de un vistazo. */}
          {isVideo && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/25">
              <Icon as={Play} size={Math.max(12, Math.round(size / 3))} className="text-white drop-shadow" />
            </span>
          )}
          {/* Mismo problema con el PDF, que ahora muestra su primera página: sin
              el rótulo, una portada se confunde con una imagen suelta. Va en una
              esquina y no al centro porque lo que importa de una portada es
              poder leerla. */}
          {showPdfLabel && (
            <span className="absolute bottom-0 left-0 px-1 text-[8px] font-semibold tracking-wide bg-black/55 text-white rounded-tr-md leading-[1.4]">
              PDF
            </span>
          )}
        </>
      ) : (
        <Icon
          as={isFolder ? Folder : iconFor(item.mimeType)}
          size={Math.max(16, Math.round(size * 0.54))}
          className={isFolder ? 'text-amber-500' : 'text-gray-400'}
        />
      )}
    </div>
  )
}
