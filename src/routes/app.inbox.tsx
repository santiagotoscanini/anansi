import { createFileRoute } from '@tanstack/react-router'
import Inbox from '~/components/goals/Inbox'
import { TabError } from '~/components/goals/TabError'
import { prime } from '~/lib/queries/prime'
import { capturesQueryOptions } from '~/lib/queries/captures'
import { openQuestionsQueryOptions } from '~/lib/queries/self'

// The Inbox: everything captured, and where it went. `?capture=<id>` marks one
// (the link a TickTick task carries back); `?archived=1` shows archived ones too.
// Open questions are here for the "send to a question" picker.
//
// An inline function literal, never a generic helper: see app.bucket.tsx.
export const Route = createFileRoute('/app/inbox')({
  validateSearch: (search: Record<string, unknown>): { capture?: string; archived?: true } => ({
    capture: typeof search.capture === 'string' && search.capture ? search.capture : undefined,
    archived: search.archived === true || search.archived === 1 || search.archived === '1' ? true : undefined,
  }),
  loader: ({ context }) => prime(context.queryClient, capturesQueryOptions(), openQuestionsQueryOptions()),
  component: Inbox,
  errorComponent: TabError,
})
