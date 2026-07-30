'use client'

import { useEffect, useState } from 'react'

// Theme persistence — three states:
//   "system" → follow prefers-color-scheme (default)
//   "light"  → force light
//   "dark"   → force dark
//
// Stored per-device in localStorage under `anansi:theme`. The inline
// boot script in layout.tsx applies the value synchronously on first
// paint so there's no flash; this hook keeps it live, listens to OS
// preference changes, and writes back on user toggle.

export type ThemePref = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'anansi:theme'

function readStoredPref(): ThemePref {
  if (typeof window === 'undefined') return 'system'
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === 'light' || raw === 'dark') return raw
  return 'system'
}

function readSystem(): Theme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
}

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(() => readStoredPref())
  const [systemTheme, setSystemTheme] = useState<Theme>(() => readSystem())

  // OS preference listener — only matters when pref = "system", but
  // attached unconditionally so a flip from "auto" stays live without
  // needing a re-mount.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolved: Theme = pref === 'system' ? systemTheme : pref
  useEffect(() => {
    applyTheme(resolved)
  }, [resolved])

  const setPref = (next: ThemePref) => {
    setPrefState(next)
    try {
      if (next === 'system') window.localStorage.removeItem(STORAGE_KEY)
      else window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* storage blocked — DOM-applied value is still correct */
    }
  }

  return { pref, theme: resolved, setPref }
}
