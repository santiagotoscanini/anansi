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
 * Get a random emoji from the default emoji list
 */
export function getRandomEmoji(): string {
  const randomIndex = Math.floor(Math.random() * DEFAULT_EMOJIS.length)
  return DEFAULT_EMOJIS[randomIndex]!
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
