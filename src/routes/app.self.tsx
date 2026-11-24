import { createFileRoute } from '@tanstack/react-router'
import Self from '~/components/goals/Self'
import { TabError } from '~/components/goals/TabError'
import { prime } from '~/lib/queries/prime'
import { goalsDataQueryOptions } from '~/lib/queries/goals'
import { peopleQueryOptions } from '~/lib/queries/people'
import {
  openQuestionsQueryOptions,
  personalityResultsQueryOptions,
  selfListItemsQueryOptions,
  selfQueryOptions,
} from '~/lib/queries/self'
import { valuesQueryOptions } from '~/lib/queries/values'

// `self` resolving to null is the normal state for a new account, not an error
// — the page renders untouched sections as clean pages rather than as
// unfinished forms. Values are here because Self tags entries with them;
// goals and people because open questions link to them.
export type SelfTab = 'portrait' | 'patterns' | 'questions' | 'personality'

export const Route = createFileRoute('/app/self')({
  // `?tab=`: the page is in four parts; the portrait (the default) has no param.
  validateSearch: (search: Record<string, unknown>): { tab?: Exclude<SelfTab, 'portrait'> } => ({
    tab:
      search.tab === 'patterns' || search.tab === 'questions' || search.tab === 'personality' ? search.tab : undefined,
  }),
  loader: ({ context }) =>
    prime(
      context.queryClient,
      selfQueryOptions(),
      selfListItemsQueryOptions(),
      valuesQueryOptions(),
      openQuestionsQueryOptions(),
      personalityResultsQueryOptions(),
      goalsDataQueryOptions(),
      peopleQueryOptions(false),
    ),
  component: Self,
  errorComponent: TabError,
})
