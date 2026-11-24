import { useState } from 'react'

// Pieces of the Self page shared by its sections (Self.tsx, OpenQuestions.tsx,
// PersonalityResults.tsx), so every section reads the same.

// Click-to-edit prose block. Shows the value as flowing text; click to enter
// a textarea for editing; commits on blur. Empty state is a faded affordance
// rather than a labeled empty form, so untouched sections feel like blank
// pages instead of unfinished forms.
export function EditableProse({
  value,
  onSave,
  placeholder,
  rows = 5,
  variant = 'default',
}: {
  value: string
  onSave: (next: string | null) => void
  placeholder: string
  rows?: number
  variant?: 'default' | 'hero' | 'story'
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const startEdit = () => {
    // Seed draft from the current value at the moment editing begins; avoids
    // a useEffect-driven sync that would clobber in-flight typing.
    setDraft(value)
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    const next = draft.trim() ? draft : null
    if (next !== (value || null)) onSave(next)
  }

  const textBase = 'whitespace-pre-wrap break-words leading-relaxed'
  const textSize =
    variant === 'hero'
      ? 'text-xl text-[var(--ink)]'
      : variant === 'story'
        ? 'text-base text-[var(--ink)]'
        : 'text-sm text-[var(--ink)]'
  const editingSize = variant === 'hero' ? 'text-xl' : variant === 'story' ? 'text-base' : 'text-sm'

  if (editing) {
    return (
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            commit()
          }
        }}
        autoFocus
        rows={rows}
        placeholder={placeholder}
        className={`w-full resize-none rounded-xl border border-[var(--hairline)] bg-[var(--vellum)] px-4 py-3 ${editingSize} text-[var(--ink)] outline-hidden transition-colors placeholder:text-[var(--ink-4)] focus:border-[var(--hairline-2)] focus:bg-[var(--vellum)]`}
      />
    )
  }

  if (!value) {
    return (
      <button
        onClick={startEdit}
        className={`block w-full rounded-xl border border-dashed border-[var(--hairline)] px-4 py-3 text-left ${editingSize} text-[var(--ink-4)] italic transition-colors hover:border-[var(--hairline-2)] hover:text-[var(--ink-3)]`}
      >
        {placeholder}
      </button>
    )
  }

  return (
    <div
      onClick={startEdit}
      className={`group cursor-text rounded-xl px-4 py-3 transition-colors hover:bg-[var(--vellum)] ${textBase} ${textSize}`}
    >
      {value}
    </div>
  )
}

// Section heading. Tiny uppercase eyebrow + larger title + optional helper.
// Visual rhythm: every section follows this template so the page feels
// composed, not chaotic.
export function SectionHeader({ eyebrow, title, helper }: { eyebrow: string; title: string; helper?: string }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] font-medium tracking-[0.18em] text-[var(--ink-4)] uppercase">{eyebrow}</div>
      <h3 className="mt-1.5 text-2xl font-light text-[var(--ink)]">{title}</h3>
      {helper && <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[var(--ink-3)]">{helper}</p>}
    </div>
  )
}
