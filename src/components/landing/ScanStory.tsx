// "On your iPhone": a scroll-driven story in one sticky stage, after Lintel's
// landing. One number p (the scroll through the section, eased a little)
// drives everything; scan-story.ts says where everything is at p, and this
// file only paints it. SVG and CSS 3D, no WebGL.
//
// The phone moves through a week: a note typed into Morning pages, the pose
// camera scanning Face into a point cloud that turns in 3D before the
// shutter, Sleep and Call Papá filling; each capture flies out of the phone
// onto the Ananse Ntontan web around it, where the goal, value, group and date
// it belongs to light up and clay threads join them.
//
// The whole stage is decorative (aria-hidden): the chapter notes are real
// text, and a reduced-motion visitor gets the finished frame and every note,
// stacked (`.scan-story` rules in globals.css).

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CHAPTERS,
  FRAME,
  ITEMS,
  NODES,
  STAGE,
  THREADS,
  T,
  cameraAmount,
  pulseAmount,
  captured,
  chapterWeight,
  clamp01,
  cloudAmount,
  cloudYaw,
  ease,
  filledCount,
  flash,
  isFilled,
  makeCloud,
  nodeAt,
  phonePose,
  photoAmount,
  project,
  scanLine,
  slot,
  threadAmount,
  typed,
  webAmount,
  type ItemId,
  type NodeKind,
} from './scan-story'

const HEIGHT_SVH = 560

