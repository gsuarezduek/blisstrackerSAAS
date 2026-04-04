export default function AvatarLightbox({ src, alt, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <img
        src={src}
        alt={alt}
        className="w-64 h-64 rounded-full object-cover shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}
