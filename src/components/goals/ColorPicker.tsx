'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { COLOR_PALETTE } from '~/lib/color-palette'

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  size?: 'sm' | 'md' | 'lg'
  align?: 'left' | 'right'
  ariaLabel?: string
}

const TRIGGER_SIZE: Record<NonNullable<ColorPickerProps['size']>, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
}

export default function ColorPicker({ value, onChange, size = 'md', align = 'left', ariaLabel }: ColorPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
        setShowCustom(false)
      }
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setShowCustom(false)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div ref={wrapperRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${TRIGGER_SIZE[size]} cursor-pointer rounded-full border border-[var(--hairline-2)] transition-all hover:scale-110`}
        style={{ backgroundColor: value }}
        aria-label={ariaLabel ?? t('colorPicker.pickColor')}
      />
      {open && (
        <div
          className={`absolute top-full z-30 mt-2 w-44 rounded-lg border border-[var(--hairline)] bg-[var(--ink-3)] p-2 shadow-xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="grid grid-cols-5 gap-1.5">
            {COLOR_PALETTE.map((c) => {
              const selected = c.toLowerCase() === value.toLowerCase()
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    onChange(c)
                    setOpen(false)
                    setShowCustom(false)
                  }}
                  className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
                    selected ? 'ring-2 ring-white ring-offset-1 ring-offset-neutral-900' : ''
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              )
            })}
          </div>
          <div className="mt-2 border-t border-[var(--hairline)] pt-2">
            {showCustom ? (
              <input
                type="color"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-7 w-full cursor-pointer rounded border-0 bg-transparent p-0"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowCustom(true)}
                className="w-full rounded px-1.5 py-1 text-left text-[11px] text-[var(--ink-3)] transition-all hover:bg-[var(--vellum)] hover:text-[var(--ink)]"
              >
                {t('colorPicker.custom')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
