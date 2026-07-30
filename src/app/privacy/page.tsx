import PrivacyContent, { privacyMetadata } from '~/components/legal/PrivacyContent'

// Next's half of the shared legal page. The body lives in the component so
// src/routes/privacy.tsx can render the exact same markup while both stacks
// coexist; this file is deleted with the rest of src/app in phase 3.6.
export const metadata = privacyMetadata

export default function PrivacyPage() {
  return <PrivacyContent />
}
