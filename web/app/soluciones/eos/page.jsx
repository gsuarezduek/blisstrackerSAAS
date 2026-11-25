import { buildMetadata } from '@/lib/seo'
import { metaFor } from '@/lib/pageMeta'
import { SOLUTIONS } from '@/lib/solutionsData'
import SolutionPage from '@/components/landing/SolutionPage'

export const metadata = buildMetadata({ ...metaFor('/soluciones/eos'), path: '/soluciones/eos' })

export default function Page() {
  return <SolutionPage solution={SOLUTIONS.eos} breadcrumbName="EOS / Traction" />
}
