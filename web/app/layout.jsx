import Script from 'next/script'
import './globals.css'
import { SITE_URL, siteUrl } from '@/lib/urls'

const GA_ID = process.env.NEXT_PUBLIC_GA_ID || 'G-4QGEYVGY43'

export const metadata = {
  // Resuelve los canonicals y las imágenes de OG relativos contra el dominio canónico
  // (el apex). Antes el canonical de index.html estaba fijo en la home para todas las
  // rutas; ahora cada página declara el suyo con `alternates.canonical`.
  metadataBase: new URL(SITE_URL),
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/logo-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/logo-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        {/* Políticas declaradas en el HTML estático: las lee el bot de verificación de
            Google para el OAuth, que no ejecuta JavaScript. Mismas URLs que ya estaban
            verificadas (el canónico sigue siendo el apex), así no hay que re-verificar. */}
        <link rel="privacy-policy" href={siteUrl('/privacidad')} />
        <link rel="terms-of-service" href={siteUrl('/condiciones')} />
      </head>
      <body className="antialiased">
        {children}

        {/* GA4 después de la hidratación: no compite con el LCP. En la SPA este script
            se cargaba desde index.html con un if por hostname, porque el mismo HTML
            servía la landing y los workspaces. Acá el sitio público es su propio
            proyecto, así que la condición ya no hace falta. */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            gtag('config', '${GA_ID}');`}
        </Script>
      </body>
    </html>
  )
}
