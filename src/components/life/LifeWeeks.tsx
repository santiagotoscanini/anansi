import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, ageOn, chapterRange, sundayOf, weekChapters, type LifeRow } from '~/lib/life'
import type { LifeChapter, LifeData } from '~/lib/queries/life'

// The grid: one row per year of age, one cell per Sunday-to-Saturday week.
// Drawn as one SVG whose cells are plain rects, with every pointer event
// handled once on the SVG (the cell is found from the coordinates), because
// 4,000-odd cells each with its own handlers is what makes a grid like this
// sluggish. Highlights are overlays drawn on top, so hovering a chapter
// redraws its cells, not the whole life.

const CELL = 10
const STEP = 13
const LEFT = 30
const TOP = 4
const DECADE_GAP = 9
const COLS = 53

const rowY = (r: number) => TOP + r * STEP + Math.floor(r / 10) * DECADE_GAP

export interface WeekHit {
  sunday: string
  row: number
  col: number
}

interface Props {
  life: LifeData
  rows: LifeRow[]
  today: string
  /** The chapters this view shows. */
  chapters: LifeChapter[]
  /** A chapter to light up (hovered in the list). */
  focusId: string | null
  onOpenWeek: (sunday: string) => void
  /** A drag across weeks: start a chapter over them. */
  onSelectRange: (start: string, end: string) => void
}

