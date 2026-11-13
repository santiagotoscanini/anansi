// People named in text. Three texts can name a person (a journal day, the
// notes on a weekly sync item, a task's title and description) and all three
// do it the same way: the grammar in ~/lib/mentions, linked here on every
// write, with an index table per source rebuilt from the linked text.
//
// `linkTexts` is what a writing service calls before it stores anything;
// `forPerson` reads the three indexes back as "where is this person named".
import { and, desc, eq } from 'drizzle-orm'
import { db } from '~/lib/data'
import {
  goals,
  journalEntries,
  journalMentions,
  people,
  syncItemMentions,
  taskMentions,
  tasks,
  trackingItems,
  weeklySync,
  weeklySyncItems,
} from '~/lib/data/schema'
import { linkMentions, mentionedIds } from '~/lib/mentions'
import { AppError } from './errors'

/**
 * Link every mention in `texts` against the user's people, or refuse with
 * the reason: an id that is nobody's, or an explicit `@[Name]` that no
 * person (or more than one) answers to. A plain `@Name` that matches nobody
 * is left as written. `prefer` settles a name two people share (pass the
 * people the text already mentions).
 *
 * Answers the linked texts, in order, and the people they mention.
 */
export async function linkTexts(userId: string, texts: readonly string[], prefer: readonly string[] = []) {
  // Nothing that could be a mention: no people to load, nothing to rewrite.
  if (!texts.some((t) => t.includes('@'))) return { texts: [...texts], personIds: [] as string[] }

  const mine = await db.select({ id: people.id, name: people.name }).from(people).where(eq(people.userId, userId))
  const results = texts.map((t) => linkMentions(t, mine, prefer))
  const unknown = [...new Set(results.flatMap((r) => r.unknownIds))]
  if (unknown.length) {
    throw new AppError('BAD_REQUEST', `No person has the id ${unknown.join(', ')}. Use an id from the people list.`)
  }
  const unresolved = results.flatMap((r) => r.unresolved)
  if (unresolved.length) {
    const said = unresolved
      .map((u) => (u.matches === 0 ? `nobody is called "${u.name}"` : `${u.matches} people are called "${u.name}"`))
      .join('; ')
    throw new AppError('BAD_REQUEST', `Could not link a mention: ${said}. Write it as @[Name](person:<id>).`)
  }
  const linked = results.map((r) => r.text)
  return { texts: linked, personIds: mentionedIds(linked.join('\n')) }
}

/** The people a stored text already mentions: the `prefer` of its next write. */
export function mentionedIn(...texts: (string | null | undefined)[]): string[] {
  return mentionedIds(texts.filter(Boolean).join('\n'))
}

/**
 * Everywhere the user's text names one person, newest first within each kind:
 * journal days, weekly sync notes, tasks. Someone else's person, or nobody's,
 * answers three empty lists.
 */
export async function forPerson(userId: string, personId: string) {
  const [journal, syncNotes, taskRows] = await Promise.all([
    db
      .select({
        day: journalEntries.day,
        content: journalEntries.content,
        highlights: journalEntries.highlights,
      })
      .from(journalMentions)
      .innerJoin(journalEntries, eq(journalMentions.entryId, journalEntries.id))
      .where(and(eq(journalMentions.personId, personId), eq(journalEntries.userId, userId)))
      .orderBy(desc(journalEntries.day))
      .limit(200),
    db
      .select({
        weeklySyncItemId: weeklySyncItems.id,
        weekDate: weeklySync.weekDate,
        itemTitle: trackingItems.title,
        textContent: weeklySyncItems.textContent,
      })
      .from(syncItemMentions)
      .innerJoin(weeklySyncItems, eq(syncItemMentions.weeklySyncItemId, weeklySyncItems.id))
      .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
      .innerJoin(trackingItems, eq(weeklySyncItems.trackingItemId, trackingItems.id))
      .where(and(eq(syncItemMentions.personId, personId), eq(weeklySync.userId, userId)))
      .orderBy(desc(weeklySync.weekDate))
      .limit(200),
    db
      .select({
        taskId: tasks.id,
        goalId: goals.id,
        goalTitle: goals.title,
        goalEmoji: goals.emoji,
        title: tasks.title,
        description: tasks.description,
        completed: tasks.completed,
        scheduledAt: tasks.scheduledAt,
      })
      .from(taskMentions)
      .innerJoin(tasks, eq(taskMentions.taskId, tasks.id))
      .innerJoin(goals, eq(tasks.goalId, goals.id))
      .where(and(eq(taskMentions.personId, personId), eq(goals.userId, userId), eq(goals.status, 'active')))
      .orderBy(desc(tasks.updatedAt))
      .limit(200),
  ])
  return {
    journal,
    syncNotes: syncNotes.map((n) => ({ ...n, textContent: n.textContent ?? '' })),
    tasks: taskRows,
  }
}

type Conn = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Replace the index of one task with the people its text now mentions. */
export async function indexTask(taskId: string, personIds: readonly string[], conn: Conn = db) {
  await conn.delete(taskMentions).where(eq(taskMentions.taskId, taskId))
  if (personIds.length) await conn.insert(taskMentions).values(personIds.map((personId) => ({ taskId, personId })))
}

/** Replace the index of one sync item with the people its notes now mention. */
export async function indexSyncItem(weeklySyncItemId: string, personIds: readonly string[], conn: Conn = db) {
  await conn.delete(syncItemMentions).where(eq(syncItemMentions.weeklySyncItemId, weeklySyncItemId))
  if (personIds.length) {
    await conn.insert(syncItemMentions).values(personIds.map((personId) => ({ weeklySyncItemId, personId })))
  }
}
