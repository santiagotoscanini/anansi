// When the TickTick sync runs.
//
//   - After an Anansi write: every service that changes goals or tasks calls
//     `requestSync(userId)`, whichever door the write came through (web, MCP,
//     phone). Runs are debounced, so a burst of edits is one run.
//   - Every POLL_MS for every connected user, which is how TickTick's changes
//     arrive: its API has no webhooks.
//   - On demand (`runSync`), for "Sync now" and the MCP tool.
//
// One run per user at a time; a request that lands during a run queues one
// more. The poller lives in this process, started on the first request
// (src/start.ts), and is a no-op where nobody is connected.
import { and, eq, isNotNull } from 'drizzle-orm'
import { db } from '~/lib/data'
import { tickTickConnections } from '~/lib/data/schema'
import { syncContext, syncUser, type SyncReport } from './sync'

const DEBOUNCE_MS = 2_000
const POLL_MS = 2 * 60_000

const running = new Map<string, Promise<unknown>>()
const queued = new Set<string>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Runs `fn` as the only thing touching this user's sync: after the run in
 * progress, with the next one waiting for it. Changing the list and
 * disconnecting go through here too, so a run that started against the old
 * list cannot add links after they were dropped.
 */
export async function exclusive<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  for (let current = running.get(userId); current; current = running.get(userId)) {
    await current.catch(() => null)
  }
  const run = fn().finally(() => {
    running.delete(userId)
    if (queued.delete(userId)) schedule(userId)
  })
  running.set(userId, run)
  return run
}

/** Runs a sync now, after the one in progress if there is one. */
export function runSync(userId: string): Promise<SyncReport | null> {
  return exclusive(userId, () => syncContext.run(true, () => syncUser(userId)))
}

function schedule(userId: string) {
  clearTimeout(timers.get(userId))
  const timer = setTimeout(() => {
    timers.delete(userId)
    if (running.has(userId)) {
      queued.add(userId)
      return
    }
    runSync(userId).catch((e: unknown) => console.error('[ticktick] sync failed', e instanceof Error ? e.message : e))
  }, DEBOUNCE_MS)
  timer.unref?.()
  timers.set(userId, timer)
}

/**
 * Ask for a sync soon. Never throws and never waits: a write must not fail or
 * slow down because TickTick is unreachable. Calls made by a sync itself are
 * ignored, so pulling a change does not push it straight back.
 */
export function requestSync(userId: string): void {
  if (syncContext.getStore()) return
  schedule(userId)
}

let polling = false

async function pollAll() {
  // A slow round must not overlap the next one.
  if (polling) return
  polling = true
  try {
    const rows = await db
      .select({ userId: tickTickConnections.userId })
      .from(tickTickConnections)
      .where(and(isNotNull(tickTickConnections.projectId), eq(tickTickConnections.needsReauth, false)))
    for (const { userId } of rows) {
      await runSync(userId).catch((e: unknown) =>
        console.error('[ticktick] poll failed', e instanceof Error ? e.message : e),
      )
    }
  } finally {
    polling = false
  }
}

// On globalThis so a dev server's module reload does not start a second one.
const POLLER = Symbol.for('anansi.ticktick.poller')

export function ensurePoller(): void {
  const g = globalThis as { [POLLER]?: ReturnType<typeof setInterval> }
  if (g[POLLER]) return
  const timer = setInterval(() => {
    pollAll().catch((e: unknown) => console.error('[ticktick] poll failed', e instanceof Error ? e.message : e))
  }, POLL_MS)
  timer.unref?.()
  g[POLLER] = timer
}
