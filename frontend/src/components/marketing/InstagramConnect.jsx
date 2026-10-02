import api from '../../api/client'
import { BRANDS } from './networks/brands'
import ConnectScreen, { OAuthMethod, TokenMethod, ScrapeMethod } from './networks/ConnectScreen'

const BRAND = BRANDS.instagram

const authUrl = projectId => () =>
  api.get('/marketing/integrations/meta/auth-url', { params: { projectId } }).then(r => r.data.url)

const TOKEN_STEPS = (
  <ol className="list-decimal list-inside space-y-1">
    <li>Abrí <span className="font-mono">business.facebook.com</span> → Configuración del negocio.</li>
    <li>Usuarios del sistema → agregá uno (rol Empleado o Admin) y asignale las cuentas de Instagram.</li>
    <li>Generá un token para la app <strong>BlissTracker</strong> con <span className="font-mono">business_management</span>, <span className="font-mono">instagram_basic</span>, <span className="font-mono">instagram_manage_insights</span> y <span className="font-mono">pages_show_list</span>. <strong><span className="font-mono">business_management</span> es clave</strong> para ver las cuentas de clientes.</li>
    <li>Copiá el token y pegalo abajo.</li>
  </ol>
)

export default function ConnectPrompt({ projectId, onConnected }) {
  return (
    <ConnectScreen brand={BRAND} title="Conectá la cuenta de Instagram" subtitle="Elegí cómo querés traer los datos de la cuenta."
      methods={[
        {
          key: 'token', icon: '🔑', title: 'Token de Business Manager', badge: 'recommended',
          description: 'Datos completos vía API (alcance, guardados, historias) con un System User Token.',
          body: (
            <TokenMethod brand={BRAND} accountParam="igAccountId" onConnected={onConnected} steps={TOKEN_STEPS}
              endpoint={`/marketing/projects/${projectId}/integrations/instagram/connect-token`} />
          ),
        },
        {
          key: 'official', icon: '🔗', title: 'Conexión oficial',
          description: 'Instagram Business Login: directo, sin tokens.',
          body: <OAuthMethod brand={BRAND} getAuthUrl={authUrl(projectId)} onConnected={onConnected} cta="Conectar con Instagram" />,
        },
        {
          key: 'scrape', icon: '🔎', title: 'Scraping',
          description: 'Sin conexión: seguidores, publicaciones e interacciones de un perfil público.',
          body: (
            <ScrapeMethod brand={BRAND} onConnected={onConnected}
              endpoint={`/marketing/projects/${projectId}/integrations/instagram/connect-scrape`}
              placeholder="@usuario o https://instagram.com/usuario"
              help="Solo cuentas públicas: las privadas no se pueden analizar." />
          ),
        },
      ]}
    />
  )
}
