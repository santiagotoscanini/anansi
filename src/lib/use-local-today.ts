import { useSyncExternalStore } from 'react'
import { localToday } from './journal'

// "Today" is the browser's calendar day, and the server cannot know it: its
// clock is UTC, so for a user in UTC-3 the server's day turns over at 21:00,
// right when a day gets written down. So the server (and the hydration pass)
// render null, and the day appears on the client's first real render.
//
// A store rather than state set in an effect: it stays correct across
// midnight, checked once a minute and when the tab comes back.
function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, 60_000)
  document.addEventListener('visibilitychange', onChange)
  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onChange)
  }
}

/** The user's calendar day, `YYYY-MM-DD`, or null until the client has rendered. */
export function useLocalToday(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => localToday(),
    () => null,
  )
}
