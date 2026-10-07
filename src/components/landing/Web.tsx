// The landing's one argument-shaped section: the Ananse Ntontan web drawn
// large, with eight real kinds of anansi record hung on its outer ring and
// clay threads pulled between the ones that link in the app. Every thread is
// a relation the schema actually has (goal_values, tasks.goalId,
// tracking items scoped to a goal, task referents, next bids per person,
// important dates per person, groups spanning people). The names are the
// same invented week the hero's Pulse window shows, so the two pictures
// describe one life.
//
// Pure SVG + CSS, no JS: the threads draw themselves with a scroll-linked
// `animation-timeline: view()` (see `.web-thread` in globals.css). Engines
// without scroll timelines, and reduced-motion visitors, get the finished
// drawing; the default state is drawn, so nothing depends on hydration.
//
// Labels are HTML over the SVG, positioned in percentages, so their type
// stays real-size at every width instead of scaling with the drawing.

import { useTranslation } from 'react-i18next'

// Geometry in a 600 × 600 viewBox. R_OUT/R_IN keep the mark's own ratio
// (40 : 24 in Brand.tsx's 100-unit mark).
const C = 300
const R_OUT = 196
const R_IN = R_OUT * 0.6

type NodeKey = 'goal' | 'value' | 'task' | 'person' | 'bid' | 'date' | 'group' | 'week'

// Clockwise from north, one per octagon vertex.
const NODES: NodeKey[] = ['goal', 'value', 'task', 'person', 'bid', 'date', 'group', 'week']

// Pairs of NODES that are linked in the data model.
const THREADS: [NodeKey, NodeKey][] = [
  ['goal', 'value'],
  ['goal', 'task'],
  ['week', 'goal'],
  ['task', 'person'],
  ['person', 'bid'],
  ['group', 'date'],
  ['group', 'person'],
]

function vertex(i: number, r: number) {
  const a = (-90 + i * 45) * (Math.PI / 180)
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) }
}

const OUTER = NODES.map((_, i) => vertex(i, R_OUT))
const INNER = NODES.map((_, i) => vertex(i, R_IN))

// A thread sags toward the centre, the way silk does when pulled.
function threadPath(a: NodeKey, b: NodeKey) {
  const p = vertex(NODES.indexOf(a), R_OUT)
  const q = vertex(NODES.indexOf(b), R_OUT)
  const mx = (p.x + q.x) / 2
  const my = (p.y + q.y) / 2
  const cx = mx + (C - mx) * 0.55
  const cy = my + (C - my) * 0.55
  return `M${p.x.toFixed(1)} ${p.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`
}

// Where each label sits, in % of the square figure, and which way it hangs
// off its anchor. Labels above the equator hang up, the rest hang down, so
// none of them crosses the drawing.
function labelPlacement(i: number) {
  const v = vertex(i, R_OUT)
  const up = i === 0 || i === 1 || i === 7
  const dy = up ? -14 : 14
  return {
    left: `${(v.x / 600) * 100}%`,
    top: `${((v.y + dy) / 600) * 100}%`,
    transform: up ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
  }
}

const poly = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

export default function Web() {
  const { t } = useTranslation()
  return (
    <figure className="web-figure relative m-0 mx-auto aspect-square w-full max-w-[640px]">
      <svg
        viewBox="0 0 600 600"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={t('landing.web.figureAria')}
      >
        {/* The web itself, in hairline ink. */}
        <g fill="none" stroke="var(--hairline-2)" strokeWidth={1} vectorEffect="non-scaling-stroke">
          {OUTER.map((p, i) => (
            <line key={i} x1={C} y1={C} x2={p.x} y2={p.y} vectorEffect="non-scaling-stroke" />
          ))}
          <polygon points={poly(OUTER)} vectorEffect="non-scaling-stroke" />
          <polygon points={poly(INNER)} vectorEffect="non-scaling-stroke" />
        </g>

        {/* The threads you drew. pathLength=1 lets one dash rule draw any of them. */}
        <g fill="none" stroke="var(--clay)" strokeWidth={1.6} strokeLinecap="round">
          {THREADS.map(([a, b], i) => (
            <path
              key={`${a}-${b}`}
              className="web-thread"
              d={threadPath(a, b)}
              pathLength={1}
              style={{ ['--i' as string]: i }}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>

        {/* Knots where a record hangs. */}
        {OUTER.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={4} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.2} />
        ))}
        <circle cx={C} cy={C} r={7} fill="var(--clay)" />
      </svg>

      <span
        aria-hidden
        className="absolute -translate-x-1/2"
        style={{
          left: '50%',
          top: `${((C + 16) / 600) * 100}%`,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          background: 'var(--paper)',
          padding: '0 4px',
        }}
      >
        {t('landing.web.center')}
      </span>

      {NODES.map((key, i) => (
        <span
          key={key}
          aria-hidden
          className="absolute flex flex-col items-center text-center whitespace-nowrap"
          style={labelPlacement(i)}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
            }}
          >
            {t(`landing.web.nodes.${key}.kind`)}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(15px, 1.7vw, 22px)',
              lineHeight: 1.15,
              color: 'var(--ink)',
              letterSpacing: '-0.01em',
            }}
          >
            {t(`landing.web.nodes.${key}.name`)}
          </span>
        </span>
      ))}
    </figure>
  )
}
