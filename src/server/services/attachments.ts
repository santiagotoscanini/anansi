// Polymorphic file metadata, keyed on `(parentType, parentId)`. Today's only
// producer is `weekly_sync_item`, but the schema is permissive so other
// entities can opt in without a migration.
//
// Bytes live in the `files` table; `attachments.fileId` is a cascading FK, so
// deleting the metadata row removes the blob in the same transaction.
import { and, eq } from 'drizzle-orm'
import { db } from '~/lib/data'
import { attachments, files, weeklySync, weeklySyncItems } from '~/lib/data/schema'
import { decodeImageUpload, decodeUpload, UploadValidationError } from '~/lib/image-upload'
import { checkRateLimit } from '~/lib/rate-limit'
import type { UploadAttachment } from '~/lib/api/types'
import { AppError } from './errors'
import { fileUrl } from './file-refs'

export async function upload(userId: string, input: UploadAttachment) {
  // 30 attachments per minute per user — generous for batch uploads, tight
  // enough that a runaway loop bails before it burns quota.
  const rl = checkRateLimit('attachments.upload', `user:${userId}`, { limit: 30, windowMs: 60_000 })
  if (!rl.allowed) throw new AppError('TOO_MANY_REQUESTS', 'Too many uploads, slow down')

  // Validate ownership of the parent. weekly_sync_item is the only supported
  // parent type today; adding another means extending this branch.
  if (input.parentType === 'weekly_sync_item') {
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
  const sizeBytes = decoded.buffer.length

  const [file] = await db
    .insert(files)
    .values({
      ownerId: userId,
      fileName: input.fileName,
      mimeType: decoded.mime ?? 'application/octet-stream',
      sizeBytes,
      data: decoded.buffer,
    })
    .returning({ id: files.id })
  if (!file) throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to store attachment bytes')

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
    // Roll the blob back so a failed metadata insert (constraint, race, …)
    // doesn't leave orphan bytes behind.
    await db.delete(files).where(eq(files.id, file.id))
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

/** The attachment with its bytes, for a caller that has no session to reach /api/files with. */
export async function read(userId: string, id: string) {
  const [row] = await db
    .select({
      id: attachments.id,
      fileName: attachments.fileName,
      fileType: attachments.fileType,
      mimeType: files.mimeType,
      sizeBytes: files.sizeBytes,
      data: files.data,
    })
    .from(attachments)
    .innerJoin(files, eq(attachments.fileId, files.id))
    .where(and(eq(attachments.id, id), eq(attachments.userId, userId)))
    .limit(1)
  if (!row) throw new AppError('NOT_FOUND', 'Attachment not found or access denied')
  return row
}

export async function remove(userId: string, id: string) {
  const [existing] = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.userId, userId)))
    .limit(1)
  if (!existing) throw new AppError('NOT_FOUND', 'Attachment not found or access denied')
  // attachments.fileId cascades to files.id — one delete removes both rows.
  await db.delete(attachments).where(eq(attachments.id, id))
  return { success: true }
}
