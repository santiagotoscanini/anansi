// Transport only — logic lives in src/server/services/journal.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  journalDaySchema,
  listJournalEntriesSchema,
  uploadJournalAttachmentSchema,
  writeJournalEntrySchema,
} from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as journal from '~/server/services/journal'

const dayInput = z.object({ day: journalDaySchema })

/** The day's entry, or null when nothing was written. */
export const getJournalEntry = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(dayInput)
  .handler(({ data, context }) => journal.get(context.userId, data))

/** Newest day first; `personId` keeps the days that mention that person. */
export const listJournalEntries = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(listJournalEntriesSchema)
  .handler(({ data, context }) => journal.list(context.userId, data))

/** Replace-set on the fields passed. A day written empty is deleted, and null comes back. */
export const writeJournalEntry = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(writeJournalEntrySchema)
  .handler(({ data, context }) => journal.write(context.userId, data))

export const deleteJournalEntry = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(dayInput)
  .handler(({ data, context }) => journal.remove(context.userId, data))

/** base64 in; starts the day's entry when there is none. Deleting goes through `deleteAttachment`. */
export const uploadJournalAttachment = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(uploadJournalAttachmentSchema)
  .handler(({ data, context }) => journal.uploadAttachment(context.userId, data))
