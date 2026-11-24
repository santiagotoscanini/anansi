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
export const Route = createFileRoute('/app/self')({
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
