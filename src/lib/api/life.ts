import { z } from 'zod'
import { isEmojiGlyph } from '../emoji-utils'
import { isCalendarDay } from '../journal'

// The Life tab's inputs, shared by the service, the server fns and the MCP
// tools. A chapter's days are exact calendar days here; the loose forms people
// say ("2005", "age 6") are made exact by the caller (`looseDay` in ~/lib/life).

const day = z.string().refine(isCalendarDay, 'a calendar day, YYYY-MM-DD')
const emoji = z.string().refine(isEmojiGlyph, 'Must be a short emoji glyph')
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a colour, #rrggbb')

export const lifeSettingsSchema = z.object({
  birthDate: day.nullable().optional(),
  lifeExpectancyYears: z.number().int().min(1).max(130).optional(),
})
export type LifeSettings = z.infer<typeof lifeSettingsSchema>

export const createLifeChapterSchema = z.object({
  title: z.string().trim().min(1).max(200),
  emoji: emoji.nullable().optional(),
  color: color.optional(),
  notes: z.string().max(20_000).nullable().optional(),
  /** null or absent: since birth. */
  startDay: day.nullable().optional(),
  /** null or absent: until the end of the expected life. */
  endDay: day.nullable().optional(),
  goalIds: z.array(z.string()).max(200).optional(),
  viewIds: z.array(z.string()).max(100).optional(),
})
export type CreateLifeChapter = z.infer<typeof createLifeChapterSchema>

export const updateLifeChapterSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1).max(200).optional(),
  emoji: emoji.nullable().optional(),
  color: color.optional(),
  notes: z.string().max(20_000).nullable().optional(),
  startDay: day.nullable().optional(),
  endDay: day.nullable().optional(),
  goalIds: z.array(z.string()).max(200).optional(),
  viewIds: z.array(z.string()).max(100).optional(),
})
export type UpdateLifeChapter = z.infer<typeof updateLifeChapterSchema>

export const createLifeViewSchema = z.object({
  name: z.string().trim().min(1).max(100),
  emoji: emoji.nullable().optional(),
  chapterIds: z.array(z.string()).max(500).optional(),
})
export type CreateLifeView = z.infer<typeof createLifeViewSchema>

export const updateLifeViewSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(100).optional(),
  emoji: emoji.nullable().optional(),
  chapterIds: z.array(z.string()).max(500).optional(),
})
export type UpdateLifeView = z.infer<typeof updateLifeViewSchema>

export const reorderLifeViewsSchema = z.object({ ids: z.array(z.string()).max(100) })

export const lifeWeekSchema = z.object({ day })

// Backups.
export const backupLifeChapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  emoji: z.string().nullable(),
  color: z.string(),
  notes: z.string().nullable(),
  startDay: z.string().nullable(),
  endDay: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export const backupLifeChapterGoalSchema = z.object({
  id: z.string(),
  chapterId: z.string(),
  goalId: z.string(),
  createdAt: z.coerce.date(),
})
export const backupLifeViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string().nullable(),
  orderIdx: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export const backupLifeViewChapterSchema = z.object({
  id: z.string(),
  viewId: z.string(),
  chapterId: z.string(),
  createdAt: z.coerce.date(),
})
