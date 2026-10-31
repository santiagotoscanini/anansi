import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safeNext } from './safe-next'

test('keeps a path in this app, query and all', () => {
  assert.equal(safeNext('/app/goals'), '/app/goals')
  const authorize = '/oauth/authorize?client_id=c&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcb&state=s'
  assert.equal(safeNext(authorize), authorize)
})

test('falls back when there is nothing to go to', () => {
  assert.equal(safeNext(undefined), '/app')
  assert.equal(safeNext(null), '/app')
  assert.equal(safeNext(''), '/app')
})

test('refuses what a browser reads as another site', () => {
  for (const next of [
    'https://evil.example/',
    'evil.example',
    '//evil.example',
    '///evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
  ]) {
    assert.equal(safeNext(next), '/app', JSON.stringify(next))
  }
})
