import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { Columns3, List } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import PeopleDirectory from '~/components/goals/PeopleDirectory'
import RelationshipsBoard from '~/components/goals/RelationshipsBoard'
import { TabError } from '~/components/goals/TabError'
import { ViewSwitch } from '~/components/goals/ViewSwitch'
import { groupTasksQueryOptions } from '~/lib/queries/people'
import { prime } from '~/lib/queries/prime'

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
  /** The board by relationship (the Relationships tab until November 2026) instead of the directory. */
  view: z.enum(['board']).optional(),
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
    return prime(context.queryClient, groupTasksQueryOptions(deps.groupId))
  },
  component: PeopleTab,
  errorComponent: TabError,
})

function PeopleTab() {
  const { t } = useTranslation()
  const { view } = Route.useSearch()
  const navigate = Route.useNavigate()
  const current = view ?? 'list'
  return (
    <div className="relative h-full">
      <div className="absolute top-4 right-4 z-20 md:top-6 md:right-8">
        <ViewSwitch
          label={t('views.label')}
          value={current}
          onChange={(next) =>
            void navigate({ search: (prev) => ({ ...prev, view: next === 'board' ? 'board' : undefined }) })
          }
          options={[
            { id: 'list', label: t('views.list'), icon: List },
            { id: 'board', label: t('views.board'), icon: Columns3 },
          ]}
        />
      </div>
      {current === 'board' ? <RelationshipsBoard /> : <PeopleDirectory />}
    </div>
  )
}
