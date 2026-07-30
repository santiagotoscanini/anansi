import { queryOptions } from '@tanstack/react-query'
import { listSelfListItems } from '~/server/fn/self-list-items.fn'
import { getSelf } from '~/server/fn/self.fn'
import { qk } from './keys'

/**
 * The prose half of the Self page — null until the user writes something.
 *
 * Null is the normal state for a new account, not an error. The page renders
 * empty sections as clean pages rather than as unfinished forms, so callers
 * should not treat this resolving to null as anything to recover from.
 */
export const selfQueryOptions = () =>
  queryOptions({
    queryKey: qk.self,
    queryFn: ({ signal }) => getSelf({ signal }),
  })

/**
 * The list half: every kind in one call, ordered by kind then position.
 *
 * One query rather than eight because the page renders all of them together and
 * the rows are small; the client groups by `kind`.
 */
export const selfListItemsQueryOptions = () =>
  queryOptions({
    queryKey: qk.selfListItems,
    queryFn: ({ signal }) => listSelfListItems({ signal }),
  })
