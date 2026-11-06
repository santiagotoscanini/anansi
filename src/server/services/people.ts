// Personal CRM. People are a reflection surface, not a contact manager — the
// fields are prompts (appreciation, my needs, legacy message) rather than
// contact details.
//
// Also home to the two person-ownership guards the next-bids, important-dates
// and bucket-list services share. People own no rows themselves; every child
// table (next_bids, important_dates, …) proves ownership by joining back here.
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '~/lib/data'
import {
  bucketListItemPeople,
  bucketListItems,
  goals,
  people,
  peopleToGroups,
  taskReferents,
  tasks,
} from '~/lib/data/schema'
import type { CreatePerson, PersonCategory, UpdatePerson } from '~/lib/api/types'
import { decodeImageUpload, UploadValidationError } from '~/lib/image-upload'
import { checkRateLimit } from '~/lib/rate-limit'
import { AppError } from './errors'
import { fileUrl } from './file-refs'
import { releaseFile, saveFile } from './files'

/**
 * Two ownership guards, because the callers genuinely want different things and
 * collapsing them would be a client-visible change:
 *
 *   - `ownsPerson` — for reads. A list endpoint returns `[]` for a person the
 *     caller doesn't own, so an unauthorised id is indistinguishable from a
 *     person with nothing attached.
 *   - `assertOwnsPerson` — for writes, where silently succeeding on someone
 *     else's row would be worse than an error.
 *
 * Both are NOT_FOUND-shaped rather than FORBIDDEN, so neither leaks existence.
 */
export async function ownsPerson(userId: string, personId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.id, personId), eq(people.userId, userId)))
    .limit(1)
  return row !== undefined
}

export async function assertOwnsPerson(userId: string, personId: string) {
  if (!(await ownsPerson(userId, personId))) {
    throw new AppError('NOT_FOUND', 'Person not found or access denied')
  }
}

export async function list(userId: string, input?: { includeArchived?: boolean }) {
  const rows = await db.select().from(people).where(eq(people.userId, userId))
  const visible = input?.includeArchived ? rows : rows.filter((p) => p.archivedAt === null)
  if (visible.length === 0) return [] as ((typeof rows)[number] & { groupIds: string[] })[]

  // Hydrate group memberships so the directory can render group chips
  // without a per-row query.
  const memberships = await db
    .select()
    .from(peopleToGroups)
    .where(
      inArray(
        peopleToGroups.personId,
        visible.map((p) => p.id),
      ),
    )
  return visible.map((p) => ({
    ...p,
    groupIds: memberships.filter((m) => m.personId === p.id).map((m) => m.groupId),
  }))
}

export async function getById(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.userId, userId)))
    .limit(1)
  if (!row) return null
  const memberships = await db.select().from(peopleToGroups).where(eq(peopleToGroups.personId, row.id))
  return { ...row, groupIds: memberships.map((m) => m.groupId) }
}

export async function create(userId: string, input: CreatePerson) {
  const { groupIds, ...rest } = input
  const [newPerson] = await db
    .insert(people)
    .values({ ...rest, userId })
    .returning()
  if (!newPerson) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to create person')
  if (groupIds?.length) {
    await db.insert(peopleToGroups).values(groupIds.map((groupId) => ({ personId: newPerson.id, groupId })))
  }
  return newPerson
}

/**
 * `groupIds` is replace-set: omit to leave memberships untouched, `[]` clears.
 * A new `emoji` that replaces an uploaded photo releases the old photo's file.
 */
export async function update(userId: string, input: UpdatePerson) {
  const { id, groupIds, ...updateData } = input
  const [prev] =
    updateData.emoji === undefined
      ? []
      : await db
          .select({ emoji: people.emoji })
          .from(people)
          .where(and(eq(people.id, id), eq(people.userId, userId)))
          .limit(1)
  const [updated] = await db
    .update(people)
    // updatedAt restated — see services/connections.ts update.
    .set({ ...updateData, updatedAt: new Date() })
    .where(and(eq(people.id, id), eq(people.userId, userId)))
    .returning()

  if (groupIds !== undefined) {
    await db.delete(peopleToGroups).where(eq(peopleToGroups.personId, id))
    if (groupIds.length > 0) {
      await db.insert(peopleToGroups).values(groupIds.map((groupId) => ({ personId: id, groupId })))
    }
  }
  if (updated && prev && prev.emoji !== updated.emoji) await releaseFile(userId, prev.emoji)
  return updated
}

