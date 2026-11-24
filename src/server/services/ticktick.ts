// The TickTick connection: what Profile → TickTick and the MCP tools see and
// do. The sync itself is in ~/server/ticktick/ (sync.ts for the rules,
// runner.ts for when it runs); the OAuth round trip is the two routes under
// /api/integrations/ticktick/.
import { and, count, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '~/lib/data'
import { tickTickConnections, tickTickLinks } from '~/lib/data/schema'
import { tickTickEnabled } from '~/lib/env'
import { isValidTimeZone } from '~/lib/ticktick'
import { revokeToken, tickTick, TickTickAuthError } from '~/server/ticktick/client'
import { openToken, sealToken } from '~/server/ticktick/crypto'
import { runSync } from '~/server/ticktick/runner'
import { forgetLinks } from '~/server/ticktick/sync'
import { AppError } from './errors'

export interface TickTickStatus {
  /** The deployment has a TickTick app configured. */
  available: boolean
  connected: boolean
  needsReauth: boolean
  list: { id: string; name: string } | null
  timeZone: string | null
  lastSyncedAt: Date | null
  lastError: string | null
  /** Goals and tasks currently linked to a TickTick task. */
  linked: { goals: number; tasks: number }
}

async function connection(userId: string) {
  const [row] = await db.select().from(tickTickConnections).where(eq(tickTickConnections.userId, userId)).limit(1)
  return row ?? null
}

/** A client for the user's TickTick, or a reason there is none. */
async function client(userId: string) {
  const conn = await connection(userId)
  if (!conn) throw new AppError('BAD_REQUEST', 'TickTick is not connected')
  const token = openToken(conn.accessToken)
  if (!token || conn.needsReauth)
    throw new AppError('BAD_REQUEST', 'Connect TickTick again: the saved sign-in no longer works')
  return { conn, tt: tickTick(token) }
}

/** TickTick's own errors, said in the app's terms. */
async function talking<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof TickTickAuthError) {
      await db
        .update(tickTickConnections)
        .set({ needsReauth: true, lastError: e.message })
        .where(eq(tickTickConnections.userId, userId))
      throw new AppError('BAD_REQUEST', e.message)
    }
    if (e instanceof AppError) throw e
    throw new AppError('INTERNAL_SERVER_ERROR', e instanceof Error ? e.message : 'TickTick could not be reached')
  }
}

export async function status(userId: string): Promise<TickTickStatus> {
  const conn = await connection(userId)
  const counts = conn
    ? await db
        .select({ kind: tickTickLinks.kind, n: count() })
        .from(tickTickLinks)
        .where(and(eq(tickTickLinks.userId, userId), ne(tickTickLinks.remoteState, 'gone')))
        .groupBy(tickTickLinks.kind)
    : []
  return {
    available: tickTickEnabled,
    connected: Boolean(conn),
    needsReauth: conn?.needsReauth ?? false,
    list: conn?.projectId ? { id: conn.projectId, name: conn.projectName ?? '' } : null,
    timeZone: conn?.timeZone ?? null,
    lastSyncedAt: conn?.lastSyncedAt ?? null,
    lastError: conn?.lastError ?? null,
    linked: {
      goals: counts.find((c) => c.kind === 'goal')?.n ?? 0,
      tasks: counts.find((c) => c.kind === 'task')?.n ?? 0,
    },
  }
}

/** The user's TickTick lists that can hold tasks. */
export async function listLists(userId: string) {
  const { tt } = await client(userId)
  const projects = await talking(userId, () => tt.listProjects())
  return projects
    .filter((p) => !p.closed && (p.kind ?? 'TASK') === 'TASK' && (p.permission ?? 'write') === 'write')
    .map((p) => ({ id: p.id, name: p.name }))
}

export const chooseListInput = z.union([
  z.object({ listId: z.string().min(1) }),
  z.object({ newListName: z.string().trim().min(1).max(64) }),
])

/**
 * Point the sync at a list (an existing one, or a new one made here) and run
 * it. Another list than before starts over: links to the old list are
 * dropped, and nothing in the old list is touched.
 */
export async function chooseList(userId: string, input: z.input<typeof chooseListInput>) {
  const parsed = chooseListInput.parse(input)
  const { conn, tt } = await client(userId)
  const list = await talking(userId, async () => {
    if ('newListName' in parsed) return tt.createProject(parsed.newListName)
    const found = (await tt.listProjects()).find((p) => p.id === parsed.listId)
    if (!found) throw new AppError('NOT_FOUND', 'That TickTick list was not found')
    return found
  })
  if (conn.projectId !== list.id) await forgetLinks(userId)
  await db
    .update(tickTickConnections)
    .set({ projectId: list.id, projectName: list.name, lastError: null, lastSyncedAt: null })
    .where(eq(tickTickConnections.id, conn.id))
  return syncNow(userId)
}

/** Run the sync now and answer the status after it. */
export async function syncNow(userId: string) {
  const conn = await connection(userId)
  if (!conn) throw new AppError('BAD_REQUEST', 'TickTick is not connected')
  if (!conn.projectId) throw new AppError('BAD_REQUEST', 'Pick a TickTick list first')
  const report = await talking(userId, () => runSync(userId))
  return { report, status: await status(userId) }
}

/** Forget the connection and every link. Nothing in TickTick is deleted. */
export async function disconnect(userId: string) {
  const conn = await connection(userId)
  if (!conn) return { success: true }
  const token = openToken(conn.accessToken)
  await db.delete(tickTickLinks).where(eq(tickTickLinks.userId, userId))
  await db.delete(tickTickConnections).where(eq(tickTickConnections.id, conn.id))
  if (token) await revokeToken(token)
  return { success: true }
}

/** The end of the OAuth round trip: keep the token, and the zone due days are read in. */
export async function saveConnection(userId: string, token: string, timeZone: string | null) {
  const zone = timeZone && isValidTimeZone(timeZone) ? timeZone : 'UTC'
  const sealed = sealToken(token)
  await db
    .insert(tickTickConnections)
    .values({ userId, accessToken: sealed, timeZone: zone })
    .onConflictDoUpdate({
      target: tickTickConnections.userId,
      set: { accessToken: sealed, timeZone: zone, needsReauth: false, lastError: null, updatedAt: new Date() },
    })
}
