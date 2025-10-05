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
 * Check if a string is a URL (http or https)
 */
export function isEmojiUrl(emoji: string | undefined): boolean {
  if (!emoji) return false;
  return emoji.startsWith("http://") || emoji.startsWith("https://");
}

/**
 * Validate if a URL is a valid image URL format
 */
export function isValidImageUrl(url: string): boolean {
  try {
    new URL(url);
    // Check if it has a common image extension or is from a CDN
    const validExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
    const lowerUrl = url.toLowerCase();
    return validExtensions.some((ext) => lowerUrl.includes(ext)) || lowerUrl.includes("cdn");
  } catch {
    return false;
  }
}

/**
 * Get all default emojis for display
 */
export function getDefaultEmojis(): string[] {
  return [...DEFAULT_EMOJIS];
}
