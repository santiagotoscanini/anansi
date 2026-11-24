import type { LucideIcon } from 'lucide-react'

// Two (or more) ways to look at the same thing, as a small segmented control:
// Tasks as a list or as a board in time, People as a directory or as a board by
// relationship. Sits in the top right corner of the tab.
export function ViewSwitch<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: readonly { id: T; label: string; icon: LucideIcon }[]
  onChange: (next: T) => void
  label: string
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex rounded-lg border border-[var(--hairline-2)] bg-[var(--canvas)] p-0.5 shadow-sm"
    >
      {options.map(({ id, label: text, icon: Icon }) => {
        const active = id === value
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
              active ? 'bg-[var(--vellum)] text-[var(--ink)]' : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {text}
          </button>
        )
      })}
    </div>
  )
}
