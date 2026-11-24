// Personality test results (MBTI, Enneagram, Big Five, CliftonStrengths, VIA,
// attachment style, love languages, DISC, anything else), mostly recorded by
// Claude from a PDF or a screenshot the user shares in a chat.
//
// Several results per test are allowed: a retake is a new row, and the newest
// (by the day it was taken, else the day it was recorded) is the one shown.
// `details` is that test's structured scores; every write checks the whole
// result against the union in ~/lib/personality, so what is stored always fits
// its test.
import { and, desc, eq } from 'drizzle-orm'
import { db } from '~/lib/data'
import { personalityResults } from '~/lib/data/schema'
import {
  parsePersonalityResult,
  personalityTestValues,
  updatePersonalityResultSchema,
  type PersonalityTest,
  type UpdatePersonalityResult,
} from '~/lib/personality'
import { AppError } from './errors'

function check(input: unknown) {
  const parsed = parsePersonalityResult(input)
  if (!parsed.ok) throw new AppError('BAD_REQUEST', parsed.error)
  const r = parsed.result
  return {
    test: r.test,
    details: r.details,
    takenAt: r.takenAt ?? null,
    source: r.source?.trim() ? r.source.trim() : null,
    summary: r.summary,
    notes: r.notes?.trim() ? r.notes : null,
  }
}

/** Every result, newest recorded first; `test` narrows to one test. */
export async function list(userId: string, input?: { test?: PersonalityTest }) {
  const test = input?.test
  if (test !== undefined && !personalityTestValues.includes(test)) {
    throw new AppError('BAD_REQUEST', `Unknown test ${String(test)}`)
  }
  return await db
    .select()
    .from(personalityResults)
    .where(
      test
        ? and(eq(personalityResults.userId, userId), eq(personalityResults.test, test))
        : eq(personalityResults.userId, userId),
    )
    .orderBy(desc(personalityResults.takenAt), desc(personalityResults.createdAt))
}

/** A new result (a retake of a test is a new result, not an edit). */
export async function record(userId: string, input: unknown) {
  const row = check(input)
  const [created] = await db
    .insert(personalityResults)
    .values({ ...row, userId })
    .returning()
  if (!created) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to record the result')
  return created
}

/**
 * A field passed replaces, a field left out stays. The merged result is checked
 * whole, so moving a result to another test needs details that fit it.
 */
export async function update(userId: string, input: UpdatePersonalityResult) {
  const patch = updatePersonalityResultSchema.parse(input)
  const [current] = await db
    .select()
    .from(personalityResults)
    .where(and(eq(personalityResults.id, patch.id), eq(personalityResults.userId, userId)))
    .limit(1)
  if (!current) throw new AppError('NOT_FOUND', 'Result not found or access denied')
  const row = check({
    test: patch.test ?? current.test,
    details: patch.details === undefined ? current.details : patch.details,
    takenAt: patch.takenAt === undefined ? current.takenAt : patch.takenAt,
    source: patch.source === undefined ? current.source : patch.source,
    summary: patch.summary ?? current.summary,
    notes: patch.notes === undefined ? current.notes : patch.notes,
  })
  const [updated] = await db
    .update(personalityResults)
    .set(row)
    .where(eq(personalityResults.id, current.id))
    .returning()
  return updated!
}

export async function remove(userId: string, id: string) {
  await db.delete(personalityResults).where(and(eq(personalityResults.id, id), eq(personalityResults.userId, userId)))
  return { success: true }
}
