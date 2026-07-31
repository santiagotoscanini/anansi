// Yearly-recurring per-person dates (birthday, anniversary, …). Stored as
// month + day, with `year` kept only for "turning N" math — distinct from
// `next_bids.dueAt`, which is a one-shot deadline.
//
// Surfaces in Pulse when the next occurrence is within 30 days.
import { and, asc, eq } from 'drizzle-orm'
import { db } from '~/lib/data'
import { importantDates, people } from '~/lib/data/schema'
import type { CreateImportantDate, UpdateImportantDate } from '~/lib/api/types'
import { AppError } from './errors'
import { assertOwnsPerson, ownsPerson } from './people'

/** Throws NOT_FOUND unless the date's person belongs to the user. */
async function assertOwnsDate(userId: string, id: string) {
  const [row] = await db
    .select({ id: importantDates.id })
    .from(importantDates)
    .innerJoin(people, eq(importantDates.personId, people.id))
    .where(and(eq(importantDates.id, id), eq(people.userId, userId)))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'Important date not found or access denied')
}

/** Omit `personId` to get every date across all the user's people. */
export async function list(userId: string, input?: { personId?: string }) {
  if (input?.personId) {
    if (!(await ownsPerson(userId, input.personId))) return []
    return await db
      .select()
      .from(importantDates)
      .where(eq(importantDates.personId, input.personId))
      .orderBy(asc(importantDates.month), asc(importantDates.day))
  }
  // No personId: everything for this user, across all their people. Columns are
  // listed explicitly so the join doesn't widen the row shape with `people`.
  return await db
    .select({
      id: importantDates.id,
      personId: importantDates.personId,
      label: importantDates.label,
      month: importantDates.month,
      day: importantDates.day,
      year: importantDates.year,
      createdAt: importantDates.createdAt,
      updatedAt: importantDates.updatedAt,
    })
    .from(importantDates)
    .innerJoin(people, eq(importantDates.personId, people.id))
    .where(eq(people.userId, userId))
    .orderBy(asc(importantDates.month), asc(importantDates.day))
}

export async function create(userId: string, input: CreateImportantDate) {
  await assertOwnsPerson(userId, input.personId)
  const [created] = await db
    .insert(importantDates)
    .values({
      personId: input.personId,
      label: input.label,
      month: input.month,
      day: input.day,
      year: input.year ?? null,
    })
    .returning()
  return created
}

/** Patch semantics: only keys present in `input` are written. */
export async function update(userId: string, input: UpdateImportantDate) {
  await assertOwnsDate(userId, input.id)
  // Seeded — see the note in services/auth.ts updateProfile. Every field below
  // is optional, and drizzle rejects `.set({})` before $onUpdate can fill it.
  const patch: { label?: string; month?: number; day?: number; year?: number | null; updatedAt: Date } = {
    updatedAt: new Date(),
  }
  if (input.label !== undefined) patch.label = input.label
  if (input.month !== undefined) patch.month = input.month
  if (input.day !== undefined) patch.day = input.day
  if (input.year !== undefined) patch.year = input.year
  const [updated] = await db.update(importantDates).set(patch).where(eq(importantDates.id, input.id)).returning()
  return updated
}

export async function remove(userId: string, id: string) {
  await assertOwnsDate(userId, id)
  await db.delete(importantDates).where(eq(importantDates.id, id))
  return { success: true }
}
