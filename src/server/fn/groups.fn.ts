// Transport only — logic lives in src/server/services/groups.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createPersonGroupSchema, updatePersonGroupSchema } from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as groups from '~/server/services/groups'

// Groups are cross-entity: the same row tags both people and tasks. The DB
// table is still named `person_groups` for backwards compatibility; the
// user-facing concept is just "Groups".
export const listGroups = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => groups.list(context.userId))

export const createGroup = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(createPersonGroupSchema)
  .handler(({ data, context }) => groups.create(context.userId, data))

export const updateGroup = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(updatePersonGroupSchema)
  .handler(({ data, context }) => groups.update(context.userId, data))

export const deleteGroup = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(({ data, context }) => groups.remove(context.userId, data.id))

/** Tasks tagged with this group, joined with their goal — the group filter view. */
export const getGroupTasks = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(z.object({ groupId: z.string() }))
  .handler(({ data, context }) => groups.getTasks(context.userId, data.groupId))
