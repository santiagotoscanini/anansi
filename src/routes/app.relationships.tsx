import { createFileRoute, redirect } from '@tanstack/react-router'

// The Relationships board is the board view of the People tab since November
// 2026. Kept so old links and bookmarks land there.
export const Route = createFileRoute('/app/relationships')({
  beforeLoad: () => {
    throw redirect({ to: '/app/people', search: { view: 'board' }, replace: true })
  },
})
