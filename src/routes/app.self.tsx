import { createFileRoute } from '@tanstack/react-router'
import Self from '~/components/goals/Self'
import { TabError } from '~/components/goals/TabError'
import { selfListItemsQueryOptions, selfQueryOptions } from '~/lib/queries/self'
import { valuesQueryOptions } from '~/lib/queries/values'

// `self` resolving to null is the normal state for a new account, not an error
// — the page renders untouched sections as clean pages rather than as
// unfinished forms. Values are here because Self tags entries with them.
export const Route = createFileRoute('/app/self')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(selfQueryOptions()),
      context.queryClient.ensureQueryData(selfListItemsQueryOptions()),
      context.queryClient.ensureQueryData(valuesQueryOptions()),
    ]),
  component: Self,
  errorComponent: TabError,
})
