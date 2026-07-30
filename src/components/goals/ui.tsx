// Shared UI primitives for the warm Anansi design language — Buttons,
// Cards, Tags, page headers, section labels. Direct ports of the
// design-system Screens.html primitives, sized for production use.

import type { ComponentType, CSSProperties, ReactNode } from 'react'

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

// Standard page chrome: eyebrow + display title (with optional inline
// .brand-em accent inside) + italic Newsreader subtitle + action row.
export function ScreenHeader({
  eyebrow,
  title,
  sub,
  actions,
  style,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  sub?: ReactNode
  actions?: ReactNode
  style?: CSSProperties
}) {
  return (
    <header
      style={{
        padding: '36px 48px 28px',
        borderBottom: '1px solid var(--hairline)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 44,
              lineHeight: 1.3,
              letterSpacing: '-0.02em',
              paddingBottom: 4,
              color: 'var(--ink)',
            }}
          >
            {title}
          </h1>
          {sub && (
            <p
              style={{
                fontFamily: 'var(--font-text)',
                fontStyle: 'italic',
                fontSize: 18,
                color: 'var(--ink-2)',
                marginTop: 16,
                lineHeight: 1.4,
                maxWidth: 620,
              }}
            >
              {sub}
            </p>
          )}
        </div>
        {actions && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingTop: 8, flexWrap: 'wrap' }}>
            {actions}
          </div>
        )}
      </div>
    </header>
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
