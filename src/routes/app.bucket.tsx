import { createFileRoute } from '@tanstack/react-router'
import BucketList from '~/components/goals/BucketList'
import { TabError } from '~/components/goals/TabError'
import { bucketListQueryOptions } from '~/lib/queries/people'

// People are already loaded by the /app layout; items link to them as "people I
// want to do this with".
export const Route = createFileRoute('/app/bucket')({
  // `?item=<id>` deep-links an item's editor, and `?item=new` its create form,
  // so a bucket-list entry can be linked to directly and survives a reload.
  //
  // Written as an inline function literal, never a call to a generic helper:
  // this module is circular with routeTree.gen.ts, and TypeScript resolves that
  // for a literal but falls back to AnySchema for a generic call — which
  // silently empties the search type at every navigation site. See CLAUDE.md.
  validateSearch: (search: Record<string, unknown>): { item?: string } => ({
    item: typeof search.item === 'string' ? search.item : undefined,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(bucketListQueryOptions()),
  component: BucketList,
  errorComponent: TabError,
})
