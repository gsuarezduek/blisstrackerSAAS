const LANDING_URL = 'https://blisstracker.app'

// Footer institucional del portal de cliente — visible en TODA la experiencia
// (pantalla de login + las 6 pestañas), no solo en Informes. Es un solo link
// grande a la landing de BlissTracker, invitando a crear su propio workspace.
export default function PortalFooter() {
  const year = new Date().getFullYear()
  return (
    <a
      href={LANDING_URL}
      target="_blank"
      rel="noreferrer"
      className="block text-center py-6 text-xs text-gray-400 hover:text-gray-500 transition-colors"
    >
      <p>© {year} <span className="font-semibold text-gray-500">BlissTracker</span> - Algunos derechos reservados</p>
      <p className="mt-0.5">Tu equipo puede ejecutar mejor. <span className="font-semibold text-gray-500">Empezá hoy.</span></p>
    </a>
  )
}
