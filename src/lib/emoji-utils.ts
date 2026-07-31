/**
 * Emoji utility functions for goal emojis
 */

// Curated list of goal-related emojis
const DEFAULT_EMOJIS = [
  '🎯', // Target
  '🚀', // Rocket
  '💡', // Light bulb
  '⭐', // Star
  '🎨', // Art palette
  '📚', // Books
  '💪', // Flexed biceps
  '🌟', // Glowing star
  '🔥', // Fire
  '✨', // Sparkles
  '🏆', // Trophy
  '💎', // Gem
  '🌱', // Seedling
  '🎓', // Graduation cap
  '💼', // Briefcase
  '🧠', // Brain
  '❤️', // Heart
  '⚡', // Lightning
  '🎪', // Circus tent
  '🎭', // Theater masks
  '🎸', // Guitar
  '🏃', // Running
  '🧘', // Person in lotus position
  '📈', // Chart increasing
  '🌈', // Rainbow
  '🔮', // Crystal ball
  '🎁', // Gift
  '🌍', // Earth
  '🎬', // Movie clapper
  '🎮', // Video game
]

/**
 * Pick a default emoji deterministically from `seed`.
 *
 * Deterministic rather than random because the goal editor is server-rendered
 * now (`/app/objectives?goal=…` deep-links it). `Math.random()` in a useState
 * initializer runs once on the server and again on the client, producing two
 * different emoji for the same render — a guaranteed hydration mismatch that
 * React repairs by regenerating the subtree. It was invisible while the modal
 * could only be opened by a click.
 *
 * Seeding on the goal id also means a given goal always suggests the same
 * emoji, so the default stops shuffling every time the modal is reopened.
 *
 * FNV-1a: tiny, no dependency, and well-spread over short ASCII keys like a
 * cuid2 — which matters, since a weak hash would bias every goal toward the
 * same few emoji.
 */
export function pickDefaultEmoji(seed: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return DEFAULT_EMOJIS[hash % DEFAULT_EMOJIS.length]!
}

/**
 * Check if a string is an image reference (absolute http(s) URL or a
 * relative `/api/files/{id}` path issued by our own files API). Emoji
 * codepoints never start with `http` or `/`, so this cleanly disambiguates.
 */
export function isEmojiUrl(emoji: string | undefined): boolean {
  if (!emoji) return false
  return emoji.startsWith('http://') || emoji.startsWith('https://') || emoji.startsWith('/api/files/')
}

// Soft cap on an emoji glyph's length. A single emoji can be one codepoint
// (✨ → 1 char) up to a ZWJ family sequence (👨‍👩‍👧‍👦 → 11 chars including the
// joiners + variation selectors). 32 leaves headroom for the longest
// real-world glyphs without giving anyone room to smuggle a payload.
const EMOJI_GLYPH_MAX_LEN = 32

// True when the string is a plausible emoji glyph: no URL-ish chars, no
// whitespace, no slashes, no protocol. Empty string is rejected — callers
// should pass null/undefined to mean "no emoji" instead.
export function isEmojiGlyph(value: string): boolean {
  if (value.length === 0 || value.length > EMOJI_GLYPH_MAX_LEN) return false
  if (/[\s/\\]/.test(value)) return false
  if (/^https?:/i.test(value)) return false
  return true
}

// True when the string is an image reference we issued ourselves — a path
// to the `/api/files/{id}` route. This is the ONLY URL shape accepted in
// user-facing emoji fields; pasted external URLs are rejected so users
// can't smuggle tracking pixels through arbitrary external hosts.
export function isOurStorageImageUrl(value: string): boolean {
  if (!value.startsWith('/api/files/')) return false
  // Optional cache-bust query (?v=...) is fine. Disallow any further path
  // segments after the id so a crafted "/api/files/abc/../other" can't
  // sneak through.
  const noQuery = value.split('?')[0] ?? value
  const tail = noQuery.slice('/api/files/'.length)
  if (!tail || tail.includes('/') || tail.includes('\\')) return false
  return true
}

/**
 * Get all default emojis for display
 */
export function getDefaultEmojis(): string[] {
  return [...DEFAULT_EMOJIS]
}
