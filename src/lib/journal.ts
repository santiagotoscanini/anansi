// The journal's text grammar: how an entry names a person.
//
// Stored text carries a mention as a token, `@[Name](person:<id>)`. The id is
// what links; the name is there so the raw text still reads, and the server
// rewrites it to the person's current name on every write. Three writers, one
// stored form:
//
//   - a picker (the web editor, the phone) inserts the token, or `@Name`;
//   - a person typing writes `@Name`, linked when exactly one person has it;
//   - an agent writes the token, or `@[Name]` when it has no id at hand.
//
// `linkMentions` is the one place the looser forms become tokens; the service
// runs it on every write. Pure and client-safe: no imports, so the editors and
// the tests can use it too.

export interface MentionPerson {
  id: string
  name: string
}

export type JournalSegment = { type: 'text'; text: string } | { type: 'mention'; personId: string; label: string }

/** A stored mention. Ids are cuid2: lowercase letters and digits. */
const TOKEN = /@\[([^\]\n]{1,200})\]\(person:([a-z0-9]{6,64})\)/g
/** `@[Name]` with no id after it: an explicit mention still to be resolved. */
const BARE = /@\[([^\]\n]{1,200})\](?!\(person:)/g

const WORD = /[\p{L}\p{N}_]/u

/** A name as it can sit inside a token: no `]`, no line break. */
function label(name: string): string {
  return name.replace(/[\]\n\r]/g, ' ').trim() || '?'
}

const fold = (s: string) => s.trim().toLocaleLowerCase()

export function mentionToken(person: MentionPerson): string {
  return `@[${label(person.name)}](person:${person.id})`
}

/** The people a text mentions, each once, in order of first appearance. */
export function mentionedIds(text: string): string[] {
  const ids: string[] = []
  for (const m of text.matchAll(TOKEN)) if (!ids.includes(m[2]!)) ids.push(m[2]!)
  return ids
}

/** The text cut into plain runs and mentions, for rendering. */
export function journalSegments(text: string): JournalSegment[] {
  const out: JournalSegment[] = []
  let at = 0
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > at) out.push({ type: 'text', text: text.slice(at, m.index) })
    out.push({ type: 'mention', personId: m[2]!, label: m[1]! })
    at = m.index + m[0].length
  }
  if (at < text.length) out.push({ type: 'text', text: text.slice(at) })
  return out
}

/**
 * The text as a person edits it: every token shown as `@Name`, with the
 * person's current name when they are known and the stored one otherwise.
 */
export function toEditable(text: string, people: readonly MentionPerson[]): string {
  const byId = new Map(people.map((p) => [p.id, p] as const))
  return text.replace(TOKEN, (_all, stored: string, id: string) => `@${label(byId.get(id)?.name ?? stored)}`)
}

/** The text with mentions as bare names, for excerpts and search results. */
export function toPlain(text: string, people: readonly MentionPerson[] = []): string {
  const byId = new Map(people.map((p) => [p.id, p] as const))
  return text.replace(TOKEN, (_all, stored: string, id: string) => label(byId.get(id)?.name ?? stored))
}

export interface LinkResult {
  text: string
  /** Token ids that are not one of `people`. */
  unknownIds: string[]
  /** `@[Name]` forms that no person, or more than one, answers to. */
  unresolved: { name: string; matches: number }[]
}

/**
 * Turn every way of naming a person into the stored token.
 *
 *   - `@[Old name](person:id)` gets the person's current name; an id that is
 *     not in `people` is reported in `unknownIds` and left as written.
 *   - `@[Name]` becomes a token when exactly one person has that name (case
 *     and surrounding space ignored); otherwise it is reported in `unresolved`.
 *   - `@Name` becomes a token on the same condition, and is otherwise left
 *     alone: it may be a handle, an email, or nobody.
 *
 * `prefer` breaks a tie between people who share a name (the editor passes the
 * people the entry already mentions).
 */
export function linkMentions(
  text: string,
  people: readonly MentionPerson[],
  prefer: readonly string[] = [],
): LinkResult {
  const byId = new Map(people.map((p) => [p.id, p] as const))
  const byName = new Map<string, MentionPerson[]>()
  for (const p of people) {
    const key = fold(label(p.name))
    byName.set(key, [...(byName.get(key) ?? []), p])
  }
  const pick = (name: string): { person?: MentionPerson; matches: number } => {
    const found = byName.get(fold(name)) ?? []
    if (found.length === 1) return { person: found[0], matches: 1 }
    const preferred = found.filter((p) => prefer.includes(p.id))
    return preferred.length === 1 ? { person: preferred[0], matches: 1 } : { matches: found.length }
  }

  const unknownIds: string[] = []
  const unresolved: LinkResult['unresolved'] = []

  // Tokens are lifted out first, each behind a private-use marker, so the
  // passes below cannot touch them.
  const kept: string[] = []
  const hold = (token: string) => `\uE000${kept.push(token) - 1}\uE000`

  let out = text.replace(/\uE000/g, '').replace(TOKEN, (all, _stored: string, id: string) => {
    const person = byId.get(id)
    if (!person) {
      if (!unknownIds.includes(id)) unknownIds.push(id)
      return hold(all)
    }
    return hold(mentionToken(person))
  })

  out = out.replace(BARE, (all, name: string) => {
    const { person, matches } = pick(name)
    if (!person) {
      unresolved.push({ name: name.trim(), matches })
      return all
    }
    return hold(mentionToken(person))
  })

  // Plain `@Name`: the longest name that fits wins, so "Ana María" is not cut
  // short at "Ana", and a name must end where the word does.
  const names = [...byName.keys()].sort((a, b) => b.length - a.length)
  let result = ''
  let i = 0
  while (i < out.length) {
    const at = out.indexOf('@', i)
    if (at === -1) break
    result += out.slice(i, at)
    i = at + 1
    const before = at > 0 ? out[at - 1]! : ''
    const rest = out.slice(i)
    let linked = false
    // `a@b` is an address, not a mention.
    if (!WORD.test(before)) {
      for (const name of names) {
        if (rest.length < name.length || fold(rest.slice(0, name.length)) !== name) continue
        const after = rest[name.length] ?? ''
        if (WORD.test(after)) continue
        const { person } = pick(name)
        if (!person) continue
        result += hold(mentionToken(person))
        i += name.length
        linked = true
        break
      }
    }
    if (!linked) result += '@'
  }
  result += out.slice(i)

  return {
    text: result.replace(/\uE000(\d+)\uE000/g, (_all, n: string) => kept[Number(n)]!),
    unknownIds,
    unresolved,
  }
}

/** True for a real calendar day written `YYYY-MM-DD` (so not February 31st). */
export function isCalendarDay(day: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return false
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return date.toISOString().slice(0, 10) === day
}

/** `day` moved by `delta` days. */
export function shiftDay(day: string, delta: number): string {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}

/** The calendar day on this clock: the browser's, where "today" is the user's. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
