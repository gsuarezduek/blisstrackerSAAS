/**
 * Bar de logos "Trusted by". Reemplazar los placeholders por logos reales en /public/clients/.
 *
 * Formato sugerido: PNG transparente, altura natural ~40px, escala de grises.
 * Si tenés <4 logos todavía, podés filtrar el array — la sección sigue siendo agradable.
 */
export default function TrustedByBar() {
  const clients = [
    // TODO: reemplazar con logos reales de clientes.
    { name: 'Cliente 1', src: '/clients/cliente-1.svg' },
    { name: 'Cliente 2', src: '/clients/cliente-2.svg' },
    { name: 'Cliente 3', src: '/clients/cliente-3.svg' },
    { name: 'Cliente 4', src: '/clients/cliente-4.svg' },
    { name: 'Cliente 5', src: '/clients/cliente-5.svg' },
  ]

  return (
    <section className="py-10 border-y border-gray-100 bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <p className="text-center text-xs uppercase tracking-widest text-gray-500 font-semibold mb-6">
          Agencias y equipos que ya ejecutan con BlissTracker
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6 opacity-60 grayscale">
          {clients.map(c => (
            <img
              key={c.name}
              src={c.src}
              alt={c.name}
              className="h-8 sm:h-10 w-auto object-contain"
              onError={(e) => {
                // Placeholder visual mientras no haya logo real
                e.currentTarget.style.display = 'none'
                const fallback = document.createElement('span')
                fallback.className = 'text-gray-400 font-semibold text-sm border border-dashed border-gray-300 rounded-lg px-4 py-2'
                fallback.textContent = c.name
                e.currentTarget.parentNode.insertBefore(fallback, e.currentTarget)
              }}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
