import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import PeopleDirectory from '~/components/goals/PeopleDirectory'
import { TabError } from '~/components/goals/TabError'
import { groupTasksQueryOptions } from '~/lib/queries/people'

// The filter is a search param rather than component state because the sidebar
// drives it from outside this route — clicking "Family" in the group list is a
// navigation, and the highlight has to survive a reload and a shared link.
//
// It arrives flattened. Internally this was a discriminated union
// (`{kind:'group', groupId}`), which does not survive a query string: there is
// no way to express "groupId exists only when filter === 'group'" in a URL, so
// the pair is validated independently and `groupId` is simply ignored for the
// other two filters.
const peopleSearchSchema = z.object({
  filter: z.enum(['all', 'uncategorized', 'group']).default('all'),
  groupId: z.string().optional(),
  /** Deep link straight into one person's modal. */
  person: z.string().optional(),
})

export const Route = createFileRoute('/app/people')({
  validateSearch: peopleSearchSchema,
  // Keep `?filter=all` out of the URL — it is the default, and without this
  // every visit to the People tab writes a redundant param into the address bar.
  search: { middlewares: [stripSearchParams({ filter: 'all' })] },

  loaderDeps: ({ search }) => ({ filter: search.filter, groupId: search.groupId }),
  loader: ({ context, deps }) => {
    // People and groups come from the /app layout. Only the group's task list is
    // specific to this route, and only when a group is actually selected.
    if (deps.filter !== 'group' || !deps.groupId) return
    return context.queryClient.ensureQueryData(groupTasksQueryOptions(deps.groupId))
  },
  component: PeopleDirectory,
  errorComponent: TabError,
})
