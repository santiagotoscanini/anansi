// Sidebar geometry, and the cookie that lets the server render it.
//
// The three pieces of state the sidebar's width depends on used to be read in
// `useState` initializers on the client:
//
//   userPrefCollapsed  ← localStorage
//   expandedWidth      ← localStorage
//   viewportTooNarrow  ← window.innerWidth
//
// None of those exist on the server, so SSR always emitted a 224px expanded
// sidebar and the client immediately re-rendered with whatever the device
// actually wanted — a hydration mismatch plus a visible width jump for anyone
// who had collapsed the sidebar or resized it.
//
// The cookie stores the EFFECTIVE geometry rather than the preference, for the
// same reason the theme cookie stores the resolved theme: `viewportTooNarrow`
// is not a preference at all, and the server has no way to evaluate it. Storing
// the answer means the server can paint it; storing the inputs would not help.
//
// Format is `<0|1>:<width>` — two fields, no JSON, so it survives a hand-edit
// and cannot smuggle anything interesting through the parser.

export const SIDEBAR_COOKIE = 'anansi:sidebar'

export const SIDEBAR_AUTOCOLLAPSE_PX = 1100
export const SIDEBAR_COLLAPSED_PX = 56
export const SIDEBAR_MIN_PX = 180
export const SIDEBAR_MAX_PX = 400
export const SIDEBAR_DEFAULT_PX = 224
/** Dragging narrower than this snaps to collapsed. */
export const SIDEBAR_COLLAPSE_THRESHOLD_PX = 110

export interface SidebarGeometry {
  collapsed: boolean
  width: number
}

export const SIDEBAR_DEFAULT_GEOMETRY: SidebarGeometry = {
  collapsed: false,
  width: SIDEBAR_DEFAULT_PX,
}

export function clampSidebarWidth(px: number): number {
  return Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, px))
}

/**
 * Parse `<0|1>:<width>`. Returns undefined for anything unrecognised so the
 * caller falls back to the default rather than to a nonsense width.
 */
export function coerceSidebarGeometry(raw: string | undefined): SidebarGeometry | undefined {
  if (!raw) return undefined

  const [collapsedPart, widthPart] = raw.split(':')
  if (collapsedPart !== '0' && collapsedPart !== '1') return undefined

  const width = Number.parseInt(widthPart ?? '', 10)
  if (!Number.isFinite(width)) return undefined

  return { collapsed: collapsedPart === '1', width: clampSidebarWidth(width) }
}

export function writeSidebarCookie(geometry: SidebarGeometry): void {
  if (typeof document === 'undefined') return
  const value = `${geometry.collapsed ? '1' : '0'}:${Math.round(geometry.width)}`
  document.cookie = `${SIDEBAR_COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
}
