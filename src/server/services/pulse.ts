// Pulse for a caller with no screen: the `get_pulse` MCP tool. The reading is
// lib/pulse.ts, shared with components/goals/Pulse.tsx; this file only gathers
// what the screen's queries gather.
import { attentionOf, horizonsOf, isFilled, syncItemsOf, upcomingOf } from '~/lib/pulse'
import { weekOfDay } from '~/lib/week'
import * as goals from './goals'
import * as importantDates from './important-dates'
import * as nextBids from './next-bids'
import * as people from './people'
import * as weeklySync from './weekly-sync'

/** `day` is the user's own calendar day, because the server's clock is not theirs. */
export async function get(userId: string, day: string) {
  const week = weekOfDay(day)
  const today = new Date(`${day}T00:00:00`)
  const [goalRows, peopleRows, dates, bids, retro] = await Promise.all([
    goals.list(userId),
    people.list(userId, { includeArchived: false }),
    importantDates.list(userId),
    nextBids.listUpcoming(userId),
    weeklySync.getWeeklyRetrospectiveData(userId, week),
  ])

  const items = syncItemsOf(retro)
  const filled = items.filter(isFilled).length
  return {
    day,
    weekStartsOn: week.toISOString().slice(0, 10),
    sync: retro.weeklySync
      ? {
          id: retro.weeklySync.id,
          filled,
          total: items.length,
          progress: items.length === 0 ? 0 : Math.round((filled / items.length) * 100),
          items,
        }
      : null,
    upcoming: upcomingOf(dates, bids, peopleRows, today),
    horizons: horizonsOf(goalRows, today),
    attention: attentionOf(peopleRows, today.getTime()).map(({ person, reason }) => ({
      personId: person.id,
      name: person.name,
      category: person.category,
      reason,
    })),
  }
}
