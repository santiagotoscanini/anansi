import { queryOptions } from '@tanstack/react-query'
import { listSelfListItems } from '~/server/fn/self-list-items.fn'
import { getSelf } from '~/server/fn/self.fn'
import { listOpenQuestions } from '~/server/fn/open-questions.fn'
import { listPersonalityResults } from '~/server/fn/personality.fn'
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

/** The `user_self` row, or null. Nullable is the normal state, not an error. */
export type SelfRow = Awaited<ReturnType<typeof getSelf>>

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

/** Open questions, open first then settled, each with its notes (newest first) and link ids. */
export const openQuestionsQueryOptions = () =>
  queryOptions({
    queryKey: qk.openQuestions,
    queryFn: ({ signal }) => listOpenQuestions({ signal }),
  })

export type OpenQuestionRow = Awaited<ReturnType<typeof listOpenQuestions>>[number]

/** Every personality result; the page groups them by test, newest first. */
export const personalityResultsQueryOptions = () =>
  queryOptions({
    queryKey: qk.personalityResults,
    queryFn: ({ signal }) => listPersonalityResults({ signal }),
  })

export type PersonalityResultRow = Awaited<ReturnType<typeof listPersonalityResults>>[number]
