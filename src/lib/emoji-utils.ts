/**
 * Emoji utility functions for goal emojis
 */

// Curated list of goal-related emojis
const DEFAULT_EMOJIS = [
  "🎯", // Target
  "🚀", // Rocket
  "💡", // Light bulb
  "⭐", // Star
  "🎨", // Art palette
  "📚", // Books
  "💪", // Flexed biceps
  "🌟", // Glowing star
  "🔥", // Fire
  "✨", // Sparkles
  "🏆", // Trophy
  "💎", // Gem
  "🌱", // Seedling
  "🎓", // Graduation cap
  "💼", // Briefcase
  "🧠", // Brain
  "❤️", // Heart
  "⚡", // Lightning
  "🎪", // Circus tent
  "🎭", // Theater masks
  "🎸", // Guitar
  "🏃", // Running
  "🧘", // Person in lotus position
  "📈", // Chart increasing
  "🌈", // Rainbow
  "🔮", // Crystal ball
  "🎁", // Gift
  "🌍", // Earth
  "🎬", // Movie clapper
  "🎮", // Video game
];

/**
 * Get a random emoji from the default emoji list
 */
export function getRandomEmoji(): string {
  const randomIndex = Math.floor(Math.random() * DEFAULT_EMOJIS.length);
  return DEFAULT_EMOJIS[randomIndex]!;
}

/**
 * Check if a string is an image reference (absolute http(s) URL — every
 * uploaded image now resolves to a Supabase Storage URL, public or signed).
 * Emoji codepoints never start with `http`, so this cleanly disambiguates.
 */
export function isEmojiUrl(emoji: string | undefined): boolean {
  if (!emoji) return false;
  return emoji.startsWith("http://") || emoji.startsWith("https://");
}

// Soft cap on an emoji glyph's length. A single emoji can be one codepoint
// (✨ → 1 char) up to a ZWJ family sequence (👨‍👩‍👧‍👦 → 11 chars including the
// joiners + variation selectors). 32 leaves headroom for the longest
// real-world glyphs without giving anyone room to smuggle a payload.
const EMOJI_GLYPH_MAX_LEN = 32;

// True when the string is a plausible emoji glyph: no URL-ish chars, no
// whitespace, no slashes, no protocol. Empty string is rejected — callers
// should pass null/undefined to mean "no emoji" instead.
export function isEmojiGlyph(value: string): boolean {
  if (value.length === 0 || value.length > EMOJI_GLYPH_MAX_LEN) return false;
  if (/[\s/\\]/.test(value)) return false;
  if (/^https?:/i.test(value)) return false;
  return true;
}

// True when the string is a URL we issued ourselves — a Supabase Storage
// public URL for an image we host. This is the ONLY URL shape the app
// accepts in user-facing emoji fields; pasted external URLs are rejected
// so users can't smuggle tracking pixels through someone else's directory.
// Falls back to false (fail-closed) if the supabase URL env isn't set —
// we'd rather break the validator than accept arbitrary URLs by default.
export function isOurStorageImageUrl(value: string): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return false;
  const prefix = `${base.replace(/\/$/, "")}/storage/v1/object/public/`;
  if (!value.startsWith(prefix)) return false;
  // Optional cache-bust query (?v=...) is fine; protocol-tricks like
  // a second `://` in the path are not — split off any query before this
  // check so a legitimate ?v=... isn't penalized.
  const noQuery = value.split("?")[0] ?? value;
  if (noQuery.includes("://", prefix.length)) return false;
  return true;
}

/**
 * Get all default emojis for display
 */
export function getDefaultEmojis(): string[] {
  return [...DEFAULT_EMOJIS];
}
