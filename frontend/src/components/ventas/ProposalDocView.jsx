import { useMemo } from 'react'
import { PROPOSAL_DOC_CSS, renderProposalDoc } from './proposalDocHtml'

// Dibuja el documento estructurado de una propuesta (Proposal.doc). Todo el HTML sale de
// renderProposalDoc, que escapa cada texto; el CSS está scopeado a `.pd`.
export default function ProposalDocView({ doc, plans, accent, title }) {
  const html = useMemo(() => renderProposalDoc(doc, { plans, accent, title }), [doc, plans, accent, title])
  return (
    <>
      <style>{PROPOSAL_DOC_CSS}</style>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  )
}
