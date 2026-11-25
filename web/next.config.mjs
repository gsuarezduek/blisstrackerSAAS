/** @type {import('next').NextConfig} */

// Host del backend (Railway en producción, localhost:3001 en dev). Las portadas del
// blog y las imágenes de la landing (logos de clientes, fotos de testimonios) se
// sirven desde ahí como bytes, así que next/image necesita tenerlo permitido.
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const { protocol, hostname, port } = new URL(apiUrl)

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: protocol.replace(':', ''),
        hostname,
        ...(port ? { port } : {}),
        pathname: '/api/**',
      },
    ],
  },
  // El sitio público no necesita el header de versión.
  poweredByHeader: false,
}

export default nextConfig
