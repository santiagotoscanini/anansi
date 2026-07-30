export const COLOR_PALETTE = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
  '#e11d48',
  '#be123c',
  '#881337',
] as const

export const DEFAULT_COLOR = COLOR_PALETTE[10]

export const randomPaletteColor = (): string =>
  COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)] ?? DEFAULT_COLOR
