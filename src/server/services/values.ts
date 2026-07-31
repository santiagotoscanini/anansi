// Value CRUD. Values are named + coloured tags a user attaches to goals via the
// goal_values junction; they also own a list of confirming behaviours (see
// ./value-behaviors.ts).
//
// Service-layer contract, applied across every file in this directory:
//   - takes `(userId, input)`; userId is always server-verified by the caller
//   - imports `db`, the schema, shared zod-derived types and AppError — nothing
//     from tRPC or @tanstack/*, so tRPC, MCP tools and (later) server functions
//     can all call the same function
//   - throws AppError; each transport maps it to its own error shape
import { and, eq } from 'drizzle-orm'
import { db } from '~/lib/data'
import { goalValues, values } from '~/lib/data/schema'
import type { CreateValue, UpdateValue } from '~/lib/api/types'
import { AppError } from './errors'

export async function list(userId: string) {
  return await db.select().from(values).where(eq(values.userId, userId))
}

export async function create(userId: string, input: CreateValue) {
  const [created] = await db
    .insert(values)
    .values({ ...input, userId })
    .returning()
  if (!created) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to create value')
  return created
}

/**
 * Note: returns `undefined` when the value doesn't exist or isn't the caller's,
 * rather than throwing. That's the pre-existing contract the ValuesManager
 * relies on — preserved deliberately during the extraction rather than
 * "improved" into a NOT_FOUND, which would be a client-visible change.
 */
export async function update(userId: string, input: UpdateValue) {
  const { id, ...updateData } = input
  const [updated] = await db
    .update(values)
    .set({ ...updateData })
    .where(and(eq(values.id, id), eq(values.userId, userId)))
    .returning()
  return updated
}

/** Drops the value's goal associations first, then the value itself. */
export async function remove(userId: string, id: string) {
  await db.delete(goalValues).where(eq(goalValues.valueId, id))
  await db.delete(values).where(and(eq(values.id, id), eq(values.userId, userId)))
  return { success: true }
}
