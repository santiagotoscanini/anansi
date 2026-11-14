// Polymorphic file metadata, keyed on `(parentType, parentId)`. The parents
// today are a weekly sync item and a journal entry; the schema is permissive
// so another entity can opt in without a migration.
//
// The bytes are a file (services/files.ts: a `files` row, an object in the
// bucket). `attachments.fileId` → `files.id` cascades, so deleting the file
// row removes the attachment row with it; `remove` deletes the bytes first.
import { and, eq, notExists, sql } from 'drizzle-orm'
import { db } from '~/lib/data'
import { attachments, files, journalEntries, weeklySync, weeklySyncItems } from '~/lib/data/schema'
import { decodeImageUpload, decodeUpload, MAX_MEDIA_UPLOAD_BYTES, UploadValidationError } from '~/lib/image-upload'
import { checkRateLimit } from '~/lib/rate-limit'
import type { UploadAttachment } from '~/lib/api/types'
import { AppError } from './errors'
import { fileUrl } from './file-refs'
import { deleteFiles, discardFiles, readFile, saveFile, saveFileFromPath } from './files'

export async function upload(userId: string, input: UploadAttachment) {
  // 30 attachments per minute per user — generous for batch uploads, tight
  // enough that a runaway loop bails before it burns quota.
  const rl = checkRateLimit('attachments.upload', `user:${userId}`, { limit: 30, windowMs: 60_000 })
  if (!rl.allowed) throw new AppError('TOO_MANY_REQUESTS', 'Too many uploads, slow down')

  // Validate ownership of the parent, one branch per parent type.
  if (input.parentType === 'journal_entry') {
    const [owned] = await db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(eq(journalEntries.id, input.parentId), eq(journalEntries.userId, userId)))
      .limit(1)
    if (!owned) throw new AppError('NOT_FOUND', 'Journal entry not found or access denied')
  } else {
    const [owned] = await db
      .select({ id: weeklySyncItems.id })
      .from(weeklySyncItems)
      .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
      .where(and(eq(weeklySyncItems.id, input.parentId), eq(weeklySync.userId, userId)))
      .limit(1)
    if (!owned) throw new AppError('NOT_FOUND', 'Sync item not found or access denied')
  }

  // Decode + validate (size, plus image magic-bytes when fileType is 'image').
  let decoded
  try {
    decoded = input.fileType === 'image' ? decodeImageUpload(input.data) : decodeUpload(input.data)
  } catch (err) {
    if (err instanceof UploadValidationError) throw new AppError('BAD_REQUEST', err.message)
    throw err
  }

  const file = await saveFile(userId, {
    fileName: input.fileName,
    mimeType: decoded.mime ?? 'application/octet-stream',
    bytes: decoded.buffer,
  })
  const sizeBytes = file.sizeBytes

  let row: typeof attachments.$inferSelect | undefined
  try {
    ;[row] = await db
      .insert(attachments)
      .values({
        userId,
        parentType: input.parentType,
        parentId: input.parentId,
        fileName: input.fileName,
        fileType: input.fileType,
        fileId: file.id,
        sizeBytes,
      })
      .returning()
  } catch (err) {
    // Roll the file back so a failed metadata insert (constraint, race, …)
    // doesn't leave orphan bytes behind.
    await discardFiles([file.id])
    throw err
  }
  if (!row) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to create attachment row')

  return {
    id: row.id,
    fileName: row.fileName,
    fileType: row.fileType,
    url: fileUrl(file.id),
    sizeBytes,
    createdAt: row.createdAt,
  }
}

/** The attachment and its file's record, without the bytes. */
export async function find(userId: string, id: string) {
  const [row] = await db
    .select({
      id: attachments.id,
      fileName: attachments.fileName,
      fileType: attachments.fileType,
      fileId: attachments.fileId,
      mimeType: files.mimeType,
      sizeBytes: files.sizeBytes,
    })
    .from(attachments)
    .innerJoin(files, eq(attachments.fileId, files.id))
    .where(and(eq(attachments.id, id), eq(attachments.userId, userId)))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'Attachment not found or access denied')
  return row
}

/** The attachment with its bytes, for a caller that has no session to reach /api/files with. */
export async function read(userId: string, id: string) {
  const { fileId, ...row } = await find(userId, id)
  const data = await readFile(fileId)
  if (!data) throw new AppError('NOT_FOUND', 'Attachment not found or access denied')
  return { ...row, data }
}