export default function ScanStory() {
  const { t } = useTranslation()
  const section = useRef<HTMLElement>(null)
  // The server paints the finished frame; the client takes over from the scroll.
  const [p, setP] = useState(1)
  const [live, setLive] = useState(false)

  useEffect(() => {
    const el = section.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let visible = false
    let shown = -1
    let last = 0
    const target = () => {
      const r = el.getBoundingClientRect()
      const run = r.height - window.innerHeight
      // The last few percent hold the finished web.
      return clamp01(-r.top / Math.max(1, run) / 0.96)
    }
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (!visible) return
      const goal = target()
      const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000))
      last = now
      shown = shown < 0 ? goal : shown + (goal - shown) * (1 - Math.exp(-dt / 0.08))
      if (Math.abs(goal - shown) < 0.0002) shown = goal
      setP((prev) => (Math.abs(prev - shown) > 0.0002 ? shown : prev))
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) visible = e.isIntersecting
    })
    setLive(true)
    io.observe(el)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [])

  return (
    <section
      id="iphone"
      ref={section}
      className="scan-story"
      data-live={live ? '1' : '0'}
      style={{ ['--scan-h' as string]: `${HEIGHT_SVH}svh` }}
    >
      <div className="scan-story-sticky px-6 md:px-16">
        <div className="scan-story-grid mx-auto grid h-full max-w-[1280px] content-center items-center gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12">
          <Notes p={p} />
          <Stage p={p} />
        </div>
      </div>
      <div className="scan-story-list px-6 md:px-16">
        <ol className="mx-auto max-w-[1280px]">
          {CHAPTERS.map((c) => (
            <li key={c.id}>
              <h3>{t(`landing.iphone.chapters.${c.id}.title`)}</h3>
              <p>{t(`landing.iphone.chapters.${c.id}.body`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ── The notes: one chapter at a time, cross-fading ─────────────────────────

function Notes({ p }: { p: number }) {
  const { t } = useTranslation()
  return (
    <div className="scan-story-notes relative order-2 md:order-1">
      <span
        className="inline-flex items-center gap-3.5"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
        }}
      >
        <span className="inline-block h-px w-7" style={{ background: 'var(--ink-3)' }} />
        {t('landing.iphone.eyebrow')}
      </span>
      <div className="mt-6 grid">
        {CHAPTERS.map((c, i) => {
          const a = chapterWeight(p, c.id)
          return (
            <div
              key={c.id}
              className="[grid-area:1/1]"
              style={{
                opacity: a,
                transform: `translateY(${(1 - a) * 14}px)`,
                pointerEvents: a > 0.5 ? 'auto' : 'none',
              }}
              aria-hidden={a < 0.5}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  color: 'var(--clay-deep)',
                }}
              >
                {String(i + 1).padStart(2, '0')} / {String(CHAPTERS.length).padStart(2, '0')}
              </div>
              <h2
                className="mt-3"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(30px, 4vw, 54px)',
                  fontWeight: 400,
                  lineHeight: 1.04,
                  letterSpacing: '-0.02em',
                  textWrap: 'balance',
                }}
              >
                {t(`landing.iphone.chapters.${c.id}.title`)}
              </h2>
              <p
                className="mt-5"
                style={{
                  fontFamily: 'var(--font-text)',
                  fontSize: 'clamp(16px, 1.5vw, 19px)',
                  lineHeight: 1.6,
                  color: 'var(--ink-2)',
                  maxWidth: 480,
                }}
              >
                {t(`landing.iphone.chapters.${c.id}.body`)}
              </p>
            </div>
          )
        })}
      </div>
      <div className="mt-8 flex gap-1.5" aria-hidden>
        {CHAPTERS.map((c) => (
          <span
            key={c.id}
            className="h-0.5 flex-1 rounded-full"
            style={{
              background: 'var(--clay)',
              opacity: 0.2 + 0.8 * clamp01((p - c.range[0]) / (Math.min(1, c.range[1]) - c.range[0])),
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ── The stage: the web, the phone, the captures in flight ──────────────────

function Stage({ p }: { p: number }) {
  const pose = phonePose(p)
  return (
    <div className="scan-story-stage relative order-1 mx-auto w-full md:order-2" aria-hidden>
      <svg viewBox={`0 0 ${STAGE.size} ${STAGE.size}`} className="absolute inset-0 h-full w-full overflow-visible">
        <Web p={p} />
      </svg>
      <div className="scan-story-phone-wrap absolute">
        <div
          className="scan-story-phone"
          style={{
            transform: `rotateX(${pose.rotX}deg) rotateY(${pose.rotY}deg) scale(${pose.scale})`,
          }}
        >
          <Screen p={p} />
        </div>
      </div>
      <svg viewBox={`0 0 ${STAGE.size} ${STAGE.size}`} className="absolute inset-0 h-full w-full overflow-visible">
        <Nodes p={p} />
      </svg>
    </div>
  )
}

/** The Ananse Ntontan web, faint until the threads arrive, and the threads themselves. */
function Web({ p }: { p: number }) {
  const lit = webAmount(p)
  const ring = (r: number) =>
    Array.from({ length: 8 }, (_, i) => slot(i, r))
      .map((pt) => `${pt.x},${pt.y}`)
      .join(' ')
  const byId = new Map(NODES.map((n) => [n.id, slot(n.slot)]))
  return (
    <g>
      <g fill="none" stroke="var(--ink-4)" strokeWidth="1.5" opacity={lit * 0.55}>
        {Array.from({ length: 8 }, (_, i) => {
          const end = slot(i)
          return <line key={i} x1={STAGE.cx} y1={STAGE.cy} x2={end.x} y2={end.y} />
        })}
        <polygon points={ring(STAGE.ring)} />
        <polygon points={ring(STAGE.inner)} />
      </g>
      <g fill="none" stroke="var(--clay)" strokeWidth="3" strokeLinecap="round">
        {THREADS.map((thread) => {
          const a = byId.get(thread.from)!
          const b = byId.get(thread.to)!
          const drawn = threadAmount(p, thread.at)
          if (drawn <= 0) return null
          // A slight sag toward the center, like a strand of web.
          const mx = (a.x + b.x) / 2 + (STAGE.cx - (a.x + b.x) / 2) * 0.18
          const my = (a.y + b.y) / 2 + (STAGE.cy - (a.y + b.y) / 2) * 0.18
          return (
            <path
              key={`${thread.from}-${thread.to}`}
              d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - drawn}
              opacity={0.85}
            />
          )
        })}
      </g>
    </g>
  )
}

const KIND_COLOR: Record<NodeKind, { fg: string; bg: string }> = {
  note: { fg: 'var(--clay-deep)', bg: 'var(--clay-soft)' },
  photo: { fg: 'var(--clay-deep)', bg: 'var(--clay-soft)' },
  goal: { fg: 'var(--moss)', bg: 'var(--moss-soft)' },
  value: { fg: 'var(--plum)', bg: 'var(--plum-soft)' },
  group: { fg: 'var(--indigo)', bg: 'var(--indigo-soft)' },
  date: { fg: 'var(--amber)', bg: 'var(--amber-soft)' },
}

/** Records on the ring: captures flying out of the phone, context records lighting up. */
function Nodes({ p }: { p: number }) {
  const { t } = useTranslation()
  return (
    <g>
      {NODES.map((node) => {
        const frame = nodeAt(node, p)
        if (!frame) return null
        const color = KIND_COLOR[node.kind]
        const label = t(`landing.iphone.nodes.${node.id}`)
        const w = Math.max(170, 74 + label.length * 11.2)
        const h = 64
        return (
          <g
            key={node.id}
            transform={`translate(${frame.x} ${frame.y}) scale(${frame.scale})`}
            opacity={frame.a}
            style={{ filter: frame.landed ? undefined : 'drop-shadow(0 10px 14px rgba(50,38,28,0.18))' }}
          >
            <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={14} fill="var(--canvas)" stroke="var(--hairline-2)" />
            {node.kind === 'photo' ? (
              <g transform={`translate(${-w / 2 + 12} ${-h / 2 + 10})`}>
                <rect width={34} height={44} rx={5} fill="#3a2c22" />
                <ellipse cx={17} cy={17} rx={6} ry={7.5} fill="var(--clay)" />
                <path d="M 3 44 C 4 34, 10 29, 17 28 C 24 29, 30 34, 31 44 Z" fill="var(--clay)" />
              </g>
            ) : (
              <circle cx={-w / 2 + 28} cy={0} r={10} fill={color.bg} stroke={color.fg} strokeWidth={2} />
            )}
            <text
              x={-w / 2 + 58}
              y={-6}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 15, letterSpacing: '0.08em' }}
              fill={color.fg}
            >
              {t(`landing.iphone.kinds.${node.kind}`).toUpperCase()}
            </text>
            <text x={-w / 2 + 58} y={17} style={{ fontFamily: 'var(--font-text)', fontSize: 22 }} fill="var(--ink)">
              {label}
            </text>
          </g>
        )
      })}
    </g>
  )
}

// ── The phone's screen ──────────────────────────────────────────────────────

const SCREEN = { w: 360, h: 780 } as const

function Screen({ p }: { p: number }) {
  const camera = cameraAmount(p)
  const pulse = pulseAmount(p)
  return (
    <svg viewBox={`0 0 ${SCREEN.w} ${SCREEN.h}`} className="block h-full w-full">
      <defs>
        <clipPath id="scan-screen">
          <rect width={SCREEN.w} height={SCREEN.h} rx={48} />
        </clipPath>
      </defs>
      <g clipPath="url(#scan-screen)">
        <rect width={SCREEN.w} height={SCREEN.h} fill="var(--paper)" />
        {pulse > 0 && (
          <g opacity={pulse}>
            <PulseScreen p={p} />
          </g>
        )}
        {camera > 0 && (
          <g opacity={camera}>
            <CameraScreen p={p} />
          </g>
        )}
        <rect x={SCREEN.w / 2 - 52} y={14} width={104} height={30} rx={15} fill="#000" />
      </g>
    </svg>
  )
}

const ITEM_GOAL: Record<ItemId, 'health' | 'craft' | 'family'> = {
  sleep: 'health',
  pages: 'craft',
  face: 'health',
  papa: 'family',
}

function PulseScreen({ p }: { p: number }) {
  const { t } = useTranslation()
  const filled = filledCount(p)
  const note = typed(t('landing.iphone.screen.pagesNote'), p)
  const writing = p >= T.type[0] - 0.01 && p < T.type[1] + 0.02
  return (
    <g>
      <text
        x={24}
        y={96}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em' }}
        fill="var(--ink-3)"
      >
        {t('landing.iphone.screen.eyebrow').toUpperCase()}
      </text>
      <text x={24} y={136} style={{ fontFamily: 'var(--font-display)', fontSize: 31 }} fill="var(--ink)">
        {t('landing.iphone.screen.greeting')}
      </text>
      <text
        x={24}
        y={170}
        style={{ fontFamily: 'var(--font-brand)', fontSize: 30, fontStyle: 'italic' }}
        fill="var(--clay)"
      >
        {t('landing.iphone.screen.thisWeek')}
      </text>
      <rect x={24} y={192} width={SCREEN.w - 48} height={5} rx={2.5} fill="var(--vellum)" />
      <rect x={24} y={192} width={((SCREEN.w - 48) * filled) / ITEMS.length} height={5} rx={2.5} fill="var(--clay)" />
      <text x={24} y={216} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} fill="var(--ink-3)">
        {t('landing.iphone.screen.filled', { filled, total: ITEMS.length })}
      </text>

      {ITEMS.map((item, i) => {
        const done = isFilled(item, p)
        const y = 238 + i * 122
        const body =
          item === 'pages'
            ? writing
              ? note
              : done
                ? t('landing.iphone.screen.pagesNote')
                : ''
            : done
              ? t(`landing.iphone.screen.${item}Note`)
              : ''
        return (
          <g key={item} transform={`translate(20 ${y})`}>
            <rect
              width={SCREEN.w - 40}
              height={108}
              rx={16}
              fill="var(--canvas)"
              stroke={writing && item === 'pages' ? 'var(--clay)' : 'var(--hairline-2)'}
              strokeWidth={writing && item === 'pages' ? 2 : 1}
            />
            <circle
              cx={28}
              cy={32}
              r={10}
              fill={done ? 'var(--moss)' : 'none'}
              stroke={done ? 'var(--moss)' : 'var(--ink-4)'}
              strokeWidth={2}
            />
            {done && (
              <path
                d="M 23 32 L 27 36 L 34 28"
                fill="none"
                stroke="var(--canvas)"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            )}
            <text x={50} y={38} style={{ fontFamily: 'var(--font-display)', fontSize: 21 }} fill="var(--ink)">
              {t(`landing.iphone.screen.items.${item}`)}
            </text>
            <text
              x={SCREEN.w - 60}
              y={37}
              textAnchor="end"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em' }}
              fill="var(--clay-deep)"
            >
              {t(`landing.iphone.nodes.${ITEM_GOAL[item]}`).toUpperCase()}
            </text>
            <text
              x={50}
              y={74}
              style={{ fontFamily: 'var(--font-text)', fontSize: 15, fontStyle: body ? 'normal' : 'italic' }}
              fill={body ? 'var(--ink-2)' : 'var(--ink-4)'}
            >
              {body || t('landing.iphone.screen.placeholder')}
              {item === 'pages' && writing && note.length < t('landing.iphone.screen.pagesNote').length ? '|' : ''}
            </text>
            {item === 'face' && done && (
              <g transform="translate(276 54)">
                <rect width={28} height={36} rx={5} fill="#3a2c22" />
                <ellipse cx={14} cy={14} rx={5} ry={6.5} fill="var(--clay)" />
                <path d="M 2 36 C 3 28, 8 24, 14 23 C 20 24, 25 28, 26 36 Z" fill="var(--clay)" />
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
}

function CameraScreen({ p }: { p: number }) {
  const { t } = useTranslation()
  const cloud = useMemo(() => makeCloud(), [])
  const frame = { x: 18, y: 120, w: SCREEN.w - 36 }
  const s = frame.w / FRAME.w
  const outline = ease(p, T.outline[0], T.outline[1])
  const line = scanLine(p)
  const reach = captured(p)
  const cloudA = cloudAmount(p)
  const yaw = cloudYaw(p)
  const ghost = ease(p, T.ghost[0], T.ghost[1])
  const photo = photoAmount(p)
  const light = flash(p)
  return (
    <g>
      <rect width={SCREEN.w} height={SCREEN.h} fill="#0d0a08" />
      <text
        x={SCREEN.w / 2}
        y={82}
        textAnchor="middle"
        style={{ fontFamily: 'var(--font-display)', fontSize: 21 }}
        fill="#f3ede6"
      >
        {t('landing.iphone.screen.items.face')}
      </text>
      <text
        x={SCREEN.w / 2}
        y={102}
        textAnchor="middle"
        style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em' }}
        fill="rgba(243,237,230,0.6)"
      >
        {(line !== null ? t('landing.iphone.screen.scanning') : t('landing.iphone.screen.lineUp')).toUpperCase()}
      </text>

      <g transform={`translate(${frame.x} ${frame.y}) scale(${s})`}>
        <defs>
          <clipPath id="scan-frame">
            <rect width={FRAME.w} height={FRAME.h} rx={4} />
          </clipPath>
          <radialGradient id="scan-light" cx="50%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#5a4a3e" />
            <stop offset="100%" stopColor="#1d1611" />
          </radialGradient>
        </defs>
        <g clipPath="url(#scan-frame)">
          <rect width={FRAME.w} height={FRAME.h} fill="url(#scan-light)" />

          {/* Last week's picture, faded, a little off the outline. */}
          {ghost > 0 && photo < 1 && (
            <g transform="translate(-2.2 1.4)" opacity={0.36 * ghost * (1 - photo)} fill="var(--clay)">
              <ellipse cx={37.5} cy={42} rx={11} ry={14} />
              <path d="M 5 100 C 7 82, 15 72, 37.5 69 C 60 72, 68 82, 70 100 Z" />
            </g>
          )}

          {/* This week's picture, after the shutter. */}
          {photo > 0 && (
            <g opacity={photo} fill="var(--clay)">
              <ellipse cx={37.5} cy={42} rx={11} ry={14} />
              <path d="M 5 100 C 7 82, 15 72, 37.5 69 C 60 72, 68 82, 70 100 Z" />
            </g>
          )}

          {/* The point cloud: what the sweep has captured, shaded by depth, turning once it is whole. */}
          {cloudA > 0 &&
            cloud.map((point, i) => {
              if (point.y > reach) return null
              const seen = project(point, yaw)
              const fresh = line !== null ? clamp01(1 - (line - point.y) / 7) : 0
              return (
                <circle
                  key={i}
                  cx={seen.x}
                  cy={seen.y}
                  r={0.55 + 0.35 * seen.near + 0.4 * fresh}
                  fill={fresh > 0.2 ? '#fff4e8' : `hsl(${18 + 22 * seen.near} ${70}% ${46 + 26 * seen.near}%)`}
                  opacity={cloudA * (0.45 + 0.55 * seen.near)}
                />
              )
            })}

          {/* The scan line. */}
          {line !== null && (
            <g>
              <rect x={0} y={line - 6} width={FRAME.w} height={6} fill="url(#scan-glow)" opacity={0.6} />
              <line x1={0} x2={FRAME.w} y1={line} y2={line} stroke="#ffd7b8" strokeWidth={0.5} />
            </g>
          )}
          <defs>
            <linearGradient id="scan-glow" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ff9a6a" stopOpacity="0" />
              <stop offset="100%" stopColor="#ff9a6a" stopOpacity="0.55" />
            </linearGradient>
          </defs>

          {/* The outline you drew once, tracing itself. */}
          <g fill="none" stroke="#f3ede6" strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round" opacity={0.95}>
            <ellipse
              cx={37.5}
              cy={42}
              rx={11}
              ry={14}
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - outline}
            />
            <path
              d="M 8 100 C 9 84, 16 74, 30 70 L 33 64 M 67 100 C 66 84, 59 74, 45 70 L 42 64"
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - outline}
            />
          </g>

          <rect width={FRAME.w} height={FRAME.h} fill="#fff" opacity={light * 0.9} />
        </g>
      </g>

      <g transform={`translate(0 ${frame.y + frame.w * (FRAME.h / FRAME.w) + 26})`}>
        {(['outline', 'ghost', 'timer'] as const).map((chip, i) => {
          const on = chip === 'outline' ? outline > 0.5 : chip === 'ghost' ? ghost > 0.5 : false
          const x = SCREEN.w / 2 - 150 + i * 104
          return (
            <g key={chip} transform={`translate(${x} 0)`}>
              <rect width={92} height={30} rx={15} fill={on ? 'var(--clay)' : 'rgba(255,255,255,0.15)'} />
              <text
                x={46}
                y={20}
                textAnchor="middle"
                style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500 }}
                fill={on ? '#fdf9f4' : '#f3ede6'}
              >
                {t(`landing.iphone.screen.chips.${chip}`)}
              </text>
            </g>
          )
        })}
      </g>
      <g transform={`translate(${SCREEN.w / 2} ${SCREEN.h - 72})`}>
        <circle r={32} fill="none" stroke="#f3ede6" strokeWidth={4} />
        <circle r={25} fill={light > 0 ? 'var(--clay)' : '#f3ede6'} />
      </g>
    </g>
  )
}
