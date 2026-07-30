import { createFileRoute } from '@tanstack/react-router'
import PrivacyContent, { privacyMetadata } from '~/components/legal/PrivacyContent'

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [{ title: privacyMetadata.title }, { name: 'description', content: privacyMetadata.description }],
  }),
  component: PrivacyContent,
})