/** Archiving is the preferred removal — `remove` is only for wrong entries. */
export async function archive(userId: string, id: string) {
  const [updated] = await db
    .update(people)
    .set({ archivedAt: new Date() })
    .where(and(eq(people.id, id), eq(people.userId, userId)))
    .returning()
  return updated
}

export async function unarchive(userId: string, id: string) {
  const [updated] = await db
    .update(people)
    .set({ archivedAt: null })
    .where(and(eq(people.id, id), eq(people.userId, userId)))
    .returning()
  return updated
}

/** Hard delete. An uploaded photo goes with the person: its file, bytes included. */
export async function remove(userId: string, id: string) {
  const [removed] = await db
    .delete(people)
    .where(and(eq(people.id, id), eq(people.userId, userId)))
    .returning({ emoji: people.emoji })
  if (removed) await releaseFile(userId, removed.emoji)
  return { success: true }
}

/**
 * Lightweight drag-drop endpoint — updates only category + boardOrder without
 * requiring the full person payload, and without triggering validation on the
 * other reflection fields.
 */
export async function setCategory(
  userId: string,
  input: { id: string; category: PersonCategory; boardOrder?: number },
) {
  const [updated] = await db
    .update(people)
    .set({
      category: input.category,
      boardOrder: input.boardOrder ?? 0,
    })
    .where(and(eq(people.id, input.id), eq(people.userId, userId)))
    .returning()
  return updated
}

/**
 * Tasks where this person is a referent — used by PersonModal to show the
 * action surface alongside the reflection fields.
 */
export async function getTasksAsReferent(userId: string, personId: string) {
  // Verify the person belongs to the user (prevents enumeration via task refs).
  if (!(await ownsPerson(userId, personId))) return []

  return await db
    .select({
      taskId: tasks.id,
      taskTitle: tasks.title,
      completed: tasks.completed,
      goalId: goals.id,
      goalTitle: goals.title,
      goalEmoji: goals.emoji,
    })
    .from(taskReferents)
    .innerJoin(tasks, eq(taskReferents.taskId, tasks.id))
    .innerJoin(goals, eq(tasks.goalId, goals.id))
    .where(and(eq(taskReferents.personId, personId), eq(goals.userId, userId), eq(goals.status, 'active')))
}

/**
 * Bucket list items the person is named on. Mirror of getTasksAsReferent — used
 * by PersonModal to surface the cross-link from the People side.
 */
export async function getBucketListItemsAsParticipant(userId: string, personId: string) {
  // Verify the person belongs to the user (prevents enumeration via junction rows).
  if (!(await ownsPerson(userId, personId))) return []

  return await db
    .select({
      id: bucketListItems.id,
      content: bucketListItems.content,
      completedAt: bucketListItems.completedAt,
    })
    .from(bucketListItemPeople)
    .innerJoin(bucketListItems, eq(bucketListItemPeople.bucketItemId, bucketListItems.id))
    .where(and(eq(bucketListItemPeople.personId, personId), eq(bucketListItems.userId, userId)))
    .orderBy(asc(bucketListItems.createdAt))
}

/**
 * Upload a picture for a person, as a file (services/files.ts); the returned
 * URL is a `/api/files/{id}` pointer the caller stashes in `people.emoji` (the
 * column already accepts URL-typed values via Avatar.tsx). The photo it
 * replaces is released by `update`; a photo uploaded and never saved onto a
 * person (a modal cancelled after the pick) stays behind unnamed.
 */
export async function uploadImage(userId: string, input: { fileName: string; data: string }) {
  const rl = checkRateLimit('people.uploadImage', `user:${userId}`, { limit: 20, windowMs: 60_000 })
  if (!rl.allowed) throw new AppError('TOO_MANY_REQUESTS', 'Too many uploads, slow down')

  let decoded
  try {
    decoded = decodeImageUpload(input.data)
  } catch (err) {
    if (err instanceof UploadValidationError) throw new AppError('BAD_REQUEST', err.message)
    throw err
  }

  const file = await saveFile(userId, {
    fileName: input.fileName,
    mimeType: decoded.mime ?? 'application/octet-stream',
    bytes: decoded.buffer,
  })
  return { url: fileUrl(file.id) }
}
