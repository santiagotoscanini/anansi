import { createFileRoute } from '@tanstack/react-router'
import { TabError } from '~/components/goals/TabError'
import ValuesManager from '~/components/goals/ValuesManager'
import { prime } from '~/lib/queries/prime'
import { valueBehaviorsAllQueryOptions, valuesQueryOptions } from '~/lib/queries/values'

// The one tab that doesn't touch the goal graph. It reads values from their own
// query rather than from the graph payload, so a value edit here invalidates
// both — see the note on `invalidateValues` in lib/mutations/goals-data.ts.
export const Route = createFileRoute('/app/values')({
  loader: ({ context }) => prime(context.queryClient, valuesQueryOptions(), valueBehaviorsAllQueryOptions()),
  component: ValuesManager,
  errorComponent: TabError,
})
