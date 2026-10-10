import { useState } from 'react'
import { NetworkMark } from './ui'
import { connectionMode } from './format'

const MODE = {
  official: { text: 'API oficial',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  token:    { text: 'Token de Business Manager', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  scrape:   { text: 'Scraping · datos públicos', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('es-AR')
}

// El label de un link puede venir con %20/%C2%A1 (ej. texto prellenado de un
// wa.me puesto como "sitio" en la bio) — se decodifica para que se lea como
// texto normal; el truncate de abajo se encarga de que no se desborde.
function readableLabel(label) {
  if (!label) return label
  try { return decodeURIComponent(label) } catch { return label }
}

/**
 * Encabezado de cuenta conectada, igual para todas las redes y anuncios:
 * foto/sello, nombre, detalle, link al perfil, cómo está conectada y cuándo
 * entraron los datos, más las acciones (Actualizar, Cambiar página…) y Desconectar.
 *
 * @param {object}   brand
 * @param {object}   integration     ProjectIntegration (connectedAt, scopes)
 * @param {string}   [avatarUrl]
 * @param {string}   name
 * @param {string}   [profileUrl]    si viene, el nombre es clickable y abre el perfil en la red
 * @param {boolean}  [verified]
 * @param {ReactNode}[subtitle]      línea secundaria (siguiendo, vistas totales…)
 * @param {object}   [link]          { href, label } — link secundario (ej. sitio en la bio)
 * @param {string}   [dataAt]        fecha de los datos mostrados (último scrape)
 * @param {object[]} [actions]       [{ key, label, onClick, busy, busyLabel }]
 * @param {ReactNode}[children]      bio / descripción
 */
export default function AccountHeader({
  brand, integration, avatarUrl, name, profileUrl, verified, subtitle, link, dataAt,
  actions = [], onDisconnect, disconnecting, children,
}) {
  const [imgError, setImgError] = useState(false)
  const mode = MODE[connectionMode(integration)]
  const rounded = brand.square ? 'rounded-xl' : 'rounded-full'

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5">
      <div className="flex items-start gap-4">
        {avatarUrl && !imgError
          ? <img src={avatarUrl} alt="" onError={() => setImgError(true)} referrerPolicy="no-referrer"
              className={`w-14 h-14 ${rounded} object-cover border border-gray-200 dark:border-gray-700 bg-white shrink-0`} />
          : <NetworkMark brand={brand} />}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-x-4 gap-y-2 flex-wrap">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                {profileUrl ? (
                  <a href={profileUrl} target="_blank" rel="noopener noreferrer" title="Ver perfil"
                    className="truncate hover:underline hover:text-primary-600 dark:hover:text-primary-400">
                    {name || brand.label}
                  </a>
                ) : (
                  <span className="truncate">{name || brand.label}</span>
                )}
                {verified && <span className="text-sm" style={{ color: brand.color }} title="Cuenta verificada">✓</span>}
              </p>
              {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
              {link?.href && (
                <a href={link.href} target="_blank" rel="noopener noreferrer" title={link.href}
                  className="text-xs text-primary-600 dark:text-primary-400 hover:underline truncate block max-w-full">
                  {readableLabel(link.label)}
                </a>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {actions.map(a => (
                <button key={a.key} type="button" onClick={a.onClick} disabled={a.busy}
                  className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors disabled:opacity-50">
                  {a.busy ? (a.busyLabel ?? 'Actualizando…') : a.label}
                </button>
              ))}
              {onDisconnect && (
                <button type="button" onClick={onDisconnect} disabled={disconnecting}
                  className="text-xs font-medium text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50">
                  {disconnecting ? 'Desconectando…' : 'Desconectar'}
                </button>
              )}
            </div>
          </div>

          {children}

          <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-gray-400 dark:text-gray-500">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${mode.cls}`}>{mode.text}</span>
            {integration?.connectedAt && <span>Conectado el {fmtDate(integration.connectedAt)}</span>}
            {dataAt && <span>· Datos del {fmtDate(dataAt)}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

// Bio/descripción recortada a 2 líneas, para pasar como children.
export function AccountBio({ children }) {
  if (!children) return null
  return <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5 line-clamp-2 whitespace-pre-line">{children}</p>
}
