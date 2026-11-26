import { createFileRoute } from '@tanstack/react-router'
import Life from '~/components/life/Life'
import { TabError } from '~/components/goals/TabError'
import { goalsDataQueryOptions } from '~/lib/queries/goals'
import { lifeQueryOptions } from '~/lib/queries/life'
import { prime } from '~/lib/queries/prime'

// The Life tab: a life in weeks and its chapters. `?view=<id>` is the view
// shown, `?chapter=<id>|new` a chapter's editor, `?week=YYYY-MM-DD` a week's
// panel. The data is not week-keyed (weeks are calendar days, the same on
// any clock), so it is primed like any tab.
//
// An inline function literal, never a generic helper: see AGENTS.md.
export const Route = createFileRoute('/app/life')({
  validateSearch: (search: Record<string, unknown>): { view?: string; chapter?: string; week?: string } => ({
    view: typeof search.view === 'string' ? search.view : undefined,
    chapter: typeof search.chapter === 'string' ? search.chapter : undefined,
    week: typeof search.week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(search.week) ? search.week : undefined,
  }),
  loader: ({ context }) => prime(context.queryClient, lifeQueryOptions(), goalsDataQueryOptions()),
  component: Life,
  errorComponent: TabError,
})
