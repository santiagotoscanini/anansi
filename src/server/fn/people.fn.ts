// Transport only — logic lives in src/server/services/people.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createPersonSchema, personCategoryValues, updatePersonSchema } from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as people from '~/server/services/people'

const idInput = z.object({ id: z.string() })
const personIdInput = z.object({ personId: z.string() })

/** Archived people are excluded unless asked for — the People tab reads 5, not 6. */
export const listPeople = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ includeArchived: z.boolean().optional() }).default({}))
  .handler(({ data, context }) => people.list(context.userId, data))

export const getPerson = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(({ data, context }) => people.getById(context.userId, data.id))

export const createPerson = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(createPersonSchema)
  .handler(({ data, context }) => people.create(context.userId, data))

export const updatePerson = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(updatePersonSchema)
  .handler(({ data, context }) => people.update(context.userId, data))

/** Archiving is the preferred removal — `deletePerson` is for wrong entries only. */
export const archivePerson = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(({ data, context }) => people.archive(context.userId, data.id))

export const unarchivePerson = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(({ data, context }) => people.unarchive(context.userId, data.id))

export const deletePerson = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(({ data, context }) => people.remove(context.userId, data.id))

/** The Relationships board's drag-drop endpoint: category + board position only. */
export const setPersonCategory = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string(),
      category: z.enum(personCategoryValues),
      boardOrder: z.number().int().optional(),
    }),
  )
  .handler(({ data, context }) => people.setCategory(context.userId, data))

/** "Tasks I'm relying on them for", with the parent goal for context. */
export const getPersonTasksAsReferent = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(personIdInput)
  .handler(({ data, context }) => people.getTasksAsReferent(context.userId, data.personId))

export const getPersonBucketListItems = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(personIdInput)
  .handler(({ data, context }) => people.getBucketListItemsAsParticipant(context.userId, data.personId))

/** base64 in, `/api/files/{id}` out — the value that goes in `people.emoji`. */
export const uploadPersonImage = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      fileName: z.string().min(1).max(255),
      // The `data:` prefix is permitted but not required. Size and magic bytes
      // are validated inside the service, not here.
      data: z.string().min(1),
    }),
  )
  .handler(({ data, context }) => people.uploadImage(context.userId, data))
