// Helpers shared by every service that stores a reference to an uploaded file.
//
// Bytes live in the `files` table and are served by the /api/files/[id] route.
// Columns that point at one (users.avatarUrl, people.emoji when an image was
// uploaded, attachments) store the URL *string*, not the id — so writing and
// reading that string has to agree, and both live here.

/**
 * The one place the public file URL shape is constructed.
 *
 * This string is persisted in the database (users.avatarUrl, people.emoji), so
 * it is a data format, not just a route: changing it orphans every existing row.
 * If the serving route ever moves, this needs a migration, not just an edit.
 */
export function fileUrl(fileId: string): string {
  return `/api/files/${fileId}`
}

/**
 * Inverse of `fileUrl`. Returns null when the column holds something else —
 * legacy data, a manually-set value, an external URL — so callers can treat
 * "not one of ours" as "nothing to clean up" rather than erroring.
 */
export function parseFileId(value: string | null): string | null {
  if (!value) return null
  const prefix = '/api/files/'
  if (!value.startsWith(prefix)) return null
  const tail = value.slice(prefix.length).split('?')[0] ?? ''
  if (!tail || tail.includes('/')) return null
  return tail
}
