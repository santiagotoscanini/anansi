import { createFileRoute } from '@tanstack/react-router'
import { TabError } from '~/components/goals/TabError'
import WeeklyRetrospective from '~/components/goals/WeeklyRetrospective'

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/

// `?week=YYYY-MM-DD` makes a past retrospective linkable. Absent means "this
// week", resolved in the component rather than defaulted here — see the
// timezone note in app.pulse.tsx for why the week is not computed in a loader,
// and login.tsx for why an absent param is not filled in by the validator.
export const Route = createFileRoute('/app/sync')({
  validateSearch: (search: Record<string, unknown>): { week?: string } => ({
    week: typeof search.week === 'string' && WEEK_RE.test(search.week) ? search.week : undefined,
  }),
  component: WeeklyRetrospective,
  errorComponent: TabError,
})
