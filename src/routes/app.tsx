import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import AppShell from '~/components/goals/AppShell'
import { goalsDataQueryOptions } from '~/lib/queries/goals'
import { groupsQueryOptions, peopleQueryOptions } from '~/lib/queries/people'
import { meQueryOptions, sessionQueryOptions } from '~/lib/queries/session'

// The authenticated shell. Every tab is a child route, so the sidebar renders
// once and survives navigation instead of remounting per tab.
//
// `modal` sits here rather than on a tab route because Profile and Import are
// reachable from the user menu on every screen; putting them on the layout
// means /app/self?modal=profile and /app/pulse?modal=profile both work without
// each tab having to redeclare the param.
const appSearchSchema = z.object({
  modal: z.enum(['profile', 'import']).optional(),
})

export const Route = createFileRoute('/app')({
  validateSearch: appSearchSchema,

  // The auth guard. This runs before any loader, on the server during SSR, so
  // an unauthenticated request is a redirect in the HTTP response — not a flash
  // of the dashboard followed by a client-side bounce, which is what the
  // useEffect check in the Next version did.
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions())
    if (!session) {
      throw redirect({ to: '/login', search: { next: location.href } })
    }
    return { userId: session.userId }
  },

  // Everything the shell itself renders, prefetched in parallel. Tab routes add
  // their own on top. `me` drives the user pill; the other three drive the
  // sidebar's group list and its per-group counts, which span both people and
  // tasks and therefore need the goal payload too.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(meQueryOptions()),
      context.queryClient.ensureQueryData(goalsDataQueryOptions()),
      context.queryClient.ensureQueryData(groupsQueryOptions()),
      context.queryClient.ensureQueryData(peopleQueryOptions(false)),
    ]),

  component: AppLayout,
})

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
