import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpCtx } from './types'
import { localDay, toolInput } from './fields'
import { mcpErrorFromUnknown, mcpJsonResult } from '../errors'
import { personalityTestValues } from '~/lib/personality'
import * as personality from '~/server/services/personality'

// Personality test results, usually recorded from a PDF, a screenshot or pasted
// text the user shares in the chat. The per-test `details` shapes below are
// checked by the zod union in ~/lib/personality; the description spells them out
// because the published schema keeps `details` as an open object (one schema
// per test would be nine near-identical tools).

const DETAILS_SHAPES = [
  'Shape of `details` for each `test` (scores are numbers 0-100: percentiles or percentages as the report gives them; leave out what the report does not have):',
  '- big_five: { openness, conscientiousness, extraversion, agreeableness, neuroticism (all required), facets?: [{ trait: one of the five, name, score }] }',
  '- mbti: { type: four letters like "INFJ", identity?: "A" | "T", axes?: { ei?, sn?, tf?, jp?, at? } } where each axis is the percent toward its FIRST letter (E, S, T, J, Assertive): "62% Introverted" is ei: 38.',
  '- enneagram: { type: 1-9, wing?: a type next to it (4 -> 3 or 5, 9 -> 8 or 1), tritype?: "459", instinct?: "sp" | "so" | "sx", scores?: [{ type: 1-9, score }] }',
  '- clifton_strengths: { strengths: [{ name, domain? }] } in rank order, up to 34 (domain: Executing, Influencing, Relationship Building, Strategic Thinking)',
  '- via_strengths: { strengths: [{ name, domain? }] } in rank order, up to 24 (domain: the virtue, e.g. Wisdom)',
  '- attachment_style: { style: "secure" | "anxious" | "avoidant" | "fearful_avoidant", anxiety?, avoidance?, scores?: [{ style, score }] }',
  '- love_languages: { ranking: [{ language: "words" | "acts" | "gifts" | "time" | "touch", score? }] } highest first; score is the raw number the quiz gave',
  '- disc: { primary: "D" | "I" | "S" | "C", secondary?, scores?: { D?, I?, S?, C? } }',
  '- other: { fields: [{ label, value }] } for any other test; name the test in `source` and `summary`.',
].join('\n')

const COMMON = {
  takenAt: localDay
    .optional()
    .describe('The day the test was taken, YYYY-MM-DD, if the report says. Not today by default.'),
  source: z.string().max(200).optional().describe('Who ran the test, e.g. "16Personalities", "Truity", "Gallup".'),
  summary: z
    .string()
    .min(1)
    .max(200)
    .describe('The headline result as the user would say it: "INFJ-T", "4w5 sp", "Secure", "Achiever, Learner, …".'),
  notes: z
    .string()
    .max(10_000)
    .optional()
    .describe('What the result means to the user, in their words. Only if they said.'),
}

const details = z.record(z.string(), z.unknown()).describe('The structured scores; shape depends on `test`, see above.')
const test = z.enum(personalityTestValues)

export function registerPersonalityTools(server: McpServer, ctx: McpCtx): void {
  server.registerTool(
    'list_personality_results',
    {
      title: 'List personality results',
      description:
        "The user's personality test results (MBTI, Enneagram, Big Five, CliftonStrengths, VIA, attachment style, love languages, DISC, other), newest first. A test can have several results: retakes over time.",
      inputSchema: toolInput({ test: test.optional().describe('Only this test.') }),
    },
    async (args) => {
      try {
        return mcpJsonResult(await personality.list(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'record_personality_result',
    {
      title: 'Record a personality result',
      description: `Save one test result, typically read from a PDF, screenshot or text the user shared. A retake is a new result (call this again), not an update. Copy numbers exactly as the report gives them and invent none; when the report has no score for something, leave it out.\n\n${DETAILS_SHAPES}`,
      inputSchema: toolInput({ test, details, ...COMMON }),
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await personality.record(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'update_personality_result',
    {
      title: 'Update a personality result',
      description: `Correct a recorded result. Pass only what changes; null clears \`takenAt\`, \`source\` or \`notes\`. \`details\` replaces the whole details object, and changing \`test\` needs \`details\` that fit the new test.\n\n${DETAILS_SHAPES}`,
      inputSchema: toolInput({
        id: z.string(),
        test: test.optional(),
        details: details.optional(),
        takenAt: localDay.nullable().optional(),
        source: z.string().max(200).nullable().optional(),
        summary: z.string().min(1).max(200).optional(),
        notes: z.string().max(10_000).nullable().optional(),
      }),
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return mcpJsonResult(await personality.update(ctx.userId, args))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )

  server.registerTool(
    'delete_personality_result',
    {
      title: 'Delete a personality result',
      description: 'Remove one result for good. Confirm with the user.',
      inputSchema: toolInput({ id: z.string() }),
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return mcpJsonResult(await personality.remove(ctx.userId, id))
      } catch (e) {
        return mcpErrorFromUnknown(e)
      }
    },
  )
}
