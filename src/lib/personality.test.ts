import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  enneagramLabel,
  groupByTest,
  isEnneagramWing,
  newestFirst,
  parsePersonalityResult,
  relativeScores,
  resultDay,
} from './personality.ts'

const ok = (input: unknown) => {
  const r = parsePersonalityResult(input)
  if (!r.ok) assert.fail(r.error)
  return r.result
}
const refused = (input: unknown) => {
  const r = parsePersonalityResult(input)
  assert.equal(r.ok, false, 'expected a refusal')
  return r.ok ? '' : r.error
}

test('a Big Five result needs all five traits, each 0-100; facets are optional', () => {
  const bigFive = { openness: 81, conscientiousness: 44, extraversion: 30, agreeableness: 67, neuroticism: 52 }
  ok({ test: 'big_five', summary: 'High openness', details: bigFive })
  ok({
    test: 'big_five',
    summary: 'High openness',
    details: { ...bigFive, facets: [{ trait: 'openness', name: 'Imagination', score: 90 }] },
  })
  assert.match(
    refused({ test: 'big_five', summary: 'x', details: { ...bigFive, neuroticism: undefined } }),
    /details\.neuroticism/,
  )
  assert.match(refused({ test: 'big_five', summary: 'x', details: { ...bigFive, openness: 120 } }), /details\.openness/)
})

test('an MBTI type is four letters, read in any case; axes lean toward their first letter', () => {
  const r = ok({ test: 'mbti', summary: 'INFJ-T', details: { type: 'infj', identity: 'T', axes: { ei: 38 } } })
  assert.equal(r.test === 'mbti' && r.details.type, 'INFJ')
  assert.match(refused({ test: 'mbti', summary: 'x', details: { type: 'IXFJ' } }), /details\.type/)
  assert.match(
    refused({ test: 'mbti', summary: 'x', details: { type: 'INFJ', axes: { ei: -1 } } }),
    /details\.axes\.ei/,
  )
})

test('an Enneagram wing sits next to its type, round the circle', () => {
  assert.ok(isEnneagramWing(4, 3) && isEnneagramWing(4, 5))
  assert.ok(isEnneagramWing(9, 8) && isEnneagramWing(9, 1))
  assert.ok(isEnneagramWing(1, 9) && isEnneagramWing(1, 2))
  assert.ok(!isEnneagramWing(4, 6) && !isEnneagramWing(4, 4))
  ok({ test: 'enneagram', summary: '9w1', details: { type: 9, wing: 1, tritype: '963', instinct: 'sp' } })
  assert.match(refused({ test: 'enneagram', summary: '4w7', details: { type: 4, wing: 7 } }), /details\.wing/)
  assert.match(refused({ test: 'enneagram', summary: 'x', details: { type: 4, tritype: '45' } }), /tritype/)
  assert.equal(enneagramLabel({ type: 4, wing: 5 }), '4w5')
  assert.equal(enneagramLabel({ type: 4 }), '4')
})

test('strengths keep their order and are capped at the size of each test', () => {
  const r = ok({
    test: 'clifton_strengths',
    summary: 'Learner',
    details: { strengths: [{ name: 'Learner', domain: 'Strategic Thinking' }, { name: 'Achiever' }] },
  })
  assert.deepEqual(r.test === 'clifton_strengths' && r.details.strengths.map((s) => s.name), ['Learner', 'Achiever'])
  const many = Array.from({ length: 25 }, (_, i) => ({ name: `S${i}` }))
  refused({ test: 'via_strengths', summary: 'x', details: { strengths: many } })
  ok({ test: 'clifton_strengths', summary: 'x', details: { strengths: many } })
  refused({ test: 'via_strengths', summary: 'x', details: { strengths: [] } })
})

test('love languages name each language once', () => {
  ok({
    test: 'love_languages',
    summary: 'Quality time',
    details: {
      ranking: [
        { language: 'time', score: 10 },
        { language: 'words', score: 8 },
      ],
    },
  })
  assert.match(
    refused({
      test: 'love_languages',
      summary: 'x',
      details: { ranking: [{ language: 'time' }, { language: 'time' }] },
    }),
    /once/,
  )
})

test('attachment, DISC and other take their own shapes; details must match the test', () => {
  ok({ test: 'attachment_style', summary: 'Secure', details: { style: 'secure', anxiety: 20, avoidance: 15 } })
  ok({ test: 'disc', summary: 'Di', details: { primary: 'D', secondary: 'I', scores: { D: 80, I: 60 } } })
  const other = ok({ test: 'other', summary: 'Hogan', details: {} })
  assert.deepEqual(other.details, { fields: [] })
  // An MBTI details object filed under the Big Five is refused, not stored.
  assert.match(refused({ test: 'big_five', summary: 'x', details: { type: 'INFJ' } }), /details\.openness/)
  refused({ test: 'astrology', summary: 'x', details: {} })
  refused({ test: 'disc', summary: '', details: { primary: 'D' } })
  refused({ test: 'disc', summary: 'D', details: { primary: 'D' }, takenAt: '2026-02-30' })
})

test('the newest result is the one taken last, else the one recorded last', () => {
  const a = { id: 'a', test: 'mbti' as const, takenAt: '2024-01-10', createdAt: new Date('2026-05-01T00:00:00Z') }
  const b = { id: 'b', test: 'mbti' as const, takenAt: null, createdAt: new Date('2025-03-02T10:00:00Z') }
  const c = { id: 'c', test: 'enneagram' as const, takenAt: '2026-01-01', createdAt: new Date('2026-01-02T00:00:00Z') }
  assert.equal(resultDay(b), '2025-03-02')
  assert.deepEqual(
    newestFirst([a, b, c]).map((r) => r.id),
    ['c', 'b', 'a'],
  )
  const grouped = groupByTest([a, b, c])
  assert.deepEqual(
    grouped.get('mbti')?.map((r) => r.id),
    ['b', 'a'],
  )
  assert.equal(grouped.has('big_five'), false)
})

test('relative scores scale to the largest and keep the gaps', () => {
  assert.deepEqual(relativeScores([10, 5, undefined]), [100, 50, null])
  assert.deepEqual(relativeScores([0, 0]), [0, 0])
})
