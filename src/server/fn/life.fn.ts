// Transport only — logic lives in src/server/services/life.ts.
// EXPORTS ONLY SERVER FUNCTIONS — see the note in values.fn.ts.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  createLifeChapterSchema,
  createLifeViewSchema,
  lifeSettingsSchema,
  lifeWeekSchema,
  reorderLifeViewsSchema,
  updateLifeChapterSchema,
  updateLifeViewSchema,
} from '~/lib/api/life'
import { authMiddleware } from '~/server/middleware/auth'
import * as life from '~/server/services/life'

export const fetchLife = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => life.overview(context.userId))

export const fetchLifeWeek = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(lifeWeekSchema)
  .handler(({ data, context }) => life.week(context.userId, data))

export const setLifeSettings = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(lifeSettingsSchema)
  .handler(({ data, context }) => life.setSettings(context.userId, data))

export const createLifeChapter = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(createLifeChapterSchema)
  .handler(({ data, context }) => life.createChapter(context.userId, data))

export const updateLifeChapter = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(updateLifeChapterSchema)
  .handler(({ data, context }) => life.updateChapter(context.userId, data))

export const deleteLifeChapter = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(({ data, context }) => life.removeChapter(context.userId, data.id))

export const createLifeView = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(createLifeViewSchema)
  .handler(({ data, context }) => life.createView(context.userId, data))

export const updateLifeView = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(updateLifeViewSchema)
  .handler(({ data, context }) => life.updateView(context.userId, data))

export const deleteLifeView = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(({ data, context }) => life.removeView(context.userId, data.id))

export const reorderLifeViews = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(reorderLifeViewsSchema)
  .handler(({ data, context }) => life.reorderViews(context.userId, data))
