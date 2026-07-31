import { useEffect, useState } from 'react'

// Theme persistence — three states:
//   "system" → follow prefers-color-scheme (default)
//   "light"  → force light
//   "dark"   → force dark
//
// TWO stores, holding different things, and the difference is the whole design:
//
//   localStorage `anansi:theme`          — the PREFERENCE (light|dark|system).
//   cookie       `anansi:theme-resolved` — the RESOLVED theme (light|dark).
//
// The preference is a device setting the client owns. The cookie exists purely
// so the SERVER can paint the right colours: it cannot evaluate
// prefers-color-scheme, so "system" is meaningless to it — it needs the answer,
// not the question. The root loader reads the cookie and renders
// `<html data-theme>` with it, which is what removes the warm-cream → coffee-dark
// flash dark-mode users used to get on every single page load.
//
// A raw <script> in <head> would also fix it and would additionally cover the
// first-ever visit, but that is exactly what was removed from the Next layout:
// React 19 warns about any <script> element in the rendered tree. The cookie
// costs no script and degrades to a single light frame in the two cases it
// cannot know about — a first visit, and the first load after the OS theme
// changed while the user was away. Both self-correct on the same paint and
// write a fresh cookie for next time.

export type ThemePref = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'anansi:theme'
export const THEME_COOKIE = 'anansi:theme-resolved'

/** Validate a raw cookie value. Anything unrecognised is treated as absent. */
export function coerceTheme(raw: string | undefined): Theme | undefined {
  return raw === 'light' || raw === 'dark' ? raw : undefined
}

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

  // Mirror to the cookie so the next server render paints this theme directly.
  // Written on every resolution change, not just on user toggles, so a "system"
  // user who flips their OS to dark has a correct cookie from that moment on.
  //
  // Lax rather than Strict: this is a display preference with no security
  // weight, and Strict would leave it unsent on inbound links — precisely the
  // cold navigations where the flash is most visible. One year, matching the
  // locale cookie.
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
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
