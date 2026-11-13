import assert from 'node:assert/strict'
import { test } from 'node:test'
import { arrangeGoals, cardHeight, type ArrangeGoal } from './arrange.ts'

const goal = (id: string, x: number, y: number, title = id): ArrangeGoal => ({ id, title, position: { x, y } })
const edge = (source: string, target: string) => ({ source, target })

/** No two cards overlap, given the size the layout itself assumes. */
function assertNoOverlap(goals: ArrangeGoal[], positions: Map<string, { x: number; y: number }>) {
  for (const a of goals) {
    for (const b of goals) {
      if (a.id >= b.id) continue
      const pa = positions.get(a.id)!
      const pb = positions.get(b.id)!
      const apart = Math.abs(pa.x - pb.x) >= 300 || pa.y + cardHeight(a) <= pb.y || pb.y + cardHeight(b) <= pa.y
      assert.ok(apart, `${a.id} overlaps ${b.id}`)
    }
  }
}

test('a chain reads left to right, in the direction of its edges', () => {
  const goals = [goal('c', 0, 0), goal('a', 900, 40), goal('b', 30, 500)]
  const p = arrangeGoals(goals, [edge('a', 'b'), edge('b', 'c')])
  assert.ok(p.get('a')!.x < p.get('b')!.x && p.get('b')!.x < p.get('c')!.x)
  assertNoOverlap(goals, p)
})

test('a goal sits right of everything that leads into it, and next to what it leads to', () => {
  // a → b → d, c → d: c has nothing before it, so it sits beside b, not at the far left.
  const goals = [goal('a', 0, 0), goal('b', 0, 100), goal('c', 0, 200), goal('d', 0, 300)]
  const p = arrangeGoals(goals, [edge('a', 'b'), edge('b', 'd'), edge('c', 'd')])
  assert.ok(p.get('d')!.x > p.get('b')!.x)
  assert.equal(p.get('c')!.x, p.get('b')!.x)
  assertNoOverlap(goals, p)
})

test('a column follows the order of the goals it hangs from', () => {
  // top → x, bottom → y, with x and y drawn the wrong way round.
  const goals = [goal('top', 0, 0), goal('bottom', 0, 400), goal('x', 500, 900), goal('y', 500, 100)]
  const p = arrangeGoals(goals, [edge('top', 'x'), edge('bottom', 'y'), edge('top', 'bottom')])
  assert.ok(p.get('top')!.x < p.get('bottom')!.x)
  assertNoOverlap(goals, p)
  const q = arrangeGoals(goals, [edge('top', 'x'), edge('bottom', 'y')])
  // Two separate groups: each keeps to its own band, in canvas order.
  assert.ok(q.get('top')!.y < q.get('bottom')!.y)
  assert.equal(q.get('x')!.y, q.get('top')!.y)
})

test('unconnected goals go in rows under the groups, in the order they had', () => {
  const goals = [
    goal('a', 0, 0),
    goal('b', 400, 0),
    ...['l1', 'l2', 'l3', 'l4', 'l5'].map((id, i) => goal(id, i * 10, 2000 + i)),
  ]
  const p = arrangeGoals(goals, [edge('a', 'b')])
  const below = p.get('a')!.y + cardHeight(goals[0]!)
  for (const id of ['l1', 'l2', 'l3', 'l4', 'l5']) assert.ok(p.get(id)!.y >= below, id)
  assert.equal(p.get('l1')!.y, p.get('l4')!.y)
  assert.ok(p.get('l5')!.y > p.get('l1')!.y)
  assert.ok(p.get('l1')!.x < p.get('l2')!.x)
  assertNoOverlap(goals, p)
})

test('the top-left corner stays put, and arranging twice changes nothing', () => {
  const goals = [goal('a', 120, -80), goal('b', 700, 300), goal('c', 300, 900), goal('d', 150, 60)]
  const edges = [edge('a', 'b'), edge('d', 'b')]
  const once = arrangeGoals(goals, edges)
  assert.equal(Math.min(...[...once.values()].map((v) => v.x)), 120)
  assert.equal(Math.min(...[...once.values()].map((v) => v.y)), -80)
  const moved = goals.map((g) => ({ ...g, position: once.get(g.id)! }))
  assert.deepEqual([...arrangeGoals(moved, edges)], [...once])
})

test('edges to goals that are not there, and a cycle, do not break it', () => {
  const goals = [goal('a', 0, 0), goal('b', 0, 100), goal('c', 0, 200)]
  const p = arrangeGoals(goals, [edge('a', 'gone'), edge('a', 'b'), edge('b', 'c'), edge('c', 'a')])
  assert.equal(p.size, 3)
  assertNoOverlap(goals, p)
  assert.equal(arrangeGoals([], []).size, 0)
})
