// Polymorphic file metadata, keyed on `(parentType, parentId)`. Today's only
// producer is `weekly_sync_item`, but the schema is permissive so other
// entities can opt in without a migration.
//
// The bytes are a file (services/files.ts: a `files` row, an object in the
// bucket). `attachments.fileId` → `files.id` cascades, so deleting the file
// row removes the attachment row with it; `remove` deletes the bytes first.
import { and, eq } from 'drizzle-orm'
import { db } from '~/lib/data'
import { attachments, files, weeklySync, weeklySyncItems } from '~/lib/data/schema'
import { decodeImageUpload, decodeUpload, UploadValidationError } from '~/lib/image-upload'
import { checkRateLimit } from '~/lib/rate-limit'
import type { UploadAttachment } from '~/lib/api/types'
import { AppError } from './errors'
import { fileUrl } from './file-refs'
import { deleteFiles, discardFiles, readFile, saveFile } from './files'

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
    .select({ fileId: attachments.fileId })
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.userId, userId)))
    .limit(1)
  if (!existing) throw new AppError('NOT_FOUND', 'Attachment not found or access denied')
  // The bytes, then the file row; the cascade takes the attachment row with it.
  await deleteFiles([existing.fileId])
  return { success: true }
}