export default function LifeWeeks({ life, rows, today, chapters, focusId, onOpenWeek, onSelectRange }: Props) {
  const { t, i18n } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<WeekHit | null>(null)
  const [drag, setDrag] = useState<{ from: WeekHit; to: WeekHit } | null>(null)

  const birth = life.birthDate!
  const years = life.lifeExpectancyYears
  const thisWeek = sundayOf(today)

  const width = LEFT + COLS * STEP + 24
  const height = rowY(rows.length - 1) + STEP + TOP

  const byId = useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters])
  const covering = useMemo(() => weekChapters(chapters, birth, years), [chapters, birth, years])

  // Where each Sunday sits, for overlays and hit-testing.
  const position = useMemo(() => {
    const map = new Map<string, { row: number; col: number }>()
    rows.forEach((r, row) => r.weeks.forEach((s, col) => map.set(s, { row, col })))
    return map
  }, [rows])

  const cells = useMemo(() => {
    const out: React.ReactElement[] = []
    rows.forEach((r, row) => {
      const y = rowY(row)
      r.weeks.forEach((sunday, col) => {
        const x = LEFT + col * STEP
        const ids = covering.get(sunday)
        const color = ids ? byId.get(ids[0]!)?.color : undefined
        const past = sunday < thisWeek
        const now = sunday === thisWeek
        const rec = past || now ? life.weeks[sunday] : undefined
        const amount = rec ? rec.sync + rec.journal : 0
        if (now) {
          out.push(<rect key={sunday} x={x} y={y} width={CELL} height={CELL} rx={2.5} className="lw-now" />)
        } else if (color) {
          out.push(
            <rect
              key={sunday}
              x={x}
              y={y}
              width={CELL}
              height={CELL}
              rx={2.5}
              fill={color}
              fillOpacity={past ? 0.92 : 0.16}
              stroke={past ? undefined : color}
              strokeOpacity={past ? undefined : 0.5}
              strokeWidth={past ? undefined : 0.8}
            />,
          )
        } else {
          out.push(
            <rect
              key={sunday}
              x={x}
              y={y}
              width={CELL}
              height={CELL}
              rx={2.5}
              className={past ? 'lw-past' : 'lw-future'}
            />,
          )
        }
        if (amount > 0) {
          out.push(
            <circle
              key={`${sunday}-r`}
              cx={x + CELL / 2}
              cy={y + CELL / 2}
              r={Math.min(1.3 + amount * 0.28, 3.1)}
              className={color || now ? 'lw-dot-on' : 'lw-dot'}
            />,
          )
        }
      })
    })
    return out
  }, [rows, covering, byId, thisWeek, life.weeks])

  // Age along the left every five years, the year beside each decade.
  const labels = useMemo(
    () =>
      rows
        .filter((r) => r.age % 5 === 0)
        .map((r) => (
          <text
            key={r.age}
            x={LEFT - 8}
            y={rowY(r.age) + CELL - 1.5}
            textAnchor="end"
            className={r.age % 10 === 0 ? 'lw-label lw-label-strong' : 'lw-label'}
          >
            {r.age}
          </text>
        )),
    [rows],
  )

  // A quiet marker beside the row being lived.
  const nowRow = position.get(thisWeek)?.row
  const nowMarker =
    nowRow !== undefined ? (
      <text x={LEFT + COLS * STEP + 4} y={rowY(nowRow) + CELL - 1.5} className="lw-label lw-label-now">
        {t('life.grid.now')}
      </text>
    ) : null

  const focus = focusId ? byId.get(focusId) : undefined
  const focusCells = useMemo(() => {
    if (!focus) return null
    const range = chapterRange(focus, birth, years)
    const out: React.ReactElement[] = []
    for (let s = sundayOf(range.start); s <= range.end; s = addDays(s, 7)) {
      const p = position.get(s)
      if (!p) continue
      const past = s < thisWeek
      out.push(
        <rect
          key={s}
          x={LEFT + p.col * STEP}
          y={rowY(p.row)}
          width={CELL}
          height={CELL}
          rx={2.5}
          fill={focus.color}
          fillOpacity={past ? 1 : 0.45}
          stroke={focus.color}
          strokeWidth={0.8}
        />,
      )
    }
    return out
  }, [focus, birth, years, position, thisWeek])

  const dragRange = drag ? ([drag.from.sunday, drag.to.sunday].sort() as [string, string]) : null
  const dragCells = useMemo(() => {
    if (!dragRange) return null
    const out: React.ReactElement[] = []
    for (let s = dragRange[0]; s <= dragRange[1]; s = addDays(s, 7)) {
      const p = position.get(s)
      if (!p) continue
      out.push(
        <rect
          key={s}
          x={LEFT + p.col * STEP - 1}
          y={rowY(p.row) - 1}
          width={CELL + 2}
          height={CELL + 2}
          rx={3}
          className="lw-select"
        />,
      )
    }
    return out
    // dragRange is derived from drag each render; key on its ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragRange?.[0], dragRange?.[1], position])

  function hitAt(e: ReactPointerEvent<SVGSVGElement>): WeekHit | null {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    const col = Math.floor((pt.x - LEFT + (STEP - CELL) / 2) / STEP)
    if (col < 0 || col >= COLS) return null
    for (let row = 0; row < rows.length; row++) {
      const y = rowY(row)
      if (pt.y >= y - (STEP - CELL) / 2 && pt.y < y + CELL + (STEP - CELL) / 2) {
        const sunday = rows[row]!.weeks[col]
        return sunday ? { sunday, row, col } : null
      }
    }
    return null
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const hit = hitAt(e)
    setHover((h) => (h?.sunday === hit?.sunday ? h : hit))
    if (drag && hit && hit.sunday !== drag.to.sunday) setDrag({ from: drag.from, to: hit })
  }
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    const hit = hitAt(e)
    if (!hit) return
    // Touch drags scroll the page; only a mouse or a pen draws a range.
    if (e.pointerType === 'touch') return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ from: hit, to: hit })
  }
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const hit = hitAt(e)
    if (drag) {
      const [a, b] = [drag.from.sunday, (hit ?? drag.to).sunday].sort() as [string, string]
      setDrag(null)
      if (a === b) onOpenWeek(a)
      else onSelectRange(a, addDays(b, 6))
      return
    }
    if (hit && e.pointerType === 'touch') onOpenWeek(hit.sunday)
  }

  // The tooltip: what the hovered week is, and what it held.
  const tip = (() => {
    if (!hover || drag) return null
    const ids = covering.get(hover.sunday) ?? []
    const rec = hover.sunday <= thisWeek ? life.weeks[hover.sunday] : undefined
    const date = new Date(`${hover.sunday}T12:00:00Z`).toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
    const age = Math.max(0, ageOn(birth, addDays(hover.sunday, 6)))
    const left = ((LEFT + hover.col * STEP + CELL / 2) / width) * 100
    const top = ((rowY(hover.row) + CELL) / height) * 100
    const flip = left > 62
    return (
      <div
        className="pointer-events-none absolute z-10 w-max max-w-[260px] rounded-xl px-3 py-2.5 text-xs shadow-[var(--shadow-pop)]"
        style={{
          left: `${left}%`,
          top: `calc(${top}% + 8px)`,
          transform: flip ? 'translateX(calc(-100% + 8px))' : 'translateX(-8px)',
          background: 'var(--canvas)',
          border: '1px solid var(--hairline-2)',
          color: 'var(--ink)',
        }}
      >
        <div className="font-medium">
          {hover.sunday === thisWeek ? t('life.grid.thisWeek') : t('life.grid.weekOf', { date })}
        </div>
        <div className="mt-0.5 text-[var(--ink-3)]">{t('life.grid.age', { count: age })}</div>
        {ids.length > 0 && (
          <ul className="mt-2 space-y-1">
            {ids.map((id) => {
              const c = byId.get(id)
              if (!c) return null
              return (
                <li key={id} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                  <span className="truncate">
                    {c.emoji ? `${c.emoji} ` : ''}
                    {c.title}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {rec && (rec.sync > 0 || rec.journal > 0 || rec.pictures > 0) && (
          <div className="mt-2 border-t border-[var(--hairline)] pt-2 text-[var(--ink-2)]">
            {[
              rec.journal > 0 && t('life.grid.journalDays', { count: rec.journal }),
              rec.sync > 0 && t('life.grid.syncNotes', { count: rec.sync }),
              rec.pictures > 0 && t('life.grid.pictures', { count: rec.pictures }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        )}
      </div>
    )
  })()

  const hoverRect = hover && !drag && (
    <rect
      x={LEFT + hover.col * STEP - 1.5}
      y={rowY(hover.row) - 1.5}
      width={CELL + 3}
      height={CELL + 3}
      rx={3.5}
      className="lw-hover"
    />
  )

  return (
    <div ref={wrapRef} className="relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full cursor-pointer"
        style={{ touchAction: 'pan-y' }}
        role="img"
        aria-label={t('life.grid.aria')}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={() => !drag && setHover(null)}
      >
        {labels}
        {nowMarker}
        <g>{cells}</g>
        {focusCells && (
          <>
            <rect x={LEFT - 2} y={0} width={width - LEFT} height={height} className="lw-veil" />
            <g>{focusCells}</g>
          </>
        )}
        {dragCells && <g>{dragCells}</g>}
        {hoverRect}
      </svg>
      {tip}
    </div>
  )
}
