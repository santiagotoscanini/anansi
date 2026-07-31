import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface DatePickerProps {
  value: Date | null
  onChange: (date: Date | null) => void
  placeholder?: string
  className?: string
  align?: 'left' | 'right'
  clearable?: boolean
  disabled?: boolean
  size?: 'sm' | 'md'
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function DatePicker({
  value,
  onChange,
  placeholder,
  className,
  align = 'left',
  clearable = true,
  disabled,
  size = 'md',
}: DatePickerProps) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<Date>(() => (value ? startOfMonth(value) : startOfMonth(new Date())))
  const [mode, setMode] = useState<'day' | 'year'>('day')
  const [lastSyncedTs, setLastSyncedTs] = useState<number | null>(value?.getTime() ?? null)
  const [position, setPosition] = useState<{ top: number; left?: number; right?: number } | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Sync view to the selected value when it changes externally — derive during
  // render rather than via an effect (avoids the cascading-render warning).
  const valueTs = value?.getTime() ?? null
  if (valueTs !== lastSyncedTs) {
    setLastSyncedTs(valueTs)
    if (value) setView(startOfMonth(value))
  }

  // Localized month + weekday labels via Intl, keyed off the active i18next
  // language so they flip when the user switches locale.
  const locale = i18n.language
  const monthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'long' })
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2000, i, 1)))
  }, [locale])
  const weekdayShortNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    // 2024-01-01 is a Monday; produce 7 short labels Mon..Sun.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)))
  }, [locale])

  // Compute portaled-popover viewport position from the trigger's bounding rect.
  // Re-runs on resize and (capture-phase) scroll so nested scrollables move it.
  useEffect(() => {
    if (!open) return
    const update = () => {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + 8,
        left: align === 'left' ? rect.left : undefined,
        right: align === 'right' ? window.innerWidth - rect.right : undefined,
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      const inTrigger = wrapperRef.current?.contains(t) ?? false
      const inPopover = popoverRef.current?.contains(t) ?? false
      if (!inTrigger && !inPopover) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // 6 weeks × 7 days, Monday-first.
  const days = useMemo(() => {
    const first = startOfMonth(view)
    const leadingBlanks = (first.getDay() + 6) % 7 // JS getDay: 0=Sun → shift to Monday-first.
    const start = new Date(first)
    start.setDate(start.getDate() - leadingBlanks)
    const cells: { date: Date; inMonth: boolean }[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      cells.push({ date: d, inMonth: d.getMonth() === view.getMonth() })
    }
    return cells
  }, [view])

  const today = new Date()
  const formatted = value ? value.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' }) : ''
  const placeholderText = placeholder ?? t('datePicker.pickDate')
  const isSm = size === 'sm'

  // Two visual variants:
  //   md — full-input look. Used in form fields ("Decide by", new-row inputs).
  //   sm — compact pill. Used inline in list rows (bids, important dates).
  const triggerClass = isSm
    ? `inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-all hover:bg-[var(--vellum)] disabled:cursor-not-allowed disabled:opacity-50 ${
        value ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'
      }`
    : `flex w-full items-center gap-2 rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-2 text-left text-sm transition-all hover:bg-[var(--vellum)] focus:border-[var(--hairline-2)] disabled:cursor-not-allowed disabled:opacity-50 ${
        value ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'
      }`

  return (
    <div ref={wrapperRef} className={`relative inline-flex ${className ?? ''}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          setMode('day')
          setOpen((o) => !o)
        }}
        className={triggerClass}
      >
        <CalendarIcon className={`shrink-0 text-[var(--ink-3)] ${isSm ? 'h-3 w-3' : 'h-4 w-4'}`} />
        <span className={isSm ? '' : 'flex-1 truncate'}>{formatted || placeholderText}</span>
        {!isSm && clearable && value && !disabled && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              onChange(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onChange(null)
              }
            }}
            className="rounded p-0.5 text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
            aria-label={t('datePicker.clearDate')}
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: 'fixed', top: position.top, left: position.left, right: position.right }}
            className="z-50 w-[18rem] rounded-lg border border-[var(--hairline)] bg-[var(--ink-3)] p-3 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between gap-1">
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() =>
                    mode === 'day'
                      ? setView((v) => new Date(v.getFullYear() - 1, v.getMonth(), 1))
                      : setView((v) => new Date(v.getFullYear() - 12, v.getMonth(), 1))
                  }
                  className="rounded p-1 text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
                  aria-label={mode === 'day' ? t('datePicker.previousYear') : t('datePicker.previous12Years')}
                  title={mode === 'day' ? t('datePicker.previousYear') : t('datePicker.previous12Years')}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                {mode === 'day' && (
                  <button
                    type="button"
                    onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
                    className="rounded p-1 text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
                    aria-label={t('datePicker.previousMonth')}
                    title={t('datePicker.previousMonth')}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMode((m) => (m === 'day' ? 'year' : 'day'))}
                className="rounded px-2 py-1 text-sm font-medium text-[var(--ink)] transition-all hover:bg-[var(--vellum)]"
                title={mode === 'day' ? t('datePicker.pickAYear') : t('datePicker.backToDays')}
              >
                {mode === 'day'
                  ? `${monthNames[view.getMonth()]} ${view.getFullYear()}`
                  : `${view.getFullYear() - 6} – ${view.getFullYear() + 5}`}
              </button>
              <div className="flex items-center">
                {mode === 'day' && (
                  <button
                    type="button"
                    onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
                    className="rounded p-1 text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
                    aria-label={t('datePicker.nextMonth')}
                    title={t('datePicker.nextMonth')}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    mode === 'day'
                      ? setView((v) => new Date(v.getFullYear() + 1, v.getMonth(), 1))
                      : setView((v) => new Date(v.getFullYear() + 12, v.getMonth(), 1))
                  }
                  className="rounded p-1 text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
                  aria-label={mode === 'day' ? t('datePicker.nextYear') : t('datePicker.next12Years')}
                  title={mode === 'day' ? t('datePicker.nextYear') : t('datePicker.next12Years')}
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            {mode === 'day' ? (
              <>
                <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
                  {weekdayShortNames.map((w) => (
                    <span key={w}>{w}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {days.map(({ date, inMonth }, i) => {
                    const isToday = isSameDay(date, today)
                    const isSelected = value && isSameDay(date, value)
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          onChange(date)
                          setOpen(false)
                        }}
                        className={`flex h-8 items-center justify-center rounded text-xs transition-all ${
                          isSelected
                            ? 'bg-[var(--surface-inverse)] font-medium text-[var(--on-inverse)]'
                            : isToday
                              ? 'bg-[var(--vellum)] text-[var(--ink)] ring-1 ring-white/30'
                              : inMonth
                                ? 'text-[var(--ink)] hover:bg-[var(--vellum)]'
                                : 'text-[var(--ink-4)] hover:bg-[var(--vellum)]'
                        }`}
                      >
                        {date.getDate()}
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {Array.from({ length: 12 }, (_, i) => view.getFullYear() - 6 + i).map((year) => {
                  const isSelected = value?.getFullYear() === year
                  const isCurrent = today.getFullYear() === year
                  return (
                    <button
                      key={year}
                      type="button"
                      onClick={() => {
                        setView(new Date(year, view.getMonth(), 1))
                        setMode('day')
                      }}
                      className={`flex h-10 items-center justify-center rounded text-sm transition-all ${
                        isSelected
                          ? 'bg-[var(--surface-inverse)] font-medium text-[var(--on-inverse)]'
                          : isCurrent
                            ? 'bg-[var(--vellum)] text-[var(--ink)] ring-1 ring-white/30'
                            : 'text-[var(--ink)] hover:bg-[var(--vellum)]'
                      }`}
                    >
                      {year}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-[var(--hairline)] pt-2">
              <button
                type="button"
                onClick={() => {
                  onChange(new Date())
                  setOpen(false)
                }}
                className="rounded px-2 py-1 text-xs text-[var(--ink-2)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
              >
                {t('datePicker.today')}
              </button>
              {clearable && value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange(null)
                    setOpen(false)
                  }}
                  className="rounded px-2 py-1 text-xs text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
                >
                  {t('datePicker.clear')}
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
