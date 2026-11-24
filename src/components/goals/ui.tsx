// Shared UI primitives for the warm Anansi design language — Buttons,
// Cards, Tags, page headers, section labels. Direct ports of the
// design-system Screens.html primitives, sized for production use.

import { createContext, use, type ComponentType, type CSSProperties, type ReactNode } from 'react'

// Semantic color keys. Anything outside this set falls back to "vellum"
// (neutral) — keeps tag/avatar callers from drifting into random hexes.
export type AnansiColor = 'clay' | 'moss' | 'indigo' | 'amber' | 'rust' | 'plum' | 'vellum'

export function SecLabel({
  children,
  style,
  className,
}: {
  children: ReactNode
  style?: CSSProperties
  className?: string
}) {
  return (
    <div
      className={className}
      style={{
        fontFamily: 'var(--font-ui)',
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.08em',
        color: 'var(--ink-3)',
        textTransform: 'uppercase',
        marginBottom: 10,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// Page chrome, the same on every tab: a compact title (a display face, with an
// optional .brand-em accent inside), one quiet line under it, and the page's
// actions on the right. The tab's view switch (Tasks, People) reaches the
// header through HeaderAccessory, so it sits with the actions instead of
// floating over the page.
const HeaderAccessoryContext = createContext<ReactNode>(null)

export function HeaderAccessory({ children, value }: { children: ReactNode; value: ReactNode }) {
  return <HeaderAccessoryContext value={value}>{children}</HeaderAccessoryContext>
}

export function ScreenHeader({
  title,
  sub,
  actions,
  below,
  style,
}: {
  /** Kept for old callers; not shown (the sidebar already says where you are). */
  eyebrow?: ReactNode
  title: ReactNode
  sub?: ReactNode
  actions?: ReactNode
  /** A row under the title: a search field, filters, a week switcher. */
  below?: ReactNode
  style?: CSSProperties
}) {
  const accessory = use(HeaderAccessoryContext)
  return (
    <header className="pt-7 pb-5 md:pt-9" style={style}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 30,
              lineHeight: 1.15,
              letterSpacing: '-0.015em',
              color: 'var(--ink)',
            }}
          >
            {title}
          </h1>
          {sub && (
            <p
              className="mt-1.5 max-w-2xl"
              style={{
                fontFamily: 'var(--font-text)',
                fontStyle: 'italic',
                fontSize: 15,
                color: 'var(--ink-3)',
                lineHeight: 1.4,
              }}
            >
              {sub}
            </p>
          )}
        </div>
        {(actions ?? accessory) && (
          <div className="flex flex-wrap items-center gap-2">
            {accessory}
            {actions}
          </div>
        )}
      </div>
      {below && <div className="mt-5">{below}</div>}
    </header>
  )
}

/**
 * A tab's page: its own scroll, one width and one gutter for every tab.
 */
export function Page({
  children,
  width = 'text',
  className,
}: {
  children: ReactNode
  /** `text` for reading pages, `page` for two columns, `full` for boards. */
  width?: 'text' | 'page' | 'full'
  className?: string
}) {
  const max = width === 'full' ? 'max-w-[1400px]' : width === 'page' ? 'max-w-6xl' : 'max-w-4xl'
  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--paper)' }}>
      <div className={`mx-auto w-full px-5 pb-20 md:px-10 ${max} ${className ?? ''}`}>{children}</div>
    </div>
  )
}

