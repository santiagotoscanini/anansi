// Behaviours that confirm a value — concrete evidence per value.
//
// value_behaviors has no user_id of its own: ownership is always enforced
// through the parent value's user_id, and rows cascade-delete when the value
// goes away. Every function here therefore joins or pre-checks `values` rather
// than trusting the incoming id.
import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '~/lib/data'
import { valueBehaviors, values } from '~/lib/data/schema'
import type { CreateValueBehavior } from '~/lib/api/types'
import { AppError } from './errors'

/** Throws NOT_FOUND unless `valueId` exists and belongs to `userId`. */
async function assertOwnsValue(userId: string, valueId: string) {
  const [value] = await db
    .select({ id: values.id })
    .from(values)
    .where(and(eq(values.id, valueId), eq(values.userId, userId)))
    .limit(1)
  if (!value) throw new AppError('NOT_FOUND', 'Value not found or access denied')
}

export async function list(userId: string, valueId: string) {
  await assertOwnsValue(userId, valueId)
  return await db
    .select()
    .from(valueBehaviors)
    .where(eq(valueBehaviors.valueId, valueId))
    .orderBy(asc(valueBehaviors.orderIdx), asc(valueBehaviors.createdAt))
}

/**
 * Every behaviour across all of the user's values. Used by ValuesManager to
 * render counts plus the inline expansion in a single round trip.
 */
export async function listAll(userId: string) {
  return await db
    .select({
      id: valueBehaviors.id,
      valueId: valueBehaviors.valueId,
      content: valueBehaviors.content,
      orderIdx: valueBehaviors.orderIdx,
      createdAt: valueBehaviors.createdAt,
    })
    .from(valueBehaviors)
    .innerJoin(values, eq(valueBehaviors.valueId, values.id))
    .where(eq(values.userId, userId))
    .orderBy(asc(valueBehaviors.orderIdx), asc(valueBehaviors.createdAt))
}

export async function create(userId: string, input: CreateValueBehavior) {
  await assertOwnsValue(userId, input.valueId)

  // Append at the end of the value's behaviour list.
  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(${valueBehaviors.orderIdx}), -1)` })
    .from(valueBehaviors)
    .where(eq(valueBehaviors.valueId, input.valueId))
  const nextOrder = (maxRow?.max ?? -1) + 1

  const [created] = await db
    .insert(valueBehaviors)
    .values({ valueId: input.valueId, content: input.content, orderIdx: nextOrder })
    .returning()
  if (!created) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to add behavior')
  return created
}

export async function remove(userId: string, id: string) {
  // Ownership via the parent value.
  const [row] = await db
    .select({ id: valueBehaviors.id })
    .from(valueBehaviors)
    .innerJoin(values, eq(valueBehaviors.valueId, values.id))
    .where(and(eq(valueBehaviors.id, id), eq(values.userId, userId)))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'Behavior not found or access denied')
  await db.delete(valueBehaviors).where(eq(valueBehaviors.id, id))
  return { success: true }
}
