import TermsContent, { termsMetadata } from '~/components/legal/TermsContent'

// Next's half of the shared legal page — see src/app/privacy/page.tsx.
export const metadata = termsMetadata

export default function TermsPage() {
  return <TermsContent />
}
