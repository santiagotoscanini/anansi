import { createFileRoute } from '@tanstack/react-router'
import RelationshipsBoard from '~/components/goals/RelationshipsBoard'
import { TabError } from '~/components/goals/TabError'

export const Route = createFileRoute('/app/relationships')({
  component: RelationshipsBoard,
  errorComponent: TabError,
})
