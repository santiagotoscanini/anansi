import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import Avatar from './Avatar'

export interface MentionCandidate {
  id: string
  name: string
  emoji: string | null
}

interface Props {
  value: string
  onChange: (value: string) => void
  people: readonly MentionCandidate[]
  multiline?: boolean
  rows?: number
  /** Classes for the element that wraps the field (it is the positioning box of the suggestions). */
  wrapperClassName?: string
  placeholder?: string
  autoFocus?: boolean
  maxLength?: number
  /** Enter in a single-line field, once no suggestion is being picked. */
  onEnter?: () => void
  onEscape?: () => void
  onBlur?: () => void
  className?: string
  style?: CSSProperties
  'aria-label'?: string
}

const fold = (s: string) => s.toLocaleLowerCase()

/** The `@partial` being typed just before the caret, and where its `@` sits. */
function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|[^\p{L}\p{N}_])@([\p{L}\p{N}_][\p{L}\p{N}_ ]{0,39}|)$/u.exec(text.slice(0, caret))
  if (!m) return null
  return { start: caret - m[2]!.length - 1, query: m[2]! }
}

/**
 * A text field where `@` offers the people to mention.
 *
 * It edits plain text: a mention is `@Name`, typed or picked, and the server
 * links it to the person on save (see ~/lib/mentions). The suggestions sit under
 * the field rather than at the caret, which a textarea cannot report.
 */
export default function MentionField({
  value,
  onChange,
  people,
  multiline = false,
  rows,
  wrapperClassName = '',
  placeholder,
  autoFocus,
  maxLength,
  onEnter,
  onEscape,
  onBlur,
  className,
  style,
  'aria-label': ariaLabel,
}: Props) {
  const fieldRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null)
  const [caret, setCaret] = useState(value.length)
  const [active, setActive] = useState(0)
  // The `@` position the user dismissed with Escape, so it stays closed until
  // they start another mention.
  const [dismissed, setDismissed] = useState<number | null>(null)
  const [focused, setFocused] = useState(false)
  // Where the caret belongs after a pick. A controlled field drops the caret
  // at the end when its value is replaced, so it is put back before the
  // browser paints (and before the next keystroke lands in the wrong place).
  const caretAfterPick = useRef<number | null>(null)
  useLayoutEffect(() => {
    const pos = caretAfterPick.current
    if (pos === null) return
    caretAfterPick.current = null
    fieldRef.current?.focus()
    fieldRef.current?.setSelectionRange(pos, pos)
  }, [value])

  const at = focused ? mentionAt(value, caret) : null
  const query = at ? fold(at.query) : ''
  const matches =
    at && at.start !== dismissed
      ? people
          .filter((p) => {
            const name = fold(p.name)
            return name !== query && (name.startsWith(query) || name.split(/\s+/).some((w) => w.startsWith(query)))
          })
          .slice(0, 6)
      : []
  const open = matches.length > 0
  const current = Math.min(active, matches.length - 1)

  const pick = (person: MentionCandidate) => {
    if (!at) return
    const inserted = `@${person.name} `
    const next = value.slice(0, at.start) + inserted + value.slice(caret)
    const pos = at.start + inserted.length
    caretAfterPick.current = pos
    onChange(next)
    setCaret(pos)
    setActive(0)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        setActive((current + step + matches.length) % matches.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pick(matches[current]!)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDismissed(at?.start ?? null)
        return
      }
    }
    if (e.key === 'Enter' && !multiline && onEnter) {
      e.preventDefault()
      onEnter()
    }
    if (e.key === 'Escape' && onEscape) onEscape()
  }

  const shared = {
    ref: fieldRef,
    value,
    placeholder,
    autoFocus,
    maxLength,
    className,
    style,
    'aria-label': ariaLabel,
    onKeyDown,
    onChange: (e: { target: { value: string; selectionStart: number | null } }) => {
      onChange(e.target.value)
      setCaret(e.target.selectionStart ?? e.target.value.length)
      setActive(0)
    },
    onSelect: (e: { currentTarget: { selectionStart: number | null } }) =>
      setCaret(e.currentTarget.selectionStart ?? value.length),
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false)
      onBlur?.()
    },
  }

  return (
    <div className={`relative ${wrapperClassName}`}>
      {multiline ? <textarea rows={rows} {...shared} /> : <input type="text" {...shared} />}
      {open && (
        <ul
          role="listbox"
          className="absolute top-full left-0 z-20 mt-1 w-64 overflow-hidden rounded-xl py-1"
          style={{
            background: 'var(--canvas)',
            border: '1px solid var(--hairline-2)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {matches.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === current}>
              <button
                type="button"
                // mousedown, not click: a click would blur the field first and
                // close the list before it landed.
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(p)
                }}
                onMouseEnter={() => setActive(i)}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm"
                style={{
                  background: i === current ? 'var(--vellum)' : 'transparent',
                  color: 'var(--ink)',
                }}
              >
                <Avatar name={p.name} emoji={p.emoji} size="xs" shape="circle" />
                <span className="truncate">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
