// The "On your iPhone" story, as pure arithmetic: everything the section
// draws is a function of one number, p (0 → 1, the scroll through the
// section). No React, no DOM, so the timeline can be tested and the component
// only has to paint what these functions say.
//
// The story, in five chapters:
//   0. The week in your pocket: the phone, tilted, shows Pulse with four
//      unfilled items.
//   1. Write it as it happens: a note types itself into Morning pages, the
//      item fills, the note flies out to the web.
//   2. The scan: the pose camera opens on Face. The outline traces itself, a
//      scan line sweeps down and leaves a point cloud of head and shoulders
//      (depth-shaded), the cloud turns in 3D, last week's picture fades in,
//      the shutter flashes, the picture flies out to the web.
//   3. Every thread lands: Sleep and Call Papá fill and fly out; the goal,
//      value, group and date they belong to light up on the ring, and clay
//      threads join them.
//   4. Pull one thread: the phone settles inside a whole web, 4/4 filled.
//
// Stage units: the stage is a 1000 × 1000 square. The phone sits in its
// middle; the web's outer ring is the octagon around it.

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** 0 before a, 1 after b, a smooth step between. */
export function ease(p: number, a: number, b: number): number {
  const t = clamp01((p - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** 1 inside [a, b], fading over `fade` on each side. */
export function window01(p: number, a: number, b: number, fade = 0.025): number {
  return Math.min(ease(p, a - fade, a), 1 - ease(p, b, b + fade))
}

export const CHAPTERS = [
  { id: 'pocket', range: [0, 0.13] },
  { id: 'write', range: [0.13, 0.25] },
  { id: 'scan', range: [0.25, 0.6] },
  { id: 'threads', range: [0.6, 0.8] },
  { id: 'web', range: [0.8, 1.01] },
] as const

export type ChapterId = (typeof CHAPTERS)[number]['id']

/**
 * How present each chapter's note is. One note at a time: the outgoing one is
 * gone before the next one comes in, so two never show on top of each other.
 */
export function chapterWeight(p: number, id: ChapterId): number {
  const chapter = CHAPTERS.find((c) => c.id === id)
  if (!chapter) return 0
  const [a, b] = chapter.range
  const fadeIn = a <= 0 ? 1 : ease(p, a + 0.002, a + 0.018)
  const fadeOut = b > 1 ? 1 : 1 - ease(p, b - 0.018, b - 0.002)
  return Math.min(fadeIn, fadeOut)
}

// ── Timing (in p) ───────────────────────────────────────────────────────────

export const T = {
  type: [0.15, 0.21],
  camera: [0.25, 0.28],
  outline: [0.28, 0.33],
  sweep: [0.33, 0.45],
  turn: [0.45, 0.53],
  ghost: [0.47, 0.53],
  shutter: 0.545,
  cameraOut: [0.58, 0.61],
  context: [0.68, 0.76],
  settle: [0.8, 0.9],
} as const

// ── The phone ───────────────────────────────────────────────────────────────

export interface PhonePose {
  /** Degrees. */
  rotY: number
  rotX: number
  scale: number
}

/** Tilted at rest, square to you while it scans, settling into the web at the end. */
export function phonePose(p: number): PhonePose {
  const face = ease(p, 0.22, 0.29) - ease(p, 0.6, 0.68)
  const settle = ease(p, T.settle[0], T.settle[1])
  return {
    rotY: -24 * (1 - face) * (1 - settle) + 6 * settle,
    rotX: 9 * (1 - face) * (1 - settle) + 3 * settle,
    scale: 1 + 0.04 * face - 0.1 * settle,
  }
}

/**
 * The two screens never double-expose: Pulse fades out before the camera fades
 * in, and the camera is gone before Pulse comes back.
 */
export function cameraAmount(p: number): number {
  const [inA, inB] = T.camera
  const [outA, outB] = T.cameraOut
  const mid = (outA + outB) / 2
  return ease(p, (inA + inB) / 2, inB) * (1 - ease(p, outA, mid))
}

export function pulseAmount(p: number): number {
  const [inA, inB] = T.camera
  const [outA, outB] = T.cameraOut
  return 1 - ease(p, inA, (inA + inB) / 2) + ease(p, (outA + outB) / 2, outB)
}

// ── Writing ─────────────────────────────────────────────────────────────────

/** The first part of `text` that has been "typed" by p. */
export function typed(text: string, p: number, a: number = T.type[0], b: number = T.type[1]): string {
  const n = Math.round(clamp01((p - a) / (b - a)) * text.length)
  return text.slice(0, n)
}

// ── The point cloud ─────────────────────────────────────────────────────────

/** Camera-frame units: the 3:4 frame is 75 × 100; z comes toward the camera. */
export interface CloudPoint {
  x: number
  y: number
  z: number
}

export const FRAME = { w: 75, h: 100, cx: 37.5 } as const

/** A small seeded generator, so the cloud is the same on the server and every client. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The points a depth sensor would return from a head and shoulders facing the
 * camera: the front of an ellipsoid (the head), a short cylinder (the neck)
 * and a flattened, widening cylinder (shoulders and chest) down to the frame's
 * lower edge. Jittered grids, so the cloud reads as a scan, not a texture.
 */
export function makeCloud(seed = 7): CloudPoint[] {
  const rand = mulberry32(seed)
  const jitter = (s: number) => (rand() - 0.5) * s
  const points: CloudPoint[] = []
  // Head: center (37.5, 42), radii 11 × 14 × 10, front hemisphere.
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 11; j++) {
      const v = -Math.PI / 2 + ((i + 0.5 + jitter(0.6)) / 13) * Math.PI
      const u = -Math.PI / 2 + ((j + 0.5 + jitter(0.6)) / 11) * Math.PI
      points.push({
        x: FRAME.cx + 11 * Math.cos(v) * Math.sin(u),
        y: 42 + 14 * Math.sin(v),
        z: 10 * Math.cos(v) * Math.cos(u),
      })
    }
  }
  // Neck.
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 5; j++) {
      const u = -Math.PI / 2 + ((j + 0.5 + jitter(0.5)) / 5) * Math.PI
      points.push({ x: FRAME.cx + 5 * Math.sin(u), y: 56 + i * 2.6 + jitter(1), z: 5 * Math.cos(u) })
    }
  }
  // Shoulders and chest.
  for (let i = 0; i < 12; i++) {
    const y = 66 + i * 3 + jitter(1.2)
    const w = Math.min(30, 9 + (y - 66) * 1.1)
    const across = Math.round(6 + w / 2.4)
    for (let j = 0; j < across; j++) {
      const t = (j + 0.5 + jitter(0.5)) / across
      const x = -w + 2 * w * t
      points.push({ x: FRAME.cx + x, y, z: Math.sqrt(Math.max(0, w * w - x * x)) * 0.42 })
    }
  }
  return points
}

