import { apiGet } from '@/lib/api'
import { buildMetadata } from '@/lib/seo'
import { metaFor } from '@/lib/pageMeta'
import LegalDocument from '@/components/legal/LegalDocument'

export const revalidate = 3600

export const metadata = buildMetadata({ ...metaFor('/privacidad'), path: '/privacidad' })

export default async function PrivacidadPage() {
  const doc = await apiGet('/api/legal/privacy_policy', { revalidate: 3600, tags: ['legal'] })
  return <LegalDocument doc={doc} docKey="privacy_policy" fallbackTitle="Política de privacidad" />
}
