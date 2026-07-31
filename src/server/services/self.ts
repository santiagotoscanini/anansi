// The Self page's prose fields — a "living portrait", one row per user.
//
// Every column is nullable on purpose: an untouched section must read as a clean
// page, not an unfinished form. `update` is a partial upsert, so only the fields
// the caller actually passes get written.
import { eq } from 'drizzle-orm'
import { db } from '~/lib/data'
import { userSelf } from '~/lib/data/schema'
import type { UpdateSelf } from '~/lib/api/types'

/** Returns null rather than throwing when the user has never touched the page. */
export async function get(userId: string) {
  const [row] = await db.select().from(userSelf).where(eq(userSelf.userId, userId)).limit(1)
  return row ?? null
}

export async function update(userId: string, input: UpdateSelf) {
  const [existing] = await db.select().from(userSelf).where(eq(userSelf.userId, userId)).limit(1)
  if (existing) {
    const [updated] = await db
      .update(userSelf)
      .set({ ...input })
      .where(eq(userSelf.userId, userId))
      .returning()
    return updated
  }
  const [created] = await db
    .insert(userSelf)
    .values({ ...input, userId })
    .returning()
  return created
}
