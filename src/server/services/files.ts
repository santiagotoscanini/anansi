// Uploaded files: avatars, photos of people, sync attachments.
//
// A file is two halves. Its RECORD is a row in `files` (owner, name, type,
// size); its BYTES are an object in the app's bucket at `files/<id>`
// (`fileKey`, file-refs.ts), so the row stores no path. Every service that
// stores, serves or deletes a file goes through here, which keeps the two in
// step:
//
//   - A write puts the object first, then inserts the row (always with its
//     Content-Type). A row therefore never names bytes that were not written;
//     a crash in between leaves an object nothing names, never a broken file.
//   - A delete removes the objects first, then the rows. A failed removal
//     throws before any row goes, so the caller sees it and a retry finishes
//     the job; nothing is left behind in the bucket out of sight. The
//     `files → attachments` FK cascades, so an attachment's row goes with its
//     file's row.
//   - A read comes from the bucket only. A row whose object is missing is a
//     missing file, logged by key.
import { createId } from '@paralleldrive/cuid2'
import { and, eq, inArray, like, or, type AnyColumn } from 'drizzle-orm'
import { db } from '~/lib/data'
import { files, people, users } from '~/lib/data/schema'
import { bucket } from '../bucket'
import type { Bytes, StoredObject } from '../object-store'
import { fileKey, fileUrl, parseFileId } from './file-refs'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface NewFile {
  fileName: string
  mimeType: string
  bytes: Uint8Array
}

/** The record half of a file: what a route needs to serve it. */
export interface FileRecord {
  id: string
  mimeType: string
  sizeBytes: number
}

/**
 * Store a new file owned by `ownerId`: its bytes in the bucket, then its row.
 * `conn` is a transaction when the row belongs to a bigger write (a backup
 * import); if that transaction rolls back, the caller discards the object.
 */
export async function saveFile(ownerId: string, file: NewFile, conn: typeof db | Tx = db) {
  const id = createId()
  // A copy with an ArrayBuffer of its own, the shape the store's put takes.
  const bytes: Bytes = new Uint8Array(file.bytes)
  await bucket().put(fileKey(id), bytes, file.mimeType)
  try {
    await conn
      .insert(files)
      .values({ id, ownerId, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: bytes.byteLength })
  } catch (err) {
    await discardFiles([id])
    throw err
  }
  return { id, sizeBytes: bytes.byteLength }
}

/** Delete files, bytes first, then rows (and, through the cascade, their attachments). */
export async function deleteFiles(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  await bucket().remove(ids.map(fileKey))
  await db.delete(files).where(inArray(files.id, [...ids]))
}

/**
 * Remove the objects of files whose rows a committed transaction already
 * deleted. Logged, not thrown: the write the caller asked for has happened,
 * and failing it now would report a success as an error.
 */
export async function removeObjectsOf(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  try {
    await bucket().remove(ids.map(fileKey))
  } catch (err) {
    console.error(`[files] could not remove ${ids.map(fileKey).join(', ')}:`, err)
  }
}

/**
 * Undo a write that is being rolled back: its objects and any rows it made.
 * Best effort and logged; the caller rethrows the error that caused the undo.
 */
export async function discardFiles(ids: readonly string[]): Promise<void> {
  try {
    await deleteFiles(ids)
  } catch (err) {
    console.error(`[files] could not discard ${ids.map(fileKey).join(', ')}:`, err)
  }
}

/** The column holds this file's URL, with or without a `?v=` cache-bust. */
const names = (column: AnyColumn, id: string) => or(eq(column, fileUrl(id)), like(column, `${fileUrl(id)}?%`))

/**
 * A column that pointed at a file (users.avatarUrl, people.emoji) no longer
 * does: delete the file, unless it is not one of ours, not this user's, or
 * still named by another row. Runs after the change that released it has
 * landed, so a failure here is logged, not thrown.
 */
export async function releaseFile(ownerId: string, url: string | null): Promise<void> {
  const id = parseFileId(url)
  if (!id) return
  try {
    const [owned] = await db
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.id, id), eq(files.ownerId, ownerId)))
      .limit(1)
    if (!owned) return
    const [person] = await db.select({ id: people.id }).from(people).where(names(people.emoji, id)).limit(1)
    const [user] = await db.select({ id: users.id }).from(users).where(names(users.avatarUrl, id)).limit(1)
    if (person || user) return
    await deleteFiles([id])
  } catch (err) {
    console.error(`[files] could not delete released ${fileKey(id)}:`, err)
  }
}

/** The owner's file, or null — a missing row and someone else's file look the same. */
export async function findOwnedFile(ownerId: string, id: string): Promise<FileRecord | null> {
  const [row] = await db
    .select({ id: files.id, mimeType: files.mimeType, sizeBytes: files.sizeBytes })
    .from(files)
    .where(and(eq(files.id, id), eq(files.ownerId, ownerId)))
    .limit(1)
  return row ?? null
}

function missing(id: string) {
  console.error(`[files] ${fileKey(id)} is not in the bucket; the file is answered as not found`)
}

/**
 * A file's bytes as a stream (just `range` of them, when one is asked for), or
 * null when the bucket has no object for it. Throws RangeNotSatisfiable.
 */
export async function openFile(id: string, range: string | null): Promise<StoredObject | null> {
  const object = await bucket().open(fileKey(id), range)
  if (!object) missing(id)
  return object
}

/** A file's bytes, whole, or null when the bucket has no object for it. */
export async function readFile(id: string): Promise<Bytes | null> {
  const bytes = await bucket().read(fileKey(id))
  if (!bytes) missing(id)
  return bytes
}

/**
 * Store a new file from a path on disk, streamed to the bucket: for bodies too
 * big to hold in memory (a video). Same order as `saveFile`: the object, then
 * the row. The caller owns the path and removes it.
 */
export async function saveFileFromPath(
  ownerId: string,
  file: { fileName: string; mimeType: string; path: string; sizeBytes: number },
) {
  const id = createId()
  await bucket().putFile(fileKey(id), file.path, file.mimeType)
  try {
    await db
      .insert(files)
      .values({ id, ownerId, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes })
  } catch (err) {
    await discardFiles([id])
    throw err
  }
  return { id, sizeBytes: file.sizeBytes }
}
