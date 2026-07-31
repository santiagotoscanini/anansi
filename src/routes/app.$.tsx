import { createFileRoute, redirect } from '@tanstack/react-router'

// Unknown slugs under /app land on the graph.
//
// Real file routes would 404 these, but the Next version derived the active tab
// from the pathname with a silent fallback, so /app/typo rendered objectives.
// Preserving that means an old or mistyped link still works instead of becoming
// a dead end.
export const Route = createFileRoute('/app/$')({
  beforeLoad: () => {
    throw redirect({ to: '/app' })
  },
})
