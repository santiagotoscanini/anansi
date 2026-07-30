// Scope vocabulary for the Anansi MCP OAuth server. We only ship two scopes:
// read and write. Almost every tool is a mutation, so for v1 the consent screen
// asks for both. The split exists so we can later issue read-only tokens to
// clients that only need to surface state (e.g. a dashboard sync).

export const SCOPE_READ = 'anansi:read'
export const SCOPE_WRITE = 'anansi:write'
export const DEFAULT_SCOPE = `${SCOPE_READ} ${SCOPE_WRITE}`
export const ALL_SCOPES = [SCOPE_READ, SCOPE_WRITE] as const

// Normalize a requested scope string into a canonical, ordered, deduped form
// of supported scopes. Unknown scopes are dropped silently — RFC 6749 §3.3
// says the AS MAY narrow scope at will. Empty/missing input falls back to
// DEFAULT_SCOPE so a careless client still gets something usable.
export function normalizeScope(requested: string | null | undefined): string {
  if (!requested?.trim()) return DEFAULT_SCOPE
  const tokens = requested.split(/\s+/).filter(Boolean)
  const accepted = ALL_SCOPES.filter((s) => tokens.includes(s))
  return accepted.length > 0 ? accepted.join(' ') : DEFAULT_SCOPE
}
