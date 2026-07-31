import { createFileRoute } from '@tanstack/react-router'
import BucketList from '~/components/goals/BucketList'
import { TabError } from '~/components/goals/TabError'
import { bucketListQueryOptions } from '~/lib/queries/people'

// People are already loaded by the /app layout; items link to them as "people I
// want to do this with".
export const Route = createFileRoute('/app/bucket')({
  loader: ({ context }) => context.queryClient.ensureQueryData(bucketListQueryOptions()),
  component: BucketList,
  errorComponent: TabError,
})
