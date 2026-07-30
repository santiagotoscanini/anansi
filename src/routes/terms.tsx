import { createFileRoute } from '@tanstack/react-router'
import TermsContent, { termsMetadata } from '~/components/legal/TermsContent'

export const Route = createFileRoute('/terms')({
  head: () => ({
    meta: [{ title: termsMetadata.title }, { name: 'description', content: termsMetadata.description }],
  }),
  component: TermsContent,
})
