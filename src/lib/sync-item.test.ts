import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canAddPicture, isLongBlock, nextOrder, pictureMode, syncItemMentionIds } from './sync-item.ts'

test('the mention index covers the notes and every block, each person once', () => {
  const ids = syncItemMentionIds('Talked to @[Ana](person:ana111)', [
    { content: 'Transcript: @[Ana](person:ana111) and @[Bo](person:bo2222)' },
    { content: '' },
  ])
  assert.deepEqual(ids.sort(), ['ana111', 'bo2222'])
  assert.deepEqual(syncItemMentionIds(null, []), [])
  assert.deepEqual(syncItemMentionIds(null, [{ content: '@[Bo](person:bo2222)' }]), ['bo2222'])
})

test('a picture fits until the week has as many as the item takes', () => {
  assert.equal(canAddPicture(null, 40), true)
  assert.equal(canAddPicture(undefined, 0), true)
  assert.equal(canAddPicture(1, 0), true)
  assert.equal(canAddPicture(1, 1), false)
  assert.equal(canAddPicture(3, 2), true)
  assert.equal(canAddPicture(3, 4), false)
})

test('an item that takes one picture has one slot', () => {
  assert.equal(pictureMode(1), 'single')
  assert.equal(pictureMode(2), 'many')
  assert.equal(pictureMode(null), 'many')
})

test('a block folds past twelve lines or a very long paragraph', () => {
  assert.equal(isLongBlock('a\n'.repeat(5)), false)
  assert.equal(isLongBlock(Array.from({ length: 13 }, () => 'line').join('\n')), true)
  assert.equal(isLongBlock(Array.from({ length: 12 }, () => 'line').join('\n')), false)
  assert.equal(isLongBlock('x'.repeat(1300)), true)
})

test('a new block goes after the last', () => {
  assert.equal(nextOrder([]), 0)
  assert.equal(nextOrder([{ orderIdx: 0 }, { orderIdx: 4 }]), 5)
})