/** A section of a page: a small label, an optional count and action, then its content. */
export function Section({
  label,
  count,
  action,
  children,
  className,
}: {
  label: ReactNode
  count?: number
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`mt-8 ${className ?? ''}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <SecLabel>
          {label}
          {count !== undefined && <span style={{ marginLeft: 8, color: 'var(--ink-4)' }}>{count}</span>}
        </SecLabel>
        {action}
      </div>
      {children}
    </section>
  )
}

type BtnKind = 'primary' | 'secondary' | 'ghost' | 'ink'
type BtnSize = 'sm' | 'md' | 'lg'

type IconType = ComponentType<{ size?: number; className?: string; style?: CSSProperties }>

export function Btn({
  kind = 'secondary',
  size = 'md',
  icon: Icon,
  iconRight,
  children,
  onClick,
  disabled,
  type,
  style,
  title,
  className,
}: {
  kind?: BtnKind
  size?: BtnSize
  icon?: IconType
  iconRight?: boolean
  children?: ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  style?: CSSProperties
  title?: string
  className?: string
}) {
  const h = size === 'sm' ? 30 : size === 'lg' ? 44 : 36
  const pad = size === 'sm' ? '0 12px' : size === 'lg' ? '0 22px' : '0 16px'
  const fs = size === 'sm' ? 12 : size === 'lg' ? 14 : 13
  const iconSize = size === 'sm' ? 12 : 14
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: h,
    padding: pad,
    borderRadius: 10,
    fontSize: fs,
    fontWeight: 500,
    letterSpacing: '-0.005em',
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: '1px solid transparent',
    transition:
      'background var(--dur-1) var(--ease), color var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease)',
    opacity: disabled ? 0.5 : 1,
    whiteSpace: 'nowrap',
  }
  const palette: Record<BtnKind, CSSProperties> = {
    primary: { background: 'var(--clay)', color: 'var(--paper)', boxShadow: 'var(--shadow-sm)' },
    secondary: {
      background: 'var(--canvas)',
      color: 'var(--ink)',
      borderColor: 'var(--hairline-2)',
      boxShadow: 'var(--shadow-sm)',
    },
    ghost: { background: 'transparent', color: 'var(--ink-2)' },
    ink: { background: 'var(--ink)', color: 'var(--paper)' },
  }
  return (
    <button
      type={type ?? 'button'}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={className}
      style={{ ...base, ...palette[kind], ...style }}
    >
      {Icon && !iconRight && <Icon size={iconSize} />}
      {children}
      {Icon && iconRight && <Icon size={iconSize} />}
    </button>
  )
}

export function Tag({
  color = 'vellum',
  children,
  dot = true,
  style,
}: {
  color?: AnansiColor
  children: ReactNode
  dot?: boolean
  style?: CSSProperties
}) {
  const isVellum = color === 'vellum'
  return (
    <span
      className={`tag tag-${color}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 22,
        padding: '0 10px',
        borderRadius: 999,
        background: isVellum ? 'var(--vellum)' : `var(--${color}-soft)`,
        color: isVellum ? 'var(--ink-2)' : `var(--${color})`,
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1,
        ...style,
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 99,
            background: 'currentColor',
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  )
}

export function Card({
  children,
  style,
  kind = 'default',
  pad = 16,
  className,
}: {
  children: ReactNode
  style?: CSSProperties
  kind?: 'default' | 'paper' | 'bordered'
  pad?: number
  className?: string
}) {
  const bg = kind === 'paper' ? 'var(--paper-deep)' : 'var(--canvas)'
  const border = kind === 'bordered' ? '1px solid var(--hairline-2)' : '1px solid var(--hairline)'
  return (
    <div
      className={className}
      style={{
        background: bg,
        border,
        borderRadius: 14,
        padding: pad,
        boxShadow: kind === 'bordered' ? 'none' : 'var(--shadow-sm)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// Round avatar with semantic color background — used in person rows,
// goal-node referent clusters, and the sidebar account pill.
export function Av({
  initials,
  color = 'clay',
  size = 28,
  style,
}: {
  initials: string
  color?: AnansiColor
  size?: number
  style?: CSSProperties
}) {
  const bg = color === 'vellum' ? 'var(--vellum)' : `var(--${color}-soft)`
  const fg = color === 'vellum' ? 'var(--ink-2)' : `var(--${color})`
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color: fg,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(9, Math.floor(size * 0.36)),
        fontWeight: 500,
        fontFamily: 'var(--font-ui)',
        letterSpacing: '-0.01em',
        flexShrink: 0,
        ...style,
      }}
    >
      {initials}
    </span>
  )
}

// Hash a name to one of the semantic color slots so the same person
// always renders with the same avatar color, but the spread is even
// across the palette.
const COLOR_WHEEL: AnansiColor[] = ['clay', 'moss', 'indigo', 'amber', 'plum', 'rust']
export function colorForName(name: string): AnansiColor {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return COLOR_WHEEL[h % COLOR_WHEEL.length] ?? 'clay'
}

// Two-letter initials for the avatar — first letter of the first two
// space-separated words, uppercased.
export function initialsFor(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0)
  if (parts.length === 0) return '·'
  if (parts.length === 1) return (parts[0]?.slice(0, 2) ?? '·').toUpperCase()
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}
