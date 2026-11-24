// Personality test results: what each test is, the shape of its structured
// scores, and which result of a test is the one to show.
//
// Pure (zod only), so the server, the screens, the MCP tools and the tests all
// share it. A result is `{ test, details, ...common }`; `details` is checked
// against its test's schema by a discriminated union, so a Big Five result
// cannot carry an MBTI type and a model filling one in from a PDF gets told
// exactly which field is wrong.
import { z } from 'zod'
import { isCalendarDay } from './journal'

export const personalityTestValues = [
  'mbti',
  'enneagram',
  'big_five',
  'clifton_strengths',
  'via_strengths',
  'attachment_style',
  'love_languages',
  'disc',
  'other',
] as const

export type PersonalityTest = (typeof personalityTestValues)[number]

/** A 0–100 score: a percentile, a percentage, or a test's own 0–100 scale. */
const score = z.number().min(0).max(100)

export const bigFiveTraits = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'] as const
export type BigFiveTrait = (typeof bigFiveTraits)[number]

export const bigFiveDetailsSchema = z.object({
  openness: score,
  conscientiousness: score,
  extraversion: score,
  agreeableness: score,
  neuroticism: score,
  facets: z
    .array(z.object({ trait: z.enum(bigFiveTraits), name: z.string().trim().min(1).max(80), score }))
    .max(60)
    .optional(),
})

/**
 * MBTI-style axes. Each is the percent toward the FIRST letter of its pair:
 * `ei: 38` means 38% Extraverted, i.e. 62% Introverted. `at` is the
 * 16Personalities identity axis (Assertive vs Turbulent).
 */
export const mbtiAxes = [
  { key: 'ei', left: 'E', right: 'I' },
  { key: 'sn', left: 'S', right: 'N' },
  { key: 'tf', left: 'T', right: 'F' },
  { key: 'jp', left: 'J', right: 'P' },
  { key: 'at', left: 'A', right: 'T' },
] as const
export type MbtiAxis = (typeof mbtiAxes)[number]['key']

export const mbtiDetailsSchema = z.object({
  type: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .pipe(z.string().regex(/^[EI][SN][TF][JP]$/, 'four letters, like INFJ')),
  identity: z.enum(['A', 'T']).optional(),
  axes: z
    .object({
      ei: score.optional(),
      sn: score.optional(),
      tf: score.optional(),
      jp: score.optional(),
      at: score.optional(),
    })
    .optional(),
})

const enneagramType = z.number().int().min(1).max(9)

/** A wing is one of the two types beside the core on the circle (9 sits next to 1). */
export function isEnneagramWing(type: number, wing: number): boolean {
  return wing === (type % 9) + 1 || wing === ((type + 7) % 9) + 1
}

export const enneagramDetailsSchema = z
  .object({
    type: enneagramType,
    wing: enneagramType.optional(),
    tritype: z
      .string()
      .regex(/^[1-9]{3}$/, 'three digits, like 459')
      .optional(),
    instinct: z.enum(['sp', 'so', 'sx']).optional(),
    scores: z
      .array(z.object({ type: enneagramType, score }))
      .max(9)
      .optional(),
  })
  .refine((d) => d.wing === undefined || isEnneagramWing(d.type, d.wing), {
    message: 'the wing must be a type next to the core type (a 4 has wing 3 or 5; a 9 has 8 or 1)',
    path: ['wing'],
  })

const strengthsSchema = (max: number) =>
  z.object({
    strengths: z
      .array(z.object({ name: z.string().trim().min(1).max(80), domain: z.string().trim().max(80).optional() }))
      .min(1)
      .max(max),
  })

/** CliftonStrengths: up to all 34 themes, in rank order. */
export const cliftonDetailsSchema = strengthsSchema(34)
/** VIA Character Strengths: up to all 24, in rank order. */
export const viaDetailsSchema = strengthsSchema(24)

