import { queryOptions } from '@tanstack/react-query'
import { fetchLife, fetchLifeWeek } from '~/server/fn/life.fn'
import { qk } from './keys'

/** The Life tab: the birth date, the expected years, chapters, views and what each week recorded. */
export const lifeQueryOptions = () =>
  queryOptions({
    queryKey: qk.life,
    queryFn: ({ signal }) => fetchLife({ signal }),
  })

/** One week of a life, opened from the grid. `day` is its Sunday. */
export const lifeWeekQueryOptions = (day: string) =>
  queryOptions({
    queryKey: qk.lifeWeek(day),
    queryFn: ({ signal }) => fetchLifeWeek({ data: { day }, signal }),
  })

export type LifeData = Awaited<ReturnType<typeof fetchLife>>
export type LifeChapter = LifeData['chapters'][number]
export type LifeView = LifeData['views'][number]
export type LifeWeek = Awaited<ReturnType<typeof fetchLifeWeek>>
