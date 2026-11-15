// The Markdown a journal day or a sync note is shown with. Text is stored as
// written and never rewritten: this only decides how it is drawn.
//
// A small subset on purpose, the one a diary uses: headings, rules, lists,
// quotes, code, emphasis, links, and line breaks kept as typed. No HTML is
// ever produced from the text; the renderer builds elements from these values,
// so nothing a note contains can become markup.
//
// Two things are Anansi's own:
//   - a mention token (`@[Name](person:<id>)`) is left alone for the mention
//     renderer, which the inline pass hands it to;
//   - a media marker (`[foto 2]`, `[video 1]`, `[audio 1]`, `[archivo 1]`)
//     stands for the nth attachment of that kind, in the order they were
//     added. Imported diaries carry them where a picture sat in the text.

export type MediaKind = 'image' | 'video' | 'audio' | 'other'

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'media'; kind: MediaKind; n: number; raw: string }

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: 'rule' }
  | { type: 'paragraph'; lines: string[] }
  | { type: 'list'; items: { depth: number; ordered: boolean; marker: string; text: string }[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'code'; text: string }
  | { type: 'media'; kind: MediaKind; n: number; raw: string }

const MARKER_WORD: Record<string, MediaKind> = { foto: 'image', video: 'video', audio: 'audio', archivo: 'other' }
const MARKER = /\[(foto|video|audio|archivo) (\d{1,4})\]/
const MARKER_LINE = new RegExp(`^\\s*${MARKER.source}\\s*$`)
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const LIST = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/
const FENCE = /^\s*```/

/** The text cut into blocks, top to bottom. */
export function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let paragraph: string[] = []
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', lines: paragraph })
    paragraph = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (FENCE.test(line)) {
      flush()
      const body: string[] = []
      i++
      while (i < lines.length && !FENCE.test(lines[i]!)) body.push(lines[i++]!)
      blocks.push({ type: 'code', text: body.join('\n') })
      continue
    }
    if (line.trim() === '') {
      flush()
      continue
    }
    const marker = MARKER_LINE.exec(line)
    if (marker) {
      flush()
      blocks.push({ type: 'media', kind: MARKER_WORD[marker[1]!]!, n: Number(marker[2]), raw: line.trim() })
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      blocks.push({ type: 'heading', level: heading[1]!.length as 1 | 2 | 3 | 4 | 5 | 6, text: heading[2]! })
      continue
    }
    if (RULE.test(line)) {
      flush()
      blocks.push({ type: 'rule' })
      continue
    }
    const item = LIST.exec(line)
    if (item) {
      flush()
      const entry = {
        depth: Math.floor(item[1]!.replace(/\t/g, '    ').length / 2),
        ordered: /\d/.test(item[2]!),
        marker: item[2]!,
        text: item[3]!,
      }
      const last = blocks.at(-1)
      if (last?.type === 'list') last.items.push(entry)
      else blocks.push({ type: 'list', items: [entry] })
      continue
    }
    const quote = QUOTE.exec(line)
    if (quote) {
      flush()
      const last = blocks.at(-1)
      if (last?.type === 'quote') last.lines.push(quote[1]!)
      else blocks.push({ type: 'quote', lines: [quote[1]!] })
      continue
    }
    paragraph.push(line)
  }
  flush()
  return blocks
}

// Earliest match wins; of two at the same place, the first listed. Mention
// tokens are matched only so that nothing inside them is read as Markdown.
const INLINE: { kind: string; re: RegExp }[] = [
  { kind: 'mention', re: /@\[[^\]\n]{1,200}\]\(person:[a-z0-9]{6,64}\)/ },
  { kind: 'code', re: /`([^`\n]+)`/ },
  { kind: 'media', re: MARKER },
  { kind: 'link', re: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/ },
  { kind: 'strong', re: /\*\*(?=\S)([^\n]+?)(?<=\S)\*\*|__(?=\S)([^\n]+?)(?<=\S)__/ },
  { kind: 'em', re: /\*(?=\S)([^*\n]+?)(?<=\S)\*|(?<![\p{L}\p{N}_])_(?=\S)([^_\n]+?)(?<=\S)_(?![\p{L}\p{N}_])/u },
  { kind: 'url', re: /https?:\/\/[^\s<>()]+[^\s<>().,;:!?]/ },
]

/** One line cut into runs of text, emphasis, code, links and media markers. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  const push = (run: string) => {
    if (!run) return
    const last = out.at(-1)
    if (last?.type === 'text') last.text += run
    else out.push({ type: 'text', text: run })
  }
  let rest = text
  while (rest) {
    let best: { kind: string; match: RegExpExecArray } | null = null
    for (const { kind, re } of INLINE) {
      const match = re.exec(rest)
      if (match && (!best || match.index < best.match.index)) best = { kind, match }
    }
    if (!best) {
      push(rest)
      break
    }
    const { kind, match } = best
    push(rest.slice(0, match.index))
    if (kind === 'mention') push(match[0])
    else if (kind === 'code') out.push({ type: 'code', text: match[1]! })
    else if (kind === 'media')
      out.push({ type: 'media', kind: MARKER_WORD[match[1]!]!, n: Number(match[2]), raw: match[0] })
    else if (kind === 'link') out.push({ type: 'link', href: match[2]!, children: parseInline(match[1]!) })
    else if (kind === 'url') out.push({ type: 'link', href: match[0], children: [{ type: 'text', text: match[0] }] })
    else if (kind === 'strong') out.push({ type: 'strong', children: parseInline(match[1] ?? match[2]!) })
    else out.push({ type: 'em', children: parseInline(match[1] ?? match[2]!) })
    rest = rest.slice(match.index + match[0].length)
  }
  return out
}
