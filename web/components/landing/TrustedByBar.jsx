import { apiAsset } from '@/lib/api'

/**
 * Barra de logos "Trusted by". Los logos salen de GET /api/landing/trusted-companies
 * (SuperAdmin → Landing), pero acá llegan ya resueltos como prop: el fetch lo hace el
 * server component de la página, así los logos viajan en el HTML inicial.
 *
 * Diferencia con la versión de la SPA: ahí, mientras no hubiera logos reales, se
 * pintaban cinco <img> a rutas inexistentes y un onError de JS las reemplazaba por un
 * recuadro con el nombre. Acá el recuadro se decide en el server, que es donde ya se
 * sabe si hay logos o no — sin JS y sin pedir imágenes que van a dar 404.
 */
const PLACEHOLDERS = ['Cliente 1', 'Cliente 2', 'Cliente 3', 'Cliente 4', 'Cliente 5']

export default function TrustedByBar({ clients = [] }) {
  const hasReal = clients.length > 0

  return (
    <section className="py-10 border-y border-gray-100 bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <p className="text-center text-xs uppercase tracking-widest text-gray-500 font-semibold mb-6">
          Agencias y equipos que ya ejecutan con BlissTracker
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6 opacity-60 grayscale">
          {hasReal
            ? clients.map(c => {
                const img = (
                  <img
                    src={apiAsset(c.imageUrl)}
                    alt={c.name}
                    width={120}
                    height={40}
                    loading="lazy"
                    className="h-8 sm:h-10 w-auto object-contain"
                  />
                )
                return c.websiteUrl ? (
                  <a key={c.name} href={c.websiteUrl} target="_blank" rel="noopener noreferrer">{img}</a>
                ) : (
                  <span key={c.name}>{img}</span>
                )
              })
            : PLACEHOLDERS.map(name => (
                <span
                  key={name}
                  className="text-gray-400 font-semibold text-sm border border-dashed border-gray-300 rounded-lg px-4 py-2"
                >
                  {name}
                </span>
              ))}
        </div>
      </div>
    </section>
  )
}
