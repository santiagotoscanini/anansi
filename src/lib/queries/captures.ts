import { queryOptions } from '@tanstack/react-query'
import { listCaptures, listCaptureTerms } from '~/server/fn/captures.fn'
import { qk } from './keys'

/** The Inbox: the latest captures, newest first, with where each went. Pulse counts today's from it. */
export const capturesQueryOptions = () =>
  queryOptions({
    queryKey: qk.captures,
    queryFn: ({ signal }) => listCaptures({ data: { limit: 200 }, signal }),
  })

export type CaptureRow = Awaited<ReturnType<typeof listCaptures>>[number]

/** The dictionary for voice notes, by what is heard. Read only when the Inbox opens it. */
export const captureTermsQueryOptions = () =>
  queryOptions({
    queryKey: qk.captureTerms,
    queryFn: ({ signal }) => listCaptureTerms({ signal }),
  })

export type CaptureTermRow = Awaited<ReturnType<typeof listCaptureTerms>>[number]
