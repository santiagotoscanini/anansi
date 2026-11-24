import { queryOptions } from '@tanstack/react-query'
import { listCaptures } from '~/server/fn/captures.fn'
import { qk } from './keys'

/** The Inbox: the latest captures, newest first, with where each went. Pulse counts today's from it. */
export const capturesQueryOptions = () =>
  queryOptions({
    queryKey: qk.captures,
    queryFn: ({ signal }) => listCaptures({ data: { limit: 200 }, signal }),
  })

export type CaptureRow = Awaited<ReturnType<typeof listCaptures>>[number]
