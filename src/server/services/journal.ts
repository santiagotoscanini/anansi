// The journal: one entry per calendar day, written like a diary. Prose, a
// short list of highlights, pictures, and the people the day was about.
//
// The day is the user's own (`YYYY-MM-DD`), always named by the caller. An
// entry that holds nothing (no text, no highlights, no pictures) does not
// exist: writing a day empty deletes its row, and a read answers null for it.
//
// People are named in the text as tokens (grammar and the looser forms a
// writer may use: ~/lib/mentions). Every write links them, and rebuilds
// `journal_mentions` from the result, which is what answers "where did I
// write about this person".
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm'
import { db } from '~/lib/data'
import { attachments, journalEntries, journalMentions, people } from '~/lib/data/schema'
import {
  appendJournalEntrySchema,
  journalDaySchema,
  listJournalEntriesSchema,
  uploadJournalAttachmentSchema,
  writeJournalEntrySchema,
  type ListJournalEntries,
  type UploadJournalAttachment,
  type WriteJournalEntry,
} from '~/lib/api/types'
import * as attachmentsService from './attachments'
import { AppError } from './errors'
import { fileUrl } from './file-refs'
import { deleteFiles } from './files'
import { linkTexts, mentionedIn } from './mentions'

type EntryRow = typeof journalEntries.$inferSelect

const PARENT = 'journal_entry'

/** Rows as the screens and tools read them: with the people and the files. */
async function hydrate(rows: EntryRow[]) {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const [mentionRows, attachmentRows] = await Promise.all([
    db
      .select({
        entryId: journalMentions.entryId,
        personId: people.id,
        name: people.name,
        emoji: people.emoji,
      })
      .from(journalMentions)
      .innerJoin(people, eq(journalMentions.personId, people.id))
      .where(inArray(journalMentions.entryId, ids))
      .orderBy(asc(journalMentions.createdAt), asc(people.name)),
    db
      .select()
      .from(attachments)
      .where(and(eq(attachments.parentType, PARENT), inArray(attachments.parentId, ids)))
      .orderBy(asc(attachments.createdAt)),
  ])
  return rows
    .map((r) => ({
      id: r.id,
      day: r.day,
      content: r.content,
      highlights: r.highlights,
      mentions: mentionRows
        .filter((m) => m.entryId === r.id)
        .map((m) => ({ personId: m.personId, name: m.name, emoji: m.emoji })),
      attachments: attachmentRows
        .filter((a) => a.parentId === r.id)
        .map((a) => ({
          id: a.id,
          fileName: a.fileName,
          fileType: a.fileType,
          url: fileUrl(a.fileId),
          sizeBytes: a.sizeBytes,
          createdAt: a.createdAt,
        })),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))
    .filter((e) => e.content.trim() !== '' || e.highlights.length > 0 || e.attachments.length > 0)
}

export type JournalEntry = Awaited<ReturnType<typeof hydrate>>[number]

async function findRow(userId: string, day: string) {
  const [row] = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.userId, userId), eq(journalEntries.day, day)))
    .limit(1)
  return row ?? null
}

/** The day's entry, or null when nothing was written. */
export async function get(userId: string, input: { day: string }): Promise<JournalEntry | null> {
  const day = journalDaySchema.parse(input.day)
  const row = await findRow(userId, day)
  if (!row) return null
  const [entry] = await hydrate([row])
  return entry ?? null
}

/**
 * Entries, newest day first. `personId` keeps the days that mention that
 * person, `query` the days whose text or highlights contain it.
 */
export async function list(userId: string, raw: ListJournalEntries = {}): Promise<JournalEntry[]> {
  const input = listJournalEntriesSchema.parse(raw)
  const needle = input.query ? `%${input.query.replace(/[\\%_]/g, '\\$&')}%` : null
  const rows = await db
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.userId, userId),
        input.from ? gte(journalEntries.day, input.from) : undefined,
        input.to ? lte(journalEntries.day, input.to) : undefined,
        input.personId
          ? inArray(
              journalEntries.id,
              db
                .select({ id: journalMentions.entryId })
                .from(journalMentions)
                .where(eq(journalMentions.personId, input.personId)),
            )
          : undefined,
        needle
          ? or(ilike(journalEntries.content, needle), ilike(sql`${journalEntries.highlights}::text`, needle))
          : undefined,
      ),
    )
    .orderBy(desc(journalEntries.day))
    .limit(input.limit ?? 30)
  return hydrate(rows)
}

