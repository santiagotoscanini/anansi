import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { localDay, toolInput } from './fields'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import { addDays, addYears, looseDay } from '~/lib/life'
import { AppError } from '~/server/services/errors'
import * as life from '~/server/services/life'

// The Life tab: the user's life as weeks, from the birth date to the life
// expectancy, and the chapters on it, past and planned. Written for a
// conversation that fills a life in ("primary school, age 6 to 12"), so a
// chapter's ends take a loose date or an age, and are made exact here.

const WHEN =
  'Each end takes a date (YYYY, YYYY-MM or YYYY-MM-DD: a year or month widens to its first day for a start and its last day for an end) or an age in whole years (startAge 6 = the 6th birthday; endAge 12 = the day before the 12th). Leave the start out for "since I was born" and the end out for "until the end" (the expected life). Pass null in an update to open an end again.'

const end = z.string().max(10).describe('YYYY, YYYY-MM or YYYY-MM-DD.')
const age = z.number().int().min(0).max(130)
const emoji = z.string().max(16).describe('One emoji glyph.')
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .describe('#rrggbb. Left out on create: the next unused chapter colour.')

async function resolveEnd(
  userId: string,
  side: 'start' | 'end',
  value: string | null | undefined,
  ageValue: number | null | undefined,
): Promise<string | null | undefined> {
  if (ageValue !== undefined && ageValue !== null) {
    const { birthDate } = await life.settings(userId)
    if (!birthDate) throw new AppError('BAD_REQUEST', 'Set the birth date first (set_life_settings) to use ages')
    const birthday = addYears(birthDate, ageValue)
    return side === 'start' ? birthday : addDays(birthday, -1)
  }
  if (value === null || ageValue === null) return null
  if (value === undefined) return undefined
  const day = looseDay(value, side)
  if (!day) throw new AppError('BAD_REQUEST', `${side}: "${value}" is not YYYY, YYYY-MM or YYYY-MM-DD`)
  return day
}

export function registerLifeTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'get_life',
    {
      title: 'Get my life in chapters',
      description:
        "The user's birth date, life expectancy (years), every life chapter (past and planned, with start/end days: null start = since birth, null end = until the end of the expected life; and the goals each is linked to) and their views (named selections of chapters).",
      inputSchema: toolInput({}),
    },
    async () => {
      try {
        return mcpJsonResult(await life.list(ctx.userId))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'set_life_settings',
    {
      title: 'Set birth date and life expectancy',
      description:
        "Set the user's birth date and/or how many years they plan on living (default 80). Together they are the grid of weeks on the Life tab.",
      inputSchema: toolInput({
        birthDate: localDay.nullable().optional().describe('YYYY-MM-DD. null clears it.'),
        lifeExpectancyYears: z.number().int().min(1).max(130).optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await life.setSettings(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'create_life_chapter',
    {
      title: 'Add a life chapter',
      description: `A period of the user's life, past or planned: "Primary school", "Living in SF", "Starting a family", "Building the company". Chapters may overlap. Optionally linked to goals (ids from list_goals) and placed in views (ids from get_life). ${WHEN}`,
      inputSchema: toolInput({
        title: z.string().min(1).max(200),
        emoji: emoji.optional(),
        color: color.optional(),
        notes: z.string().max(20_000).optional().describe("What the chapter is or was about, in the user's words."),
        start: end.optional(),
        startAge: age.optional(),
        end: end.optional(),
        endAge: age.optional(),
        goalIds: z.array(z.string()).optional(),
        viewIds: z.array(z.string()).optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ start, startAge, end: endValue, endAge, ...rest }) => {
      try {
        return mcpJsonResult(
          await life.createChapter(ctx.userId, {
            ...rest,
            startDay: await resolveEnd(ctx.userId, 'start', start, startAge),
            endDay: await resolveEnd(ctx.userId, 'end', endValue, endAge),
          }),
        )
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'update_life_chapter',
    {
      title: 'Update a life chapter',
      description: `Change a chapter. Pass only what changes; \`goalIds\` and \`viewIds\` replace the whole set. ${WHEN}`,
      inputSchema: toolInput({
        id: z.string(),
        title: z.string().min(1).max(200).optional(),
        emoji: emoji.nullable().optional(),
        color: color.optional(),
        notes: z.string().max(20_000).nullable().optional(),
        start: end.nullable().optional(),
        startAge: age.nullable().optional(),
        end: end.nullable().optional(),
        endAge: age.nullable().optional(),
        goalIds: z.array(z.string()).optional(),
        viewIds: z.array(z.string()).optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ start, startAge, end: endValue, endAge, ...rest }) => {
      try {
        return mcpJsonResult(
          await life.updateChapter(ctx.userId, {
            ...rest,
            startDay: await resolveEnd(ctx.userId, 'start', start, startAge),
            endDay: await resolveEnd(ctx.userId, 'end', endValue, endAge),
          }),
        )
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'delete_life_chapter',
    {
      title: 'Delete a life chapter',
      description: 'Remove a chapter for good (its goals stay). Confirm with the user.',
      inputSchema: toolInput({ id: z.string() }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await life.removeChapter(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'create_life_view',
    {
      title: 'Add a life view',
      description:
        'A named selection of chapters shown together on the Life tab: "Education", "Where I lived", "Family", "Work".',
      inputSchema: toolInput({
        name: z.string().min(1).max(100),
        emoji: emoji.optional(),
        chapterIds: z.array(z.string()).optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await life.createView(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'update_life_view',
    {
      title: 'Update a life view',
      description: 'Rename a view or change its chapters; `chapterIds` replaces the whole set.',
      inputSchema: toolInput({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        emoji: emoji.nullable().optional(),
        chapterIds: z.array(z.string()).optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await life.updateView(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'delete_life_view',
    {
      title: 'Delete a life view',
      description: 'Remove a view. Its chapters stay.',
      inputSchema: toolInput({ id: z.string() }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await life.removeView(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'get_life_week',
    {
      title: 'Get one week of my life',
      description:
        'One Sunday-to-Saturday week: the chapters it falls in, its journal days, its weekly sync notes and how many pictures it holds.',
      inputSchema: toolInput({ day: localDay.describe('Any day of the week, YYYY-MM-DD.') }),
    },
    async (args) => {
      try {
        return mcpJsonResult(await life.week(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )
}
