import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  CHAPTERS,
  ITEMS,
  NODES,
  THREADS,
  T,
  cameraAmount,
  pulseAmount,
  captured,
  chapterWeight,
  cloudAmount,
  ease,
  filledCount,
  flash,
  makeCloud,
  nodeAt,
  phonePose,
  project,
  slot,
  typed,
} from './scan-story'

const steps = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n)

describe('the iPhone story timeline', () => {
  test('ease is a clamped smooth step', () => {
    assert.equal(ease(0, 0.2, 0.4), 0)
    assert.equal(ease(1, 0.2, 0.4), 1)
    assert.ok(Math.abs(ease(0.3, 0.2, 0.4) - 0.5) < 1e-9)
  })

  test('chapters tile 0 … 1 in order', () => {
    assert.equal(CHAPTERS[0].range[0], 0)
    for (let i = 1; i < CHAPTERS.length; i++) assert.equal(CHAPTERS[i]!.range[0], CHAPTERS[i - 1]!.range[1])
    assert.ok(CHAPTERS.at(-1)!.range[1] > 1)
  })

  test('two chapter notes never show at once', () => {
    for (let i = 0; i <= 2000; i++) {
      const p = i / 2000
      const shown = CHAPTERS.filter((c) => chapterWeight(p, c.id) > 0.001)
      assert.ok(shown.length <= 1, `${shown.map((c) => c.id).join(' + ')} at ${p}`)
    }
  })

  test('the Pulse and camera screens never show at once', () => {
    for (let i = 0; i <= 2000; i++) {
      const p = i / 2000
      assert.ok(cameraAmount(p) < 0.001 || pulseAmount(p) < 0.001, `both screens at ${p}`)
    }
  })

  test('exactly one chapter note is fully present in the middle of each chapter', () => {
    for (const chapter of CHAPTERS) {
      const mid = (chapter.range[0] + Math.min(1, chapter.range[1])) / 2
      const weights = CHAPTERS.map((c) => chapterWeight(mid, c.id))
      assert.equal(weights.filter((w) => w > 0.99).length, 1, `${chapter.id} at ${mid}: ${weights.join(',')}`)
      assert.ok(chapterWeight(mid, chapter.id) > 0.99)
    }
    assert.equal(chapterWeight(0, 'pocket'), 1)
    assert.equal(chapterWeight(1, 'web'), 1)
  })

  test('the week fills one item at a time and never unfills', () => {
    let last = 0
    for (const p of steps(400)) {
      const n = filledCount(p)
      assert.ok(n >= last, `filled went back at ${p}`)
      last = n
    }
    assert.equal(filledCount(0), 0)
    assert.equal(filledCount(1), ITEMS.length)
  })

  test('the note types from nothing to all of it', () => {
    const text = 'Wrote three pages before coffee.'
    assert.equal(typed(text, T.type[0]), '')
    assert.equal(typed(text, T.type[1]), text)
    assert.ok(typed(text, (T.type[0] + T.type[1]) / 2).length > 0)
  })

  test('the camera is open only around the scan, and faces you while it is', () => {
    assert.equal(cameraAmount(0.1), 0)
    assert.equal(cameraAmount(0.4), 1)
    assert.equal(cameraAmount(0.7), 0)
    assert.equal(phonePose(0.4).rotY, 0)
    assert.ok(phonePose(0).rotY < -20)
  })

  test('the cloud is deterministic and inside the frame', () => {
    const a = makeCloud()
    const b = makeCloud()
    assert.deepEqual(a, b)
    assert.ok(a.length > 200 && a.length < 400, `${a.length} points`)
    for (const point of a) {
      assert.ok(point.x >= 0 && point.x <= 75 && point.y >= 0 && point.y <= 102, JSON.stringify(point))
      assert.ok(point.z >= -0.001)
    }
  })

  test('turning the cloud keeps it in the frame and shades by depth', () => {
    for (const point of makeCloud()) {
      for (const yaw of [-0.42, 0, 0.42]) {
        const seen = project(point, yaw)
        assert.ok(seen.x > -2 && seen.x < 77)
        assert.ok(seen.near >= 0 && seen.near <= 1)
      }
    }
    assert.equal(project({ x: 37.5, y: 40, z: 0 }, 0).x, 37.5)
  })

  test('the sweep captures top to bottom, then the shutter turns the cloud into the picture', () => {
    assert.equal(captured(T.sweep[0]), 0)
    assert.ok(captured(T.sweep[1]) > 100)
    assert.equal(cloudAmount(0.4), 1)
    assert.equal(cloudAmount(T.shutter + 0.01), 0)
    assert.equal(flash(T.shutter), 1)
    assert.equal(flash(T.shutter + 0.02), 0)
  })

  test('every node lands on its own ring slot, and threads join nodes that exist by then', () => {
    const slots = new Set(NODES.map((n) => n.slot))
    assert.equal(slots.size, NODES.length)
    for (const node of NODES) {
      assert.equal(nodeAt(node, node.at - 0.2), null)
      const landed = nodeAt(node, node.at)!
      assert.ok(landed.landed, node.id)
      const target = slot(node.slot)
      assert.ok(Math.abs(landed.x - target.x) < 0.001 && Math.abs(landed.y - target.y) < 0.001)
    }
    const byId = new Map(NODES.map((n) => [n.id, n]))
    for (const thread of THREADS) {
      const from = byId.get(thread.from)
      const to = byId.get(thread.to)
      assert.ok(from && to, `${thread.from} → ${thread.to}`)
      assert.ok(thread.at >= from.at && thread.at >= to.at, `${thread.from} → ${thread.to} drawn before its ends`)
    }
  })
})
