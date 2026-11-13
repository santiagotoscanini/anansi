// Tidy the goal graph: positions for every goal, computed from the connections
// alone. Pure, so the Arrange button and the `arrange_goals` MCP tool give the
// same picture (the service runs it on the server for both).
//
// The picture reads left to right, the way the edges are drawn (out of a
// card's right side, into the next one's left):
//
//   - goals joined by connections form a group, laid out in columns: a goal
//     sits one column right of the last goal that leads into it, and a goal
//     that only leads somewhere sits right before where it leads;
//   - within a column, goals are ordered to keep edges short and uncrossed,
//     starting from the order they already had on the canvas;
//   - groups are stacked top to bottom in the order they already had, and
//     goals with no connection at all go in rows underneath.
//
// So arranging keeps what the user had roughly where it was, and arranging
// twice changes nothing. The top-left corner of the whole graph stays put.

export interface ArrangeGoal {
  id: string
  title: string
  description?: string | null
  position: { x: number; y: number }
}

export interface ArrangeEdge {
  source: string
  target: string
}

export type Positions = Map<string, { x: number; y: number }>

// A goal card is 220 to 300 px wide (GoalNode). Its height depends on its
// text; `cardHeight` estimates it, and the gaps absorb the error.
const CARD_WIDTH = 300
const COLUMN_GAP = 140
const ROW_GAP = 48
const GROUP_GAP = 96
const LOOSE_PER_ROW = 4

/** A card's height, near enough: taller with a wrapped title or a description. */
export function cardHeight(goal: Pick<ArrangeGoal, 'title' | 'description'>): number {
  const titleLines = Math.min(3, Math.max(1, Math.ceil(goal.title.length / 28)))
  return 196 + (titleLines - 1) * 24 + (goal.description?.trim() ? 44 : 0)
}

/** Where a goal was: top to bottom, then left to right, then by id so ties never flip. */
function byCanvas(a: ArrangeGoal, b: ArrangeGoal) {
  return a.position.y - b.position.y || a.position.x - b.position.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/** One connected group as columns of goals, each column ordered top to bottom. */
function columnsOf(group: ArrangeGoal[], out: Map<string, string[]>, into: Map<string, string[]>): ArrangeGoal[][] {
  // Topological order (the app refuses cycles; one that got in anyway is
  // broken by taking whatever is left in canvas order).
  const waiting = new Map(group.map((g) => [g.id, (into.get(g.id) ?? []).length] as const))
  const order: string[] = []
  const ready = group.filter((g) => waiting.get(g.id) === 0).map((g) => g.id)
  const placed = new Set<string>()
  while (order.length < group.length) {
    const id = ready.shift() ?? group.find((g) => !placed.has(g.id))!.id
    if (placed.has(id)) continue
    placed.add(id)
    order.push(id)
    for (const next of out.get(id) ?? []) {
      waiting.set(next, (waiting.get(next) ?? 1) - 1)
      if (waiting.get(next) === 0) ready.push(next)
    }
  }

  // A goal sits right of everything that leads into it…
  const column = new Map<string, number>()
  for (const id of order) {
    const before = (into.get(id) ?? []).filter((p) => column.has(p)).map((p) => column.get(p)!)
    column.set(id, before.length ? Math.max(...before) + 1 : 0)
  }
  // …and as close as it can to what it leads to.
  for (const id of [...order].reverse()) {
    const after = (out.get(id) ?? []).map((n) => column.get(n)!).filter((c) => c > column.get(id)!)
    if (after.length) column.set(id, Math.max(column.get(id)!, Math.min(...after) - 1))
  }

  const count = Math.max(...column.values()) + 1
  const columns: ArrangeGoal[][] = Array.from({ length: count }, () => [])
  for (const g of [...group].sort(byCanvas)) columns[column.get(g.id)!]!.push(g)

  // Order each column by where its neighbours in the column beside it sit,
  // sweeping right then left. A goal with no neighbour there keeps its place.
  const sweep = (from: number, to: number, step: number, neighbours: Map<string, string[]>) => {
    for (let c = from; c !== to; c += step) {
      const beside = new Map((columns[c - step] ?? []).map((g, i) => [g.id, i] as const))
      const rank = new Map(
        columns[c]!.map((g, i) => {
          const at = (neighbours.get(g.id) ?? []).filter((n) => beside.has(n)).map((n) => beside.get(n)!)
          return [g.id, at.length ? at.reduce((s, v) => s + v, 0) / at.length : i] as const
        }),
      )
      const before = new Map(columns[c]!.map((g, i) => [g.id, i] as const))
      columns[c]!.sort((a, b) => rank.get(a.id)! - rank.get(b.id)! || before.get(a.id)! - before.get(b.id)!)
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    sweep(1, count, 1, into)
    sweep(count - 2, -1, -1, out)
  }
  return columns
}

/** New positions for every goal. Goals keep their ids; nothing else is read or changed. */
export function arrangeGoals(goals: readonly ArrangeGoal[], edges: readonly ArrangeEdge[]): Positions {
  const positions: Positions = new Map()
  if (goals.length === 0) return positions

  const known = new Set(goals.map((g) => g.id))
  const out = new Map<string, string[]>()
  const into = new Map<string, string[]>()
  const groupOf = new Map(goals.map((g) => [g.id, g.id] as const))
  const find = (id: string): string => {
    let root = id
    while (groupOf.get(root) !== root) root = groupOf.get(root)!
    groupOf.set(id, root)
    return root
  }
  for (const e of edges) {
    if (!known.has(e.source) || !known.has(e.target) || e.source === e.target) continue
    out.set(e.source, [...(out.get(e.source) ?? []), e.target])
    into.set(e.target, [...(into.get(e.target) ?? []), e.source])
    groupOf.set(find(e.source), find(e.target))
  }

  const sorted = [...goals].sort(byCanvas)
  const groups = new Map<string, ArrangeGoal[]>()
  for (const g of sorted) groups.set(find(g.id), [...(groups.get(find(g.id)) ?? []), g])
  const connected = [...groups.values()].filter((g) => g.length > 1)
  const loose = [...groups.values()].filter((g) => g.length === 1).map((g) => g[0]!)

  const left = Math.min(...goals.map((g) => g.position.x))
  let top = Math.min(...goals.map((g) => g.position.y))

  for (const group of connected) {
    const columns = columnsOf(group, out, into)
    const heights = columns.map((col) => col.reduce((sum, g) => sum + cardHeight(g), 0) + (col.length - 1) * ROW_GAP)
    const tallest = Math.max(...heights)
    columns.forEach((col, c) => {
      // Each column is centred on the group's middle line.
      let y = top + (tallest - heights[c]!) / 2
      for (const g of col) {
        positions.set(g.id, { x: Math.round(left + c * (CARD_WIDTH + COLUMN_GAP)), y: Math.round(y) })
        y += cardHeight(g) + ROW_GAP
      }
    })
    top += tallest + GROUP_GAP
  }

  for (let i = 0; i < loose.length; i += LOOSE_PER_ROW) {
    const row = loose.slice(i, i + LOOSE_PER_ROW)
    row.forEach((g, c) => {
      positions.set(g.id, { x: Math.round(left + c * (CARD_WIDTH + COLUMN_GAP / 2)), y: Math.round(top) })
    })
    top += Math.max(...row.map(cardHeight)) + ROW_GAP
  }

  return positions
}
