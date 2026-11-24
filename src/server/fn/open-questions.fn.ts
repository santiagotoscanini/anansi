// Transport only — logic lives in src/server/services/open-questions.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  addOpenQuestionNoteSchema,
  createOpenQuestionSchema,
  settleOpenQuestionSchema,
  updateOpenQuestionNoteSchema,
  updateOpenQuestionSchema,
} from '~/lib/api/types'
import { authMiddleware } from '~/server/middleware/auth'
import * as openQuestions from '~/server/services/open-questions'

const idInput = z.object({ id: z.string() })

/** Every question with its notes and link ids: open first, then settled. */
export const listOpenQuestions = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => openQuestions.list(context.userId))

export const createOpenQuestion = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(createOpenQuestionSchema)
  .handler(({ data, context }) => openQuestions.create(context.userId, data))

export const updateOpenQuestion = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(updateOpenQuestionSchema)
  .handler(({ data, context }) => openQuestions.update(context.userId, data))

export const settleOpenQuestion = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(settleOpenQuestionSchema)
  .handler(({ data, context }) => openQuestions.settle(context.userId, data))

export const reopenOpenQuestion = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(({ data, context }) => openQuestions.reopen(context.userId, data.id))

export const deleteOpenQuestion = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(({ data, context }) => openQuestions.remove(context.userId, data.id))

export const addOpenQuestionNote = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(addOpenQuestionNoteSchema)
  .handler(({ data, context }) => openQuestions.addNote(context.userId, data))

export const updateOpenQuestionNote = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(updateOpenQuestionNoteSchema)
  .handler(({ data, context }) => openQuestions.updateNote(context.userId, data))

export const deleteOpenQuestionNote = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(({ data, context }) => openQuestions.removeNote(context.userId, data.id))
