// A sync item's pure rules, shared by the server, the Sync tab, Pulse and the tests: what its text is (notes and
// named blocks, for the mention index), how many pictures a week takes (`photosPerWeek`), and when a long block
// folds. The phone has the picture rules in Core/SyncItemRules.swift.
import { mentionedIds } from './mentions'

/** The people a sync item names: its notes and every block, together. */
export function syncItemMentionIds(notes: string | null | undefined, blocks: readonly { content: string }[]): string[] {
  return mentionedIds([notes ?? '', ...blocks.map((b) => b.content)].filter(Boolean).join('\n'))
}

/** Whether another picture fits this week. `limit` null means any number. */
export function canAddPicture(limit: number | null | undefined, pictures: number): boolean {
  return limit === null || limit === undefined || pictures < limit
}

/**
 * How the pictures of a week are laid out: `single` when the item takes exactly one (one slot, replaced rather
 * than added to), `many` otherwise.
 */
export function pictureMode(limit: number | null | undefined): 'single' | 'many' {
  return limit === 1 ? 'single' : 'many'
}

/** A block longer than this many lines shows folded, with "Show all". */
export const BLOCK_FOLD_LINES = 12

/** Whether a block's content is long enough to fold: more than `lines` lines, or a very long paragraph. */
export function isLongBlock(content: string, lines = BLOCK_FOLD_LINES): boolean {
  const count = content.split('\n').length
  // A transcript pasted as one paragraph still reads as long: about 100 characters a line.
  return count > lines || content.length > lines * 100
}

/** The order index for a block added after `existing`. */
export function nextOrder(existing: readonly { orderIdx: number }[]): number {
  return existing.reduce((max, b) => Math.max(max, b.orderIdx), -1) + 1
}
