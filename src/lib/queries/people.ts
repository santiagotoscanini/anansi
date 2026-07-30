import { queryOptions } from '@tanstack/react-query'
import { listBucketList } from '~/server/fn/bucket-list.fn'
import { getGroupTasks, listGroups } from '~/server/fn/groups.fn'
import { listImportantDates } from '~/server/fn/important-dates.fn'
import { listNextBids, listUpcomingNextBids } from '~/server/fn/next-bids.fn'
import { getPerson, getPersonBucketListItems, getPersonTasksAsReferent, listPeople } from '~/server/fn/people.fn'
import { qk } from './keys'

/**
 * The people list.
 *
 * `includeArchived` is part of the key, so the archived and unarchived lists are
 * separate cache entries rather than one that flips shape — which is what makes
 * the People tab's count (5, not 6) stable while PersonModal can still show an
 * archived person.
 */
export const peopleQueryOptions = (includeArchived = false) =>
  queryOptions({
    queryKey: qk.peopleList(includeArchived),
    queryFn: ({ signal }) => listPeople({ data: { includeArchived }, signal }),
  })

export const personQueryOptions = (id: string) =>
  queryOptions({
    queryKey: qk.personDetail(id),
    queryFn: ({ signal }) => getPerson({ data: { id }, signal }),
  })

/** "Tasks I'm relying on them for" — the goals↔people tie, with goal context. */
export const personTasksQueryOptions = (personId: string) =>
  queryOptions({
    queryKey: qk.personTasks(personId),
    queryFn: ({ signal }) => getPersonTasksAsReferent({ data: { personId }, signal }),
  })

export const personBucketListQueryOptions = (personId: string) =>
  queryOptions({
    queryKey: qk.personBucketList(personId),
    queryFn: ({ signal }) => getPersonBucketListItems({ data: { personId }, signal }),
  })

export const groupsQueryOptions = () =>
  queryOptions({
    queryKey: qk.groups,
    queryFn: ({ signal }) => listGroups({ signal }),
  })

export const groupTasksQueryOptions = (groupId: string) =>
  queryOptions({
    queryKey: qk.groupTasks(groupId),
    queryFn: ({ signal }) => getGroupTasks({ data: { groupId }, signal }),
  })

export const nextBidsQueryOptions = (personId: string) =>
  queryOptions({
    queryKey: qk.nextBidsFor(personId),
    queryFn: ({ signal }) => listNextBids({ data: { personId }, signal }),
  })

/** Open bids with a deadline inside the window, across everyone. Drives Pulse. */
export const upcomingNextBidsQueryOptions = (withinDays = 60) =>
  queryOptions({
    queryKey: qk.nextBidsUpcoming(withinDays),
    queryFn: ({ signal }) => listUpcomingNextBids({ data: { withinDays }, signal }),
  })

/** One person's dates, or — with no argument — all of them, for Pulse. */
export const importantDatesQueryOptions = (personId?: string) =>
  queryOptions({
    queryKey: qk.importantDatesFor(personId),
    queryFn: ({ signal }) => listImportantDates({ data: { personId }, signal }),
  })

export const bucketListQueryOptions = () =>
  queryOptions({
    queryKey: qk.bucketList,
    queryFn: ({ signal }) => listBucketList({ signal }),
  })
