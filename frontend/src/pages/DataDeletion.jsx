import { Link } from 'react-router-dom'

/**
 * Página pública con instrucciones concretas para solicitar la eliminación de datos.
 * Estática (no depende del backend) — a diferencia de /condiciones y /privacidad,
 * que se editan desde SuperAdmin → Legal.
 */
export default function DataDeletion() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link to="/" className="text-sm text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
            Volver al inicio
          </Link>
          <span className="text-sm font-semibold text-gray-300">BlissTracker</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12 text-sm leading-relaxed text-gray-300">
        <h1 className="text-3xl font-bold text-white mb-2">Eliminación de datos</h1>
        <p className="text-gray-500 mb-10">
          Cómo solicitar que eliminemos tus datos de BlissTracker.
        </p>

        <p className="mb-8">
          BlissTracker es una plataforma multi-tenant: cada cliente de una agencia tiene su propio
          "workspace" independiente. Según tu situación, hay dos caminos distintos.
        </p>

        <h2 className="text-xl font-semibold text-white mt-10 mb-3">
          1. Si administrás un workspace (owner)
        </h2>
        <p className="mb-3">
          Podés eliminar todo el workspace, con sus usuarios y datos, directamente desde la app:
        </p>
        <ol className="list-decimal list-inside space-y-1.5 mb-4">
          <li>Entrá a <strong className="text-gray-200">Preferencias → Globales</strong>.</li>
          <li>Hacé clic en <strong className="text-gray-200">"Eliminar workspace"</strong> y confirmá escribiendo el nombre del workspace.</li>
          <li>La eliminación queda programada para <strong className="text-gray-200">48 horas</strong> después. En ese lapso podés cancelarla desde el mismo lugar, o desde el link del email de aviso que recibe el equipo.</li>
          <li>Pasadas las 48 horas, el borrado es automático y permanente: usuarios, tareas, proyectos, integraciones conectadas (incluye credenciales de Instagram, Facebook, Meta Ads, Google) y el resto de los datos asociados al workspace.</li>
        </ol>

        <h2 className="text-xl font-semibold text-white mt-10 mb-3">
          2. Si no administrás el workspace, o querés pedir la eliminación de tus datos personales
        </h2>
        <p className="mb-3">
          Hoy este caso no tiene un botón de autogestión dentro de la app — lo procesamos
          manualmente. Escribinos a{' '}
          <a href="mailto:soporte@blisstracker.app" className="text-orange-400 hover:text-orange-300 underline">
            soporte@blisstracker.app
          </a>{' '}
          con el asunto <strong className="text-gray-200">"Eliminación de datos"</strong>, indicando:
        </p>
        <ul className="list-disc list-inside space-y-1.5 mb-4">
          <li>Tu nombre completo</li>
          <li>El email con el que estás registrado en BlissTracker</li>
          <li>El nombre (o subdominio) del workspace al que pertenecés</li>
          <li>Qué querés que eliminemos: tu cuenta completa, o un dato puntual</li>
        </ul>
        <p className="mb-4">
          Confirmamos por email cuando el pedido fue procesado, dentro de los{' '}
          <strong className="text-gray-200">5 días hábiles</strong> siguientes a tu solicitud.
        </p>

        <p className="text-gray-500 mt-10">
          Para más detalle sobre qué datos recolectamos y cómo los usamos, consultá nuestra{' '}
          <Link to="/privacidad" className="text-orange-400 hover:text-orange-300 underline">
            Política de Privacidad
          </Link>.
        </p>
      </main>
    </div>
  )
}
