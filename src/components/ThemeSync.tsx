'use client'

import { useTheme } from '~/lib/theme'

// Mount this once at the top of the tree to keep `data-theme` in sync
// with the OS `prefers-color-scheme` query (when the user hasn't picked
// an explicit override). The hook attaches a matchMedia change listener
// and writes the resolved theme to <html data-theme>. Without this
// component the boot script in layout.tsx fires once on load but the
// page never flips when the user switches macOS to night mode.
export default function ThemeSync() {
  useTheme()
  return null
}
