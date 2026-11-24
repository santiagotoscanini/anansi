// Open questions: the life questions the user is living with ("Why do I want to
// be a founder?", "What do I look for in a partner?").
//
// A question gathers dated notes, the thinking over time, newest first. When it
// settles, the answer is written down (`status = 'settled'`, `settledAt`); a
// settled question can be reopened, and keeps its notes and its answer either
// way. Each can link to the goals and people it touches.
//
// Note text can name people with the app's mention grammar (~/lib/mentions):
// it is linked on every write like a journal day, but not indexed, so a note
// does not show up under the person's mentions. The explicit person links are
// what tie a question to someone.
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '~/lib/data'
import {
  goals,
  openQuestionGoals,
  openQuestionNotes,
  openQuestionPeople,
  openQuestions,
  people,
} from '~/lib/data/schema'
import {
  addOpenQuestionNoteSchema,
  createOpenQuestionSchema,
  settleOpenQuestionSchema,
  updateOpenQuestionNoteSchema,
  updateOpenQuestionSchema,
  type AddOpenQuestionNote,
  type CreateOpenQuestion,
  type SettleOpenQuestion,
  type UpdateOpenQuestion,
  type UpdateOpenQuestionNote,
} from '~/lib/api/types'
import { AppError } from './errors'
import { linkTexts, mentionedIn } from './mentions'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Blank prose is no prose. */
function prose(text: string | null | undefined) {
  if (text === undefined) return undefined
  return text?.trim() ? text.trim() : null
}

async function ownedQuestion(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(openQuestions)
    .where(and(eq(openQuestions.id, id), eq(openQuestions.userId, userId)))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'Open question not found or access denied')
  return row
}

/** Refuse ids that are not the caller's goals or people, naming them. */
async function assertLinks(userId: string, goalIds: readonly string[] = [], personIds: readonly string[] = []) {
  const wantGoals = [...new Set(goalIds)]
  const wantPeople = [...new Set(personIds)]
  if (wantGoals.length) {
    const found = await db
      .select({ id: goals.id })
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.status, 'active'), inArray(goals.id, wantGoals)))
    const ok = new Set(found.map((g) => g.id))
    const missing = wantGoals.filter((id) => !ok.has(id))
    if (missing.length) throw new AppError('BAD_REQUEST', `No goal has the id ${missing.join(', ')}.`)
  }
  if (wantPeople.length) {
    const found = await db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.userId, userId), inArray(people.id, wantPeople)))
    const ok = new Set(found.map((p) => p.id))
    const missing = wantPeople.filter((id) => !ok.has(id))
    if (missing.length) throw new AppError('BAD_REQUEST', `No person has the id ${missing.join(', ')}.`)
  }
  return { goalIds: wantGoals, personIds: wantPeople }
}

async function replaceLinks(
  tx: Tx,
  questionId: string,
  links: { goalIds?: readonly string[]; personIds?: readonly string[] },
) {
  if (links.goalIds !== undefined) {
    await tx.delete(openQuestionGoals).where(eq(openQuestionGoals.questionId, questionId))
    if (links.goalIds.length) {
      await tx.insert(openQuestionGoals).values(links.goalIds.map((goalId) => ({ questionId, goalId })))
    }
  }
  if (links.personIds !== undefined) {
    await tx.delete(openQuestionPeople).where(eq(openQuestionPeople.questionId, questionId))
    if (links.personIds.length) {
      await tx.insert(openQuestionPeople).values(links.personIds.map((personId) => ({ questionId, personId })))
    }
  }
}

/**
 * Every question, open ones first (in their order), then the settled ones
 * (most recently settled first), each with its notes (newest first) and the
 * ids of the goals and people it links.
 */
export async function list(userId: string, input?: { status?: 'open' | 'settled' }) {
  const rows = await db
    .select()
    .from(openQuestions)
    .where(
      input?.status
        ? and(eq(openQuestions.userId, userId), eq(openQuestions.status, input.status))
        : eq(openQuestions.userId, userId),
    )
    .orderBy(
      asc(openQuestions.status),
      desc(openQuestions.settledAt),
      asc(openQuestions.orderIdx),
      asc(openQuestions.createdAt),
    )
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const [notes, goalLinks, personLinks] = await Promise.all([
    db
      .select()
      .from(openQuestionNotes)
      .where(inArray(openQuestionNotes.questionId, ids))
      .orderBy(desc(openQuestionNotes.createdAt)),
    db
      .select({ questionId: openQuestionGoals.questionId, goalId: openQuestionGoals.goalId })
      .from(openQuestionGoals)
      .innerJoin(goals, eq(openQuestionGoals.goalId, goals.id))
      .where(and(inArray(openQuestionGoals.questionId, ids), eq(goals.status, 'active'))),
    db
      .select({ questionId: openQuestionPeople.questionId, personId: openQuestionPeople.personId })
      .from(openQuestionPeople)
      .where(inArray(openQuestionPeople.questionId, ids)),
  ])
  return rows.map((r) => ({
    ...r,
    notes: notes.filter((n) => n.questionId === r.id),
    /** Notes written after the summary was last rewritten: what it does not know yet. */
    notesSinceSummary: notes.filter(
      (n) => n.questionId === r.id && (!r.summaryUpdatedAt || n.createdAt > r.summaryUpdatedAt),
    ).length,
    goalIds: goalLinks.filter((l) => l.questionId === r.id).map((l) => l.goalId),
    personIds: personLinks.filter((l) => l.questionId === r.id).map((l) => l.personId),
  }))
}

