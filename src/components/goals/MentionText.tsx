import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Fragment } from 'react'
import { mentionSegments } from '~/lib/mentions'
import { peopleQueryOptions } from '~/lib/queries/people'
import type { MentionCandidate } from './MentionField'

/**
 * The people a field can mention, and the names a stored mention resolves to.
 * The /app layout has already loaded them, so this reads the cache.
 */
export function useMentionPeople(): MentionCandidate[] {
  const { data } = useQuery(peopleQueryOptions(false))
  return (data ?? []).map((p) => ({ id: p.id, name: p.name, emoji: p.emoji }))
}

/**
 * Stored text with its mentions shown as people: the one way any screen renders
 * text that can name someone (a journal day, sync notes, a task). Never print
 * such text raw, or the tokens show.
 *
 * `link` makes each name a link to the person; leave it off inside a button or
 * another link, where a nested anchor is not allowed.
 */
export default function MentionText({ text, link = false }: { text: string; link?: boolean }) {
  const people = useMentionPeople()
  const byId = new Map(people.map((p) => [p.id, p] as const))
  return (
    <>
      {mentionSegments(text).map((seg, i) => {
        if (seg.type === 'text') return <Fragment key={i}>{seg.text}</Fragment>
        const person = byId.get(seg.personId)
        // Someone archived or deleted since: the name stays, as plain text.
        if (!person) return <Fragment key={i}>{seg.label}</Fragment>
        const style = { color: 'var(--indigo)', fontWeight: 500 }
        if (!link) {
          return (
            <span key={i} style={style}>
              {person.name}
            </span>
          )
        }
        return (
          <Link
            key={i}
            to="/app/people"
            search={{ filter: 'all', person: person.id }}
            onClick={(e) => e.stopPropagation()}
            className="rounded-sm transition-colors hover:bg-[var(--indigo-soft)]"
            style={style}
          >
            {person.name}
          </Link>
        )
      })}
    </>
  )
}
