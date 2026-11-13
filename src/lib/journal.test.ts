import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isCalendarDay,
  journalSegments,
  linkMentions,
  mentionedIds,
  mentionToken,
  shiftDay,
  toEditable,
  toPlain,
} from './journal.ts'

const sofia = { id: 'sofia0000000000000000001', name: 'Sofia' }
const ana = { id: 'ana000000000000000000001', name: 'Ana' }
const anaMaria = { id: 'anamaria0000000000000001', name: 'Ana María' }
const people = [sofia, ana, anaMaria]

test('a token names its person and survives a round trip through the editor', () => {
  const stored = `Dinner with ${mentionToken(sofia)} and ${mentionToken(anaMaria)}.`
  assert.deepEqual(mentionedIds(stored), [sofia.id, anaMaria.id])
  const shown = toEditable(stored, people)
  assert.equal(shown, 'Dinner with @Sofia and @Ana María.')
  assert.equal(linkMentions(shown, people).text, stored)
  assert.equal(toPlain(stored, people), 'Dinner with Sofia and Ana María.')
})

test('a typed @Name links, the longest name wins, and a name ends where the word does', () => {
  const { text } = linkMentions('@ana maría came, @Ana left, @Anabel is nobody, mail a@Ana.', people)
  assert.equal(text, `${mentionToken(anaMaria)} came, ${mentionToken(ana)} left, @Anabel is nobody, mail a@Ana.`)
})

test('a renamed person gets the new name; the editor shows it before any write', () => {
  const stored = '@[Sofi](person:sofia0000000000000000001) called'
  assert.equal(toEditable(stored, people), '@Sofia called')
  assert.equal(linkMentions(stored, people).text, `${mentionToken(sofia)} called`)
  // Someone no longer in the list keeps the name that was stored.
  assert.equal(toEditable(stored, []), '@Sofi called')
})

test('an unknown id and an unresolved @[Name] are reported, not guessed', () => {
  const twin = { id: 'sofia0000000000000000002', name: 'sofia' }
  const res = linkMentions('@[Ghost](person:ghost000000000000000001) @[Nobody] @[Sofia] @Sofia', [...people, twin])
  assert.deepEqual(res.unknownIds, ['ghost000000000000000001'])
  assert.deepEqual(res.unresolved, [
    { name: 'Nobody', matches: 0 },
    { name: 'Sofia', matches: 2 },
  ])
  // The ambiguous plain form is left as typed.
  assert.ok(res.text.endsWith('@[Sofia] @Sofia'))
  // A preference (the people the entry already mentions) settles it.
  assert.equal(linkMentions('@Sofia', [...people, twin], [twin.id]).text, mentionToken(twin))
})

test('linking is idempotent and leaves existing tokens whole', () => {
  const once = linkMentions('@Ana and @[Sofia] and @Ana María', people).text
  assert.equal(linkMentions(once, people).text, once)
  assert.equal(mentionedIds(once).length, 3)
})

test('segments alternate text and mentions', () => {
  assert.deepEqual(journalSegments(`a ${mentionToken(ana)} b`), [
    { type: 'text', text: 'a ' },
    { type: 'mention', personId: ana.id, label: 'Ana' },
    { type: 'text', text: ' b' },
  ])
})

test('a name that could break the token is made safe', () => {
  const odd = { id: 'odd000000000000000000001', name: 'A]b' }
  assert.equal(mentionToken(odd), '@[A b](person:odd000000000000000000001)')
  assert.equal(linkMentions('@A b', [odd]).text, mentionToken(odd))
})

test('calendar days', () => {
  assert.ok(isCalendarDay('2026-11-12'))
  assert.ok(!isCalendarDay('2026-02-31'))
  assert.ok(!isCalendarDay('2026-1-1'))
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01')
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28')
})