export interface ProjectedPoint {
  x: number
  y: number
  /** 0 (far) … 1 (near), for shading. */
  near: number
}

/** The point seen from a camera turned by `yaw` (radians) around the body's vertical axis. */
export function project(point: CloudPoint, yaw: number): ProjectedPoint {
  const dx = point.x - FRAME.cx
  const x = FRAME.cx + dx * Math.cos(yaw) + point.z * Math.sin(yaw)
  const depth = point.z * Math.cos(yaw) - dx * Math.sin(yaw)
  return { x, y: point.y, near: clamp01((depth + 12) / 24) }
}

/** Where the scan line is (frame units, 0 → past the bottom), or null when it is not sweeping. */
export function scanLine(p: number): number | null {
  const [a, b] = T.sweep
  if (p < a || p > b) return null
  return ((p - a) / (b - a)) * (FRAME.h + 6)
}

/** How far down the frame the cloud has been captured (frame units). */
export function captured(p: number): number {
  const [a, b] = T.sweep
  return clamp01((p - a) / (b - a)) * (FRAME.h + 6)
}

/** The cloud's turn: a slow look from one side to the other once the sweep is done (radians). */
export function cloudYaw(p: number): number {
  const t = ease(p, T.turn[0], T.turn[1])
  return Math.sin(t * Math.PI * 2) * 0.42
}

/** How visible the cloud is: there while scanning, gone into the picture at the shutter. */
export function cloudAmount(p: number): number {
  return ease(p, T.sweep[0], T.sweep[0] + 0.01) * (1 - ease(p, T.shutter - 0.004, T.shutter + 0.006))
}

/** The shutter's white flash, peaking at T.shutter. */
export function flash(p: number): number {
  return Math.max(0, 1 - Math.abs(p - T.shutter) / 0.008)
}

/** The picture just taken, shown after the shutter until the camera closes. */
export function photoAmount(p: number): number {
  return ease(p, T.shutter, T.shutter + 0.01)
}

// ── The web ─────────────────────────────────────────────────────────────────

export const STAGE = { size: 1000, cx: 500, cy: 500, ring: 430, inner: 215 } as const