export const loveLanguageValues = ['words', 'acts', 'gifts', 'time', 'touch'] as const
export type LoveLanguage = (typeof loveLanguageValues)[number]

export const loveLanguagesDetailsSchema = z.object({
  ranking: z
    .array(z.object({ language: z.enum(loveLanguageValues), score: z.number().min(0).max(1000).optional() }))
    .min(1)
    .max(5)
    .refine((r) => new Set(r.map((x) => x.language)).size === r.length, 'each language at most once'),
})

export const attachmentStyleValues = ['secure', 'anxious', 'avoidant', 'fearful_avoidant'] as const
export type AttachmentStyle = (typeof attachmentStyleValues)[number]

export const attachmentDetailsSchema = z.object({
  style: z.enum(attachmentStyleValues),
  anxiety: score.optional(),
  avoidance: score.optional(),
  scores: z
    .array(z.object({ style: z.enum(attachmentStyleValues), score }))
    .max(4)
    .optional(),
})

export const discFactorValues = ['D', 'I', 'S', 'C'] as const
export type DiscFactor = (typeof discFactorValues)[number]

export const discDetailsSchema = z.object({
  primary: z.enum(discFactorValues),
  secondary: z.enum(discFactorValues).optional(),
  scores: z.object({ D: score.optional(), I: score.optional(), S: score.optional(), C: score.optional() }).optional(),
})

export const otherDetailsSchema = z.object({
  fields: z
    .array(z.object({ label: z.string().trim().min(1).max(120), value: z.string().trim().min(1).max(500) }))
    .max(50)
    .default([]),
})

export const personalityDetailsSchemas = {
  mbti: mbtiDetailsSchema,
  enneagram: enneagramDetailsSchema,
  big_five: bigFiveDetailsSchema,
  clifton_strengths: cliftonDetailsSchema,
  via_strengths: viaDetailsSchema,
  attachment_style: attachmentDetailsSchema,
  love_languages: loveLanguagesDetailsSchema,
  disc: discDetailsSchema,
  other: otherDetailsSchema,
} as const

export type MbtiDetails = z.infer<typeof mbtiDetailsSchema>
export type EnneagramDetails = z.infer<typeof enneagramDetailsSchema>
export type BigFiveDetails = z.infer<typeof bigFiveDetailsSchema>
export type StrengthsDetails = z.infer<typeof cliftonDetailsSchema>
export type LoveLanguagesDetails = z.infer<typeof loveLanguagesDetailsSchema>
export type AttachmentDetails = z.infer<typeof attachmentDetailsSchema>
export type DiscDetails = z.infer<typeof discDetailsSchema>
export type OtherDetails = z.infer<typeof otherDetailsSchema>

const takenAtSchema = z.string().refine(isCalendarDay, 'a calendar day, YYYY-MM-DD')

/** The fields every result has, whatever the test. */
const commonFields = {
  takenAt: takenAtSchema.nullable().optional(),
  source: z.string().trim().max(200).nullable().optional(),
  summary: z.string().trim().min(1).max(200),
  notes: z.string().max(10_000).nullable().optional(),
}

const branch = <T extends PersonalityTest, S extends z.ZodType>(test: T, details: S) =>
  z.object({ test: z.literal(test), details, ...commonFields })

/** A whole result as it is written: the test, its details, and the common fields. */
export const personalityResultInputSchema = z.discriminatedUnion('test', [
  branch('mbti', mbtiDetailsSchema),
  branch('enneagram', enneagramDetailsSchema),
  branch('big_five', bigFiveDetailsSchema),
  branch('clifton_strengths', cliftonDetailsSchema),
  branch('via_strengths', viaDetailsSchema),
  branch('attachment_style', attachmentDetailsSchema),
  branch('love_languages', loveLanguagesDetailsSchema),
  branch('disc', discDetailsSchema),
  branch('other', otherDetailsSchema),
])

export type PersonalityResultInput = z.infer<typeof personalityResultInputSchema>

