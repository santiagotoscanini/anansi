import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AtSign, Calendar, CheckSquare, NotebookPen, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { localToday } from '~/lib/journal'
import { personMentionsQueryOptions } from '~/lib/queries/people'
import MentionText from './MentionText'

const rowClass =
  'flex items-baseline gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-2 text-sm transition-colors hover:border-[var(--hairline-2)]'
const metaStyle = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em' } as const

/** The paragraph of `text` that names the person, or its first one. */
function lineNaming(personId: string, ...texts: string[]): string {
  const token = `(person:${personId})`
  const lines = texts.flatMap((t) => t.split(/\n+/)).filter((l) => l.trim())
  return lines.find((l) => l.includes(token)) ?? lines[0] ?? ''
}

// Everywhere the user's own text names this person: open tasks first (what is
// planned), then journal days and weekly sync notes by date (what was said).
// Read-only; each row opens the place it came from.
export default function PersonMentionsSection({ personId }: { personId: string }) {
  const { t, i18n } = useTranslation()
  const query = useQuery(personMentionsQueryOptions(personId))
  const data = query.data
  const fmt = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })

  const dated = data
    ? [
        ...data.journal.map((e) => {
          const [y = 0, m = 1, d = 1] = e.day.split('-').map(Number)
          return { kind: 'journal' as const, key: `j:${e.day}`, at: new Date(y, m - 1, d), entry: e }
        }),
        ...data.syncNotes.map((n) => ({
          kind: 'sync' as const,
          key: `s:${n.weeklySyncItemId}`,
          at: new Date(n.weekDate),
          note: n,
        })),
      ].sort((a, b) => b.at.getTime() - a.at.getTime())
    : []
  const tasks = data ? [...data.tasks].sort((a, b) => Number(a.completed) - Number(b.completed)) : []
  const empty = dated.length === 0 && tasks.length === 0

  return (
    <div className="pt-2">
      <div className="mb-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--vellum)]" />
        <span className="flex items-center gap-1 text-[10px] tracking-widest text-[var(--ink-4)] uppercase">
          <AtSign className="h-3 w-3" />
          {t('personModal.mentionsSection')}
        </span>
        <div className="h-px flex-1 bg-[var(--vellum)]" />
      </div>
      {query.isLoading ? (
        <p className="text-xs text-[var(--ink-3)]">{t('common.loading')}</p>
      ) : empty ? (
        <p className="text-xs text-[var(--ink-4)]">{t('personModal.mentionsEmpty')}</p>
      ) : (
        <ul className="space-y-1.5">
          {tasks.map((task) => (
            <li key={`t:${task.taskId}`}>
              <Link to="/app/tasks" search={{ task: task.taskId, goal: task.goalId }} className={rowClass}>
                {task.completed ? (
                  <CheckSquare className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-[var(--moss)]" />
                ) : (
                  <Square className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-[var(--ink-4)]" />
                )}
                <span
                  className={`line-clamp-2 min-w-0 flex-1 ${task.completed ? 'text-[var(--ink-3)] line-through' : 'text-[var(--ink)]'}`}
                >
                  <MentionText text={task.title} />
                </span>
                <span className="max-w-[40%] shrink-0 truncate text-xs text-[var(--ink-3)]">{task.goalTitle}</span>
              </Link>
            </li>
          ))}
          {dated.map((row) =>
            row.kind === 'journal' ? (
              <li key={row.key}>
                <Link to="/app/journal" search={{ day: row.entry.day }} className={rowClass}>
                  <NotebookPen className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-[var(--ink-4)]" />
                  <span className="line-clamp-2 min-w-0 flex-1 text-[var(--ink)]">
                    <MentionText text={lineNaming(personId, ...row.entry.highlights, row.entry.content)} />
                  </span>
                  <span className="shrink-0 text-[var(--ink-3)]" style={metaStyle}>
                    {fmt.format(row.at)}
                  </span>
                </Link>
              </li>
            ) : (
              <li key={row.key}>
                <Link to="/app/sync" search={{ week: localToday(row.at) }} className={rowClass}>
                  <Calendar className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-[var(--ink-4)]" />
                  <span className="line-clamp-2 min-w-0 flex-1 text-[var(--ink)]">
                    <span className="text-[var(--ink-3)]">{row.note.itemTitle} · </span>
                    <MentionText text={lineNaming(personId, row.note.textContent)} />
                  </span>
                  <span className="shrink-0 text-[var(--ink-3)]" style={metaStyle}>
                    {t('personModal.mentionsWeekOf', { date: fmt.format(row.at) })}
                  </span>
                </Link>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  )
}