/** Where the phone's screen is, in stage units (where captures leave from). */
export const PHONE_CENTER = { x: 500, y: 470 } as const

/** Ring slot i (0 = top, clockwise), in stage units. */
export function slot(i: number, radius: number = STAGE.ring): { x: number; y: number } {
  const angle = -Math.PI / 2 + (i * Math.PI) / 4
  return { x: STAGE.cx + radius * Math.cos(angle), y: STAGE.cy + radius * Math.sin(angle) }
}

export type NodeKind = 'note' | 'photo' | 'goal' | 'value' | 'group' | 'date'
export type NodeId = 'pages' | 'face' | 'sleep' | 'papa' | 'health' | 'craft' | 'family' | 'birthday'

export interface WebNode {
  id: NodeId
  kind: NodeKind
  slot: number
  /** p at which it lands (captures) or appears (context). */
  at: number
  /** Captures fly out of the phone; context records fade in on the ring. */
  flies: boolean
}

export const NODES: readonly WebNode[] = [
  { id: 'pages', kind: 'note', slot: 7, at: 0.235, flies: true },
  { id: 'face', kind: 'photo', slot: 1, at: 0.6, flies: true },
  { id: 'sleep', kind: 'note', slot: 3, at: 0.655, flies: true },
  { id: 'papa', kind: 'note', slot: 5, at: 0.69, flies: true },
  { id: 'health', kind: 'goal', slot: 2, at: 0.7, flies: false },
  { id: 'craft', kind: 'value', slot: 0, at: 0.725, flies: false },
  { id: 'family', kind: 'group', slot: 4, at: 0.75, flies: false },
  { id: 'birthday', kind: 'date', slot: 6, at: 0.775, flies: false },
]

/** Which records a thread joins, and when it is drawn. */
export const THREADS: readonly { from: NodeId; to: NodeId; at: number }[] = [
  { from: 'face', to: 'health', at: 0.715 },
  { from: 'sleep', to: 'health', at: 0.725 },
  { from: 'pages', to: 'craft', at: 0.74 },
  { from: 'papa', to: 'family', at: 0.765 },
  { from: 'papa', to: 'birthday', at: 0.79 },
  { from: 'family', to: 'birthday', at: 0.805 },
]

const FLIGHT = 0.035

export interface NodeFrame {
  node: WebNode
  x: number
  y: number
  /** 0 … 1 */
  a: number
  scale: number
  /** True once it rests on the ring. */
  landed: boolean
}

/** A node's place at p: flying out of the phone along a curve, or resting on its slot. Null before it exists. */
export function nodeAt(node: WebNode, p: number): NodeFrame | null {
  const end = slot(node.slot)
  if (!node.flies) {
    const a = ease(p, node.at - 0.015, node.at)
    return a <= 0 ? null : { node, x: end.x, y: end.y, a, scale: 0.85 + 0.15 * a, landed: a >= 1 }
  }
  const start = node.at - FLIGHT
  if (p < start) return null
  const t = ease(p, start, node.at)
  // A curve that leaves the screen upward before it bends to the ring.
  const cx = (PHONE_CENTER.x + end.x) / 2
  const cy = Math.min(PHONE_CENTER.y, end.y) - 140
  const u = 1 - t
  return {
    node,
    x: u * u * PHONE_CENTER.x + 2 * u * t * cx + t * t * end.x,
    y: u * u * PHONE_CENTER.y + 2 * u * t * cy + t * t * end.y,
    a: Math.min(1, t * 4),
    scale: 0.55 + 0.45 * t,
    landed: t >= 1,
  }
}

/** How much of a thread is drawn (0 … 1). */
export function threadAmount(p: number, at: number): number {
  return ease(p, at - 0.02, at)
}

/** How lit the web's own lines are: faint at first, whole at the end. */
export function webAmount(p: number): number {
  return 0.35 + 0.65 * ease(p, 0.62, 0.86)
}

// ── Pulse, on the phone ─────────────────────────────────────────────────────

export const ITEMS = ['sleep', 'pages', 'face', 'papa'] as const
export type ItemId = (typeof ITEMS)[number]

/** When each item counts as filled. */
const FILLED_AT: Record<ItemId, number> = {
  pages: T.type[1],
  face: T.shutter,
  sleep: 0.635,
  papa: 0.67,
}

export function isFilled(item: ItemId, p: number): boolean {
  return p >= FILLED_AT[item]
}

export function filledCount(p: number): number {
  return ITEMS.filter((item) => isFilled(item, p)).length
}
