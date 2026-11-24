import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useCreatePerson } from '~/lib/mutations/people'
import { rankMentions } from '~/lib/mentions'
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
  /** Enter in a single-line field (Cmd/Ctrl+Enter in a multiline one), once no suggestion is being picked. */
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
  const { t } = useTranslation()
  const createPerson = useCreatePerson()
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
  const live = at && at.start !== dismissed ? at : null
  const typed = live ? live.query.trim() : ''
  const matches = live ? rankMentions(people, live.query).slice(0, 6) : []
  // Someone not in People yet can be made from here: the name as typed, sorted later on the board.
  const canCreate = typed.length >= 2 && !people.some((p) => fold(p.name) === fold(typed))
  const options = matches.length + (canCreate ? 1 : 0)
  const open = options > 0
  const current = Math.min(active, options - 1)
  const isCreate = (i: number) => canCreate && i === matches.length

  const create = async () => {
    if (!at || createPerson.isPending) return
    const name = typed.replace(/\s+/g, ' ')
    try {
      await createPerson.mutateAsync({ name, category: 'to_process' })
      pick({ id: '', name, emoji: null })
      toast.success(t('mentions.created', { name }))
    } catch {
      toast.error(t('mentions.createFailed'))
    }
  }
  const choose = (i: number) => {
    if (isCreate(i)) void create()
    else if (matches[i]) pick(matches[i])
  }

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
        setActive((current + step + options) % options)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        choose(current)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDismissed(at?.start ?? null)
        return
      }
    }
    if (e.key === 'Enter' && onEnter && (!multiline || e.metaKey || e.ctrlKey)) {
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
          {canCreate && (
            <li
              role="option"
              aria-selected={isCreate(current)}
              style={matches.length ? { borderTop: '1px solid var(--hairline)' } : undefined}
            >
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  void create()
                }}
                onMouseEnter={() => setActive(matches.length)}
                disabled={createPerson.isPending}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm"
                style={{ background: isCreate(current) ? 'var(--vellum)' : 'transparent', color: 'var(--ink-2)' }}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-[var(--hairline-2)]">
                  <UserPlus className="h-3 w-3" />
                </span>
                <span className="truncate">{t('mentions.create', { name: typed })}</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
