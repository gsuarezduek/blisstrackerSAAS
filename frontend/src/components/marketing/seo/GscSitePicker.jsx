import { useEffect, useState } from 'react'
import api from '../../../api/client'

// Lo que Google llama `permissionLevel` en sites.list, en castellano.
const PERMISSION_LABEL = {
  siteOwner:          'Propietario',
  siteFullUser:       'Permiso total',
  siteRestrictedUser: 'Permiso restringido',
  siteUnverifiedUser: 'Sin verificar',
}

/**
 * Las propiedades de Search Console que la cuenta conectada puede leer, para elegir
 * una con un click en vez de adivinar la variante del Site URL a mano.
 *
 * El caso que motivó esto: una propiedad de **Dominio** se llama `sc-domain:ejemplo.com`
 * y pedirla como `https://ejemplo.com/` devuelve 403 — son dos propiedades distintas
 * para Google, y desde la UI no había forma de saber cuál de las dos existe.
 */
export default function GscSitePicker({ projectId, current, onPick, picking }) {
  const [state, setState] = useState({ loading: true, sites: null, accountEmail: null, error: null })
  const [picked, setPicked] = useState(null)

  useEffect(() => {
    if (!projectId) return
    const ctrl = new AbortController()
    setState({ loading: true, sites: null, accountEmail: null, error: null })
    api.get(`/marketing/projects/${projectId}/search-console/sites`, { signal: ctrl.signal })
      .then(r => setState({
        loading: false,
        sites: r.data.sites ?? [],
        accountEmail: r.data.accountEmail ?? null,
        current: r.data.current ?? null,
        error: null,
      }))
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return
        setState({
          loading: false, sites: null, accountEmail: null,
          error: err.response?.data?.error ?? 'No se pudieron listar las propiedades.',
        })
      })
    return () => ctrl.abort()
  }, [projectId])

  // `current` del backend ya está normalizado (es lo que realmente se consulta);
  // el prop es el valor crudo guardado, que sirve de respaldo.
  const inUse = state.current ?? current

  if (state.loading) {
    return <p className="text-xs text-gray-400 dark:text-gray-500">Buscando tus propiedades en Search Console…</p>
  }

  if (state.error) {
    return <p className="text-xs text-gray-500 dark:text-gray-400">{state.error}</p>
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Propiedades de{' '}
        <span className="font-medium text-gray-600 dark:text-gray-300">
          {state.accountEmail ?? 'la cuenta conectada'}
        </span>
        {state.sites.length > 0 && ' — elegí una:'}
      </p>

      {state.sites.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Esta cuenta de Google no tiene ninguna propiedad en Search Console. Lo más
          probable es que el sitio esté verificado con otra cuenta: reconectá con esa.
        </p>
      ) : (
        <ul className="space-y-1">
          {state.sites.map(site => {
            const isCurrent = site.siteUrl === inUse
            return (
              <li key={site.siteUrl}>
                <button
                  onClick={() => { setPicked(site.siteUrl); onPick(site.siteUrl) }}
                  disabled={picking || isCurrent}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-xs transition-colors flex items-center gap-2 flex-wrap
                    ${isCurrent
                      ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 cursor-default'
                      : 'border-gray-200 dark:border-gray-700 hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 disabled:opacity-50'}`}
                >
                  <span className="font-mono break-all text-gray-700 dark:text-gray-200">{site.siteUrl}</span>
                  {site.isDomainProperty && (
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 text-[10px]">
                      Dominio
                    </span>
                  )}
                  {site.matchesProject && (
                    <span className="px-1.5 py-0.5 rounded bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300 text-[10px]">
                      coincide con el sitio del proyecto
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {PERMISSION_LABEL[site.permissionLevel] ?? site.permissionLevel ?? ''}
                  </span>
                  {isCurrent && <span className="text-[10px] text-gray-400 ml-auto">en uso</span>}
                  {picking && picked === site.siteUrl && <span className="text-[10px] text-gray-400 ml-auto">…</span>}
                </button>
                {/* Google la lista igual, pero devuelve el mismo 403 al consultarla. */}
                {!site.verified && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 pl-2.5">
                    Verificación pendiente o perdida — Search Console no devuelve datos de esta propiedad hasta reverificarla.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
