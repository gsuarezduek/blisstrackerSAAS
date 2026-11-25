import Link from 'next/link'
import { buildMetadata } from '@/lib/seo'
import { metaFor } from '@/lib/pageMeta'
import LegalPage from '@/components/legal/LegalPage'

export const metadata = buildMetadata({ ...metaFor('/eliminar-datos'), path: '/eliminar-datos' })

/**
 * Instrucciones para pedir la eliminación de datos. Estática (no depende del backend),
 * a diferencia de /condiciones y /privacidad. Es la URL que está declarada ante Meta
 * como "Data Deletion Instructions", así que el path no se cambia.
 */
export default function EliminarDatosPage() {
  return (
    <LegalPage
      title="Eliminación de datos"
      subtitle="Cómo solicitar que eliminemos tus datos de BlissTracker."
    >
      <div className="text-sm leading-relaxed text-gray-300">
        <p className="mb-8">
          BlissTracker es una plataforma multi-tenant: cada cliente de una agencia tiene su propio
          &quot;workspace&quot; independiente. Según tu situación, hay dos caminos distintos.
        </p>

        <h2 className="text-xl font-semibold text-white mt-10 mb-3">
          1. Si administrás un workspace (owner)
        </h2>
        <p className="mb-3">
          Podés eliminar todo el workspace, con sus usuarios y datos, directamente desde la app:
        </p>
        <ol className="list-decimal list-inside space-y-1.5 mb-4">
          <li>Entrá a <strong className="text-gray-200">Preferencias → Globales</strong>.</li>
          <li>Hacé clic en <strong className="text-gray-200">&quot;Eliminar workspace&quot;</strong> y confirmá escribiendo el nombre del workspace.</li>
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
          con el asunto <strong className="text-gray-200">&quot;Eliminación de datos&quot;</strong>, indicando:
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
          <Link href="/privacidad" className="text-orange-400 hover:text-orange-300 underline">
            Política de Privacidad
          </Link>.
        </p>
      </div>
    </LegalPage>
  )
}
