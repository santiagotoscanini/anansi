import { createFileRoute } from '@tanstack/react-router'
import { Columns3, List } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Horizons from '~/components/goals/Horizons'
import Tasks from '~/components/goals/Tasks'
import { TabError } from '~/components/goals/TabError'
import { ViewSwitch } from '~/components/goals/ViewSwitch'

export type TasksView = 'board' | 'list'

// One tab, two views of the same tasks: `board` (the default) buckets them in
// time, Horizons' columns; `list` is the searchable flat list by goal. Until
// November 2026 they were two tabs; /app/horizons redirects here.
//
// `task` + `goal` together address one TaskModal (the list's editor is scoped
// to its goal, and the list spans all of them). `goal` alone opens the goal's
// modal, which is what the board does.
//
// A hand-written validator rather than a zod schema — see the note in
// login.tsx. It is also tolerant by construction: a hand-edited or truncated
// link renders the tab with no modal open instead of erroring out of a screen
// the user can otherwise use.
export const Route = createFileRoute('/app/tasks')({
  validateSearch: (search: Record<string, unknown>): { task?: string; goal?: string; view?: TasksView } => ({
    task: typeof search.task === 'string' ? search.task : undefined,
    goal: typeof search.goal === 'string' ? search.goal : undefined,
    view: search.view === 'list' ? 'list' : undefined,
  }),
  component: TasksTab,
  errorComponent: TabError,
})

function TasksTab() {
  const { t } = useTranslation()
  const { view = 'board' } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <div className="relative h-full">
      <div className="absolute top-4 right-4 z-20 md:top-6 md:right-8">
        <ViewSwitch
          label={t('views.label')}
          value={view}
          onChange={(next) =>
            void navigate({
              search: (prev) => ({
                ...prev,
                view: next === 'board' ? undefined : next,
                goal: undefined,
                task: undefined,
              }),
            })
          }
          options={[
            { id: 'board', label: t('views.board'), icon: Columns3 },
            { id: 'list', label: t('views.list'), icon: List },
          ]}
        />
      </div>
      {view === 'list' ? <Tasks /> : <Horizons />}
    </div>
  )
}