export type OpenQuestionWithNotes = Awaited<ReturnType<typeof list>>[number]

/** One question as `list` shows it. */
export async function get(userId: string, id: string): Promise<OpenQuestionWithNotes> {
  await ownedQuestion(userId, id)
  const found = (await list(userId)).find((q) => q.id === id)
  if (!found) throw new AppError('NOT_FOUND', 'Open question not found or access denied')
  return found
}

/** A new open question, at the end of the open ones. */
export async function create(userId: string, input: CreateOpenQuestion) {
  const data = createOpenQuestionSchema.parse(input)
  const links = await assertLinks(userId, data.goalIds, data.personIds)
  const id = await db.transaction(async (tx) => {
    const [agg] = await tx
      .select({ maxIdx: sql<number>`COALESCE(MAX(${openQuestions.orderIdx}), -1)` })
      .from(openQuestions)
      .where(eq(openQuestions.userId, userId))
    const [created] = await tx
      .insert(openQuestions)
      .values({
        userId,
        question: data.question,
        context: prose(data.context) ?? null,
        orderIdx: (agg?.maxIdx ?? -1) + 1,
      })
      .returning({ id: openQuestions.id })
    if (!created) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to create open question')
    await replaceLinks(tx, created.id, links)
    return created.id
  })
  return await get(userId, id)
}

/** A field passed replaces, a field left out stays; the link sets replace whole. */
export async function update(userId: string, input: UpdateOpenQuestion) {
  const data = updateOpenQuestionSchema.parse(input)
  await ownedQuestion(userId, data.id)
  const links = {
    goalIds: data.goalIds === undefined ? undefined : (await assertLinks(userId, data.goalIds)).goalIds,
    personIds: data.personIds === undefined ? undefined : (await assertLinks(userId, [], data.personIds)).personIds,
  }
  // A summary names people the way notes do: linked on the way in.
  const summary = data.summary?.trim() ? (await linkTexts(userId, [data.summary])).texts[0] : data.summary
  await db.transaction(async (tx) => {
    await tx
      .update(openQuestions)
      .set({
        question: data.question,
        context: prose(data.context),
        answer: prose(data.answer),
        summary: prose(summary),
        // The database's clock, as the notes' `createdAt` is: `notesSinceSummary` compares the two.
        summaryUpdatedAt: data.summary === undefined ? undefined : sql`now()`,
        // Seeded: every field above is optional, and drizzle rejects an empty
        // `.set({})` before $onUpdate can fill it.
        updatedAt: new Date(),
      })
      .where(and(eq(openQuestions.id, data.id), eq(openQuestions.userId, userId)))
    await replaceLinks(tx, data.id, links)
  })
  return await get(userId, data.id)
}

/** Write the answer down and mark the question settled (again, if it was). */
export async function settle(userId: string, input: SettleOpenQuestion) {
  const data = settleOpenQuestionSchema.parse(input)
  const row = await ownedQuestion(userId, data.id)
  await db
    .update(openQuestions)
    .set({
      status: 'settled',
      answer: data.answer,
      // Re-settling keeps the day it first settled.
      settledAt: row.status === 'settled' && row.settledAt ? row.settledAt : new Date(),
    })
    .where(eq(openQuestions.id, row.id))
  return await get(userId, row.id)
}

/** Open it again. The answer stays, as what the user once thought. */
export async function reopen(userId: string, id: string) {
  const row = await ownedQuestion(userId, id)
  await db.update(openQuestions).set({ status: 'open', settledAt: null }).where(eq(openQuestions.id, row.id))
  return await get(userId, row.id)
}

/** Hard delete; its notes and links go with it. */
export async function remove(userId: string, id: string) {
  await db.delete(openQuestions).where(and(eq(openQuestions.id, id), eq(openQuestions.userId, userId)))
  return { success: true }
}

// ── Notes ───────────────────────────────────────────────────────────────────

async function ownedNote(userId: string, id: string) {
  const [row] = await db
    .select({ note: openQuestionNotes })
    .from(openQuestionNotes)
    .innerJoin(openQuestions, eq(openQuestionNotes.questionId, openQuestions.id))
    .where(and(eq(openQuestionNotes.id, id), eq(openQuestions.userId, userId)))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'Note not found or access denied')
  return row.note
}

/** A dated thought on a question. */
export async function addNote(userId: string, input: AddOpenQuestionNote) {
  const data = addOpenQuestionNoteSchema.parse(input)
  await ownedQuestion(userId, data.questionId)
  const {
    texts: [content],
  } = await linkTexts(userId, [data.content])
  const [created] = await db
    .insert(openQuestionNotes)
    .values({ questionId: data.questionId, content: content! })
    .returning()
  // The question was thought about: it moves in "recently touched" terms.
  await db.update(openQuestions).set({ updatedAt: new Date() }).where(eq(openQuestions.id, data.questionId))
  return created!
}

export async function updateNote(userId: string, input: UpdateOpenQuestionNote) {
  const data = updateOpenQuestionNoteSchema.parse(input)
  const note = await ownedNote(userId, data.id)
  const {
    texts: [content],
  } = await linkTexts(userId, [data.content], mentionedIn(note.content))
  const [updated] = await db
    .update(openQuestionNotes)
    .set({ content: content! })
    .where(eq(openQuestionNotes.id, note.id))
    .returning()
  return updated!
}

export async function removeNote(userId: string, id: string) {
  const note = await ownedNote(userId, id)
  await db.delete(openQuestionNotes).where(eq(openQuestionNotes.id, note.id))
  return { success: true }
}
