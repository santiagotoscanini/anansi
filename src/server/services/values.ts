// Value CRUD. Values are named + coloured tags a user attaches to goals via the
// goal_values junction; they also own a list of confirming behaviours (see
// ./value-behaviors.ts) and the user's own reading of what the value means to
// them (`interpretation`), which is what makes those behaviours make sense.
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
import { createValueSchema, updateValueSchema, type CreateValue, type UpdateValue } from '~/lib/api/types'
import { AppError } from './errors'

/** Blank prose is no prose: an emptied interpretation is stored as null. */
function prose(text: string | null | undefined) {
  if (text === undefined) return undefined
  return text?.trim() ? text : null
}

export async function list(userId: string) {
  return await db.select().from(values).where(eq(values.userId, userId))
}

export async function create(userId: string, input: CreateValue) {
  const { interpretation, ...rest } = createValueSchema.parse(input)
  const [created] = await db
    .insert(values)
    .values({ ...rest, interpretation: prose(interpretation) ?? null, userId })
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
  const { id, interpretation, ...updateData } = updateValueSchema.parse(input)
  const [updated] = await db
    .update(values)
    // `updatedAt` seeded: every field is optional, and drizzle rejects an
    // empty `.set({})` before $onUpdate can fill it.
    .set({ ...updateData, interpretation: prose(interpretation), updatedAt: new Date() })
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
