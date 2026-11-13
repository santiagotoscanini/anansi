import { createFileRoute } from '@tanstack/react-router'
import Journal from '~/components/goals/Journal'
import { TabError } from '~/components/goals/TabError'
import { isCalendarDay } from '~/lib/journal'

// `?day=YYYY-MM-DD` makes a past day linkable. Absent means "today", which is
// the browser's calendar day and so is resolved in the component, never here:
// a loader also runs on the server, whose clock is UTC (see app.pulse.tsx).
// That is also why nothing is prefetched. People come from the /app layout.
//
// An inline function literal, never a generic helper: see app.bucket.tsx.
export const Route = createFileRoute('/app/journal')({
  validateSearch: (search: Record<string, unknown>): { day?: string } => ({
    day: typeof search.day === 'string' && isCalendarDay(search.day) ? search.day : undefined,
  }),
  component: Journal,
  errorComponent: TabError,
})