export async function remove(userId: string, id: string) {
  const [existing] = await db
    .select({ fileId: attachments.fileId, parentType: attachments.parentType, parentId: attachments.parentId })
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.userId, userId)))
    .limit(1)
  if (!existing) throw new AppError('NOT_FOUND', 'Attachment not found or access denied')
  // The bytes, then the file row; the cascade takes the attachment row with it.
  await deleteFiles([existing.fileId])
  // A journal day that held only this file now holds nothing, and a day that
  // holds nothing has no entry.
  if (existing.parentType === 'journal_entry') {
    await db.delete(journalEntries).where(
      and(
        eq(journalEntries.id, existing.parentId),
        eq(journalEntries.content, ''),
        sql`${journalEntries.highlights} = '[]'::jsonb`,
        notExists(
          db
            .select({ id: attachments.id })
            .from(attachments)
            .where(and(eq(attachments.parentType, 'journal_entry'), eq(attachments.parentId, journalEntries.id))),
        ),
      ),
    )
  }
  return { success: true }
}

export interface MediaUpload {
  parentType: 'weekly_sync_item' | 'journal_entry'
  parentId: string
  fileName: string
  fileType: 'video' | 'audio'
  /** `video/*` or `audio/*`, as the uploader named it. */
  mimeType: string
  /** Where the bytes are on disk. The caller removes it. */
  path: string
  sizeBytes: number
}

/**
 * A video or a voice recording, stored from a file on disk (`readMediaUpload`
 * put it there). The bytes are kept exactly as they came: nothing is decoded,
 * so nothing is checked beyond the declared type and the size.
 */
export async function uploadMedia(userId: string, input: MediaUpload) {
  const rl = checkRateLimit('attachments.upload', `user:${userId}`, { limit: 30, windowMs: 60_000 })
  if (!rl.allowed) throw new AppError('TOO_MANY_REQUESTS', 'Too many uploads, slow down')
  if (!/^(video|audio)\/[\w.+-]+$/.test(input.mimeType) || !input.mimeType.startsWith(`${input.fileType}/`)) {
    throw new AppError('BAD_REQUEST', `A ${input.fileType} upload needs a ${input.fileType}/* Content-Type`)
  }
  if (input.sizeBytes <= 0) throw new AppError('BAD_REQUEST', 'Empty upload')
  if (input.sizeBytes > MAX_MEDIA_UPLOAD_BYTES) {
    throw new AppError('BAD_REQUEST', `Upload exceeds ${MAX_MEDIA_UPLOAD_BYTES} bytes`)
  }

  if (input.parentType === 'journal_entry') {
    const [owned] = await db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(eq(journalEntries.id, input.parentId), eq(journalEntries.userId, userId)))
      .limit(1)
    if (!owned) throw new AppError('NOT_FOUND', 'Journal entry not found or access denied')
  } else {
    const [owned] = await db
      .select({ id: weeklySyncItems.id })
      .from(weeklySyncItems)
      .innerJoin(weeklySync, eq(weeklySyncItems.weeklySyncId, weeklySync.id))
      .where(and(eq(weeklySyncItems.id, input.parentId), eq(weeklySync.userId, userId)))
      .limit(1)
    if (!owned) throw new AppError('NOT_FOUND', 'Sync item not found or access denied')
  }

  const file = await saveFileFromPath(userId, {
    fileName: input.fileName,
    mimeType: input.mimeType,
    path: input.path,
    sizeBytes: input.sizeBytes,
  })
  let row: typeof attachments.$inferSelect | undefined
  try {
    ;[row] = await db
      .insert(attachments)
      .values({
        userId,
        parentType: input.parentType,
        parentId: input.parentId,
        fileName: input.fileName,
        fileType: input.fileType,
        fileId: file.id,
        sizeBytes: file.sizeBytes,
      })
      .returning()
  } catch (err) {
    await discardFiles([file.id])
    throw err
  }
  if (!row) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to create attachment row')
  return {
    id: row.id,
    fileName: row.fileName,
    fileType: row.fileType,
    url: fileUrl(file.id),
    sizeBytes: file.sizeBytes,
    createdAt: row.createdAt,
  }
}
