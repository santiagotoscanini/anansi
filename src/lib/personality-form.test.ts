import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePersonalityResult, type PersonalityTest } from './personality.ts'
import { detailsToForm, formToDetails, suggestSummary, type PersonalityForm } from './personality-form.ts'

/** Form → details → a valid result → form again gives the same fields back. */
function roundTrip(test: PersonalityTest, form: PersonalityForm) {
  const details = formToDetails(test, form)
  const parsed = parsePersonalityResult({ test, summary: 'x', details })
  if (!parsed.ok) assert.fail(parsed.error)
  return { details: parsed.result.details, form: detailsToForm(test, parsed.result.details) }
}

test('MBTI fields become a type, an identity and only the axes filled in', () => {
  const { details, form } = roundTrip('mbti', { type: 'infj', identity: 'T', ei: '38', sn: '', tf: '', jp: '', at: '' })
  assert.deepEqual(details, { type: 'INFJ', identity: 'T', axes: { ei: 38 } })
  assert.equal(form.type, 'INFJ')
  assert.equal(form.ei, '38')
  assert.equal(form.sn, '')
})

test('an empty number field is absent, a bad one is refused', () => {
  const details = formToDetails('big_five', { openness: 'abc' })
  assert.equal(parsePersonalityResult({ test: 'big_five', summary: 'x', details }).ok, false)
  const fine = roundTrip('big_five', {
    openness: '81',
    conscientiousness: '44,5',
    extraversion: '30',
    agreeableness: '67',
    neuroticism: '52',
  })
  assert.equal((fine.details as { conscientiousness: number }).conscientiousness, 44.5)
})

test('strengths are one per line, in order, with an optional domain in parentheses', () => {
  const { details, form } = roundTrip('clifton_strengths', {
    strengths: 'Learner (Strategic Thinking)\n\n  Achiever  \nInput',
  })
  assert.deepEqual(details, {
    strengths: [{ name: 'Learner', domain: 'Strategic Thinking' }, { name: 'Achiever' }, { name: 'Input' }],
  })
  assert.equal(form.strengths, 'Learner (Strategic Thinking)\nAchiever\nInput')
})

test('love languages rank by score; a ranking without scores keeps its order', () => {
  const { details } = roundTrip('love_languages', { words: '8', time: '11', touch: '', acts: '3', gifts: '' })
  assert.deepEqual(details, {
    ranking: [
      { language: 'time', score: 11 },
      { language: 'words', score: 8 },
      { language: 'acts', score: 3 },
    ],
  })
  const form = detailsToForm('love_languages', { ranking: [{ language: 'touch' }, { language: 'gifts' }] })
  assert.equal(form.touch, '2')
  assert.equal(form.gifts, '1')
  assert.equal(form.words, '')
})

test('enneagram, attachment, DISC and other survive the round trip', () => {
  assert.deepEqual(roundTrip('enneagram', { type: '4', wing: '5', tritype: '459', instinct: 'sx' }).details, {
    type: 4,
    wing: 5,
    tritype: '459',
    instinct: 'sx',
  })
  assert.deepEqual(roundTrip('attachment_style', { style: 'anxious', anxiety: '70', avoidance: '' }).details, {
    style: 'anxious',
    anxiety: 70,
  })
  assert.deepEqual(roundTrip('disc', { primary: 'D', secondary: 'I', D: '80', I: '', S: '', C: '' }).details, {
    primary: 'D',
    secondary: 'I',
    scores: { D: 80 },
  })
  const other = roundTrip('other', { fields: 'Type: Architect\nRole: Analyst' })
  assert.deepEqual(other.details, {
    fields: [
      { label: 'Type', value: 'Architect' },
      { label: 'Role', value: 'Analyst' },
    ],
  })
  assert.equal(other.form.fields, 'Type: Architect\nRole: Analyst')
})

test('a blank summary is suggested where the details say it in any language', () => {
  assert.equal(suggestSummary('mbti', { type: 'infj', identity: 'T' }), 'INFJ-T')
  assert.equal(suggestSummary('enneagram', { type: 4, wing: 5, instinct: 'sp' }), '4w5 sp')
  assert.equal(suggestSummary('clifton_strengths', { strengths: [{ name: 'A' }, { name: 'B' }] }), 'A, B')
  assert.equal(suggestSummary('disc', { primary: 'D', secondary: 'I' }), 'Di')
  assert.equal(suggestSummary('attachment_style', { style: 'secure' }), null)
  assert.equal(suggestSummary('mbti', {}), null)
})
