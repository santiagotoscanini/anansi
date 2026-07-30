import { queryOptions } from '@tanstack/react-query'
import { listAllValueBehaviors, listValueBehaviors } from '~/server/fn/value-behaviors.fn'
import { listValues } from '~/server/fn/values.fn'
import { qk } from './keys'

export const valuesQueryOptions = () =>
  queryOptions({
    queryKey: qk.values,
    queryFn: ({ signal }) => listValues({ signal }),
  })

/**
 * Every behaviour across every value.
 *
 * ValuesManager renders all values at once, so it wants this rather than N
 * per-value queries. `valueBehaviorsForQueryOptions` exists for callers that
 * genuinely hold a single value id; both live under the `value-behaviors` key
 * root so one invalidation covers them.
 */
export const valueBehaviorsAllQueryOptions = () =>
  queryOptions({
    queryKey: qk.valueBehaviorsAll,
    queryFn: ({ signal }) => listAllValueBehaviors({ signal }),
  })

export const valueBehaviorsForQueryOptions = (valueId: string) =>
  queryOptions({
    queryKey: qk.valueBehaviorsFor(valueId),
    queryFn: ({ signal }) => listValueBehaviors({ data: { valueId }, signal }),
  })