/**
 * A patch: the id plus any common field, and `test`/`details` if they change.
 * The merged result is checked against the union, so changing `test` needs
 * `details` that fit the new test.
 */
export const updatePersonalityResultSchema = z.object({
  id: z.string(),
  test: z.enum(personalityTestValues).optional(),
  details: z.unknown().optional(),
  takenAt: takenAtSchema.nullable().optional(),
  source: z.string().trim().max(200).nullable().optional(),
  summary: z.string().trim().min(1).max(200).optional(),
  notes: z.string().max(10_000).nullable().optional(),
})

export type UpdatePersonalityResult = z.infer<typeof updatePersonalityResultSchema>

/**
 * Check a whole result against the union. Answers the parsed result, or its
 * first problems as one readable sentence (field path and reason): what an MCP
 * caller sees when it got a field wrong, and what the form shows.
 */
export function parsePersonalityResult(
  input: unknown,
): { ok: true; result: PersonalityResultInput } | { ok: false; error: string } {
  const parsed = personalityResultInputSchema.safeParse(input)
  if (parsed.success) return { ok: true, result: parsed.data }
  const said = parsed.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.length ? i.path.join('.') : 'result'}: ${i.message}`)
    .join('; ')
  return { ok: false, error: `Invalid personality result: ${said}` }
}

interface Dated {
  takenAt: string | null
  createdAt: Date | string
}

/** The day a result stands for: when it was taken, else when it was recorded. */
export function resultDay(r: Dated): string {
  if (r.takenAt) return r.takenAt
  const d = typeof r.createdAt === 'string' ? new Date(r.createdAt) : r.createdAt
  return d.toISOString().slice(0, 10)
}

/** Newest first: by the day it stands for, then by when it was recorded. */
export function newestFirst<T extends Dated>(results: readonly T[]): T[] {
  const time = (r: T) => new Date(r.createdAt).getTime()
  return [...results].sort((a, b) => {
    const byDay = resultDay(b).localeCompare(resultDay(a))
    return byDay !== 0 ? byDay : time(b) - time(a)
  })
}

/** Each test's results, newest first; tests with none are absent. */
export function groupByTest<T extends Dated & { test: PersonalityTest }>(
  results: readonly T[],
): Map<PersonalityTest, T[]> {
  const m = new Map<PersonalityTest, T[]>()
  for (const r of newestFirst(results)) {
    const arr = m.get(r.test) ?? []
    arr.push(r)
    m.set(r.test, arr)
  }
  return m
}

/**
 * A reputable free version of each test, for the "not taken yet" rows.
 * CliftonStrengths and DISC have no free official version, so none is offered.
 */
export const personalityTestLinks: Partial<Record<PersonalityTest, string>> = {
  big_five: 'https://bigfive-test.com',
  mbti: 'https://www.16personalities.com',
  enneagram: 'https://www.truity.com/test/enneagram-personality-test',
  via_strengths: 'https://www.viacharacter.org',
  attachment_style: 'https://www.attachmentproject.com/attachment-style-quiz/',
  love_languages: 'https://5lovelanguages.com/quizzes/love-language',
}

/** Love-language scores scaled to the largest one, as 0–100 bar widths. */
export function relativeScores(values: readonly (number | undefined)[]): (number | null)[] {
  const max = Math.max(0, ...values.map((v) => v ?? 0))
  return values.map((v) => (v === undefined ? null : max > 0 ? (v / max) * 100 : 0))
}

/** The enneagram label: `4w5`, or `4` without a wing. */
export function enneagramLabel(d: Pick<EnneagramDetails, 'type' | 'wing'>): string {
  return d.wing ? `${d.type}w${d.wing}` : String(d.type)
}

/** What a stored `details` holds: one of the per-test shapes. */
export type PersonalityDetails =
  | MbtiDetails
  | EnneagramDetails
  | BigFiveDetails
  | StrengthsDetails
  | LoveLanguagesDetails
  | AttachmentDetails
  | DiscDetails
  | OtherDetails