async function save(userId: string, day: string, content: string, highlights: string[]) {
  const existing = await findRow(userId, day)
  const prefer = existing ? mentionedIn(existing.content, ...existing.highlights) : []
  const {
    texts: [text = '', ...items],
    personIds: mentioned,
  } = await linkTexts(userId, [content, ...highlights], prefer)

  if (text.trim() === '' && items.length === 0) {
    // Nothing left to say. The row goes unless pictures still hang on it.
    if (!existing) return null
    const [kept] = await db
      .select({ id: attachments.id })
      .from(attachments)
      .where(and(eq(attachments.parentType, PARENT), eq(attachments.parentId, existing.id)))
      .limit(1)
    if (!kept) {
      await db.delete(journalEntries).where(eq(journalEntries.id, existing.id))
      return null
    }
  }

  const row = await db.transaction(async (tx) => {
    const [saved] = await tx
      .insert(journalEntries)
      .values({ userId, day, content: text, highlights: items })
      .onConflictDoUpdate({
        target: [journalEntries.userId, journalEntries.day],
        set: { content: text, highlights: items, updatedAt: new Date() },
      })
      .returning()
    if (!saved) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to save the journal entry')
    await tx.delete(journalMentions).where(eq(journalMentions.entryId, saved.id))
    if (mentioned.length) {
      await tx.insert(journalMentions).values(mentioned.map((personId) => ({ entryId: saved.id, personId })))
    }
    return saved
  })
  const [entry] = await hydrate([row])
  return entry ?? null
}

/**
 * Write a day. A field that is passed replaces what the day holds; one that is
 * left out stays as it is. Answers the entry, or null when the day ends up
 * empty.
 */
export async function write(userId: string, raw: WriteJournalEntry): Promise<JournalEntry | null> {
  const input = writeJournalEntrySchema.parse(raw)
  const existing = await findRow(userId, input.day)
  return save(
    userId,
    input.day,
    input.content ?? existing?.content ?? '',
    input.highlights ?? existing?.highlights ?? [],
  )
}

/**
 * Add to a day without reading it first: `content` becomes a new paragraph
 * after what is there, `highlights` join the end of the list (one already on
 * it is not repeated).
 */
export async function append(userId: string, raw: WriteJournalEntry): Promise<JournalEntry | null> {
  const input = appendJournalEntrySchema.parse(raw)
  const existing = await findRow(userId, input.day)
  const before = existing?.content.trimEnd() ?? ''
  const added = input.content?.trim() ?? ''
  const content = before && added ? `${before}\n\n${added}` : before || added
  const highlights = [...(existing?.highlights ?? [])]
  for (const h of input.highlights ?? []) if (!highlights.includes(h)) highlights.push(h)
  if (content.length > 50_000) throw new AppError('BAD_REQUEST', 'The entry would pass 50,000 characters')
  if (highlights.length > 50) throw new AppError('BAD_REQUEST', 'A day holds at most 50 highlights')
  return save(userId, input.day, content, highlights)
}

/** Delete a day: its text, its highlights and its pictures, bytes included. */
export async function remove(userId: string, input: { day: string }) {
  const day = journalDaySchema.parse(input.day)
  const row = await findRow(userId, day)
  if (!row) throw new AppError('NOT_FOUND', 'No journal entry on that day')
  // Attachments are polymorphic, so no FK takes them with the entry. Deleting
  // their files does: bytes, then file rows, and the cascade the attachments.
  const attached = await db
    .select({ fileId: attachments.fileId })
    .from(attachments)
    .where(and(eq(attachments.parentType, PARENT), eq(attachments.parentId, row.id)))
  await deleteFiles(attached.map((a) => a.fileId))
  await db.delete(journalEntries).where(eq(journalEntries.id, row.id))
  return { success: true }
}

/**
 * Attach a file to a day, starting the day's entry when there is none: a
 * picture alone is an entry.
 */
export async function uploadAttachment(userId: string, raw: UploadJournalAttachment) {
  const { day, ...file } = uploadJournalAttachmentSchema.parse(raw)
  const existing = await findRow(userId, day)
  const [row] = existing
    ? [existing]
    : await db
        .insert(journalEntries)
        .values({ userId, day })
        .onConflictDoUpdate({
          target: [journalEntries.userId, journalEntries.day],
          set: { updatedAt: new Date() },
        })
        .returning()
  if (!row) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to start the journal entry')
  try {
    return await attachmentsService.upload(userId, { ...file, parentType: PARENT, parentId: row.id })
  } catch (err) {
    // A refused upload must not leave behind the empty entry it started.
    if (!existing) {
      await db
        .delete(journalEntries)
        .where(
          and(
            eq(journalEntries.id, row.id),
            eq(journalEntries.content, ''),
            sql`${journalEntries.highlights} = '[]'::jsonb`,
          ),
        )
    }
    throw err
  }
}
