import { apiGet } from '@/lib/api'
import { buildMetadata } from '@/lib/seo'
import { metaFor } from '@/lib/pageMeta'
import LegalDocument from '@/components/legal/LegalDocument'

export const revalidate = 3600 // los legales cambian muy de vez en cuando

export const metadata = buildMetadata({ ...metaFor('/condiciones'), path: '/condiciones' })

export default async function CondicionesPage() {
  const doc = await apiGet('/api/legal/terms_of_service', { revalidate: 3600, tags: ['legal'] })
  return <LegalDocument doc={doc} docKey="terms_of_service" fallbackTitle="Condiciones de uso" />
}
