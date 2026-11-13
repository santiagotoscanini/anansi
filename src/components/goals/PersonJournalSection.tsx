import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { NotebookPen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toPlain } from '~/lib/journal'
import { journalMentionsOfQueryOptions } from '~/lib/queries/journal'

// The days the journal mentions this person, newest first: where the user
// wrote about them. Read-only; each row opens its day.
export default function PersonJournalSection({ personId, personName }: { personId: string; personName: string }) {
  const { t, i18n } = useTranslation()
  const query = useQuery(journalMentionsOfQueryOptions(personId))
  const entries = query.data ?? []
  const fmt = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })
  const me = [{ id: personId, name: personName }]

  return (
    <div className="pt-2">
      <div className="mb-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--vellum)]" />
        <span className="flex items-center gap-1 text-[10px] tracking-widest text-[var(--ink-4)] uppercase">
          <NotebookPen className="h-3 w-3" />
          {t('personModal.journalSection')}
        </span>
        <div className="h-px flex-1 bg-[var(--vellum)]" />
      </div>
      {query.isLoading ? (
        <p className="text-xs text-[var(--ink-3)]">{t('common.loading')}</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-[var(--ink-4)]">{t('personModal.journalEmpty')}</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((e) => {
            // The line that names them, when one does: a highlight first, else
            // the paragraph of the text.
            const token = `(person:${personId})`
            const line =
              e.highlights.find((h) => h.includes(token)) ??
              e.content.split(/\n+/).find((p) => p.includes(token)) ??
              e.highlights[0] ??
              e.content
            const [y = 0, m = 1, d = 1] = e.day.split('-').map(Number)
            return (
              <li key={e.id}>
                <Link
                  to="/app/journal"
                  search={{ day: e.day }}
                  className="flex items-baseline gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--vellum)] px-3 py-2 text-sm transition-colors hover:border-[var(--hairline-2)]"
                >
                  <span
                    className="w-24 shrink-0 text-[var(--ink-3)]"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em' }}
                  >
                    {fmt.format(new Date(y, m - 1, d))}
                  </span>
                  <span className="line-clamp-2 min-w-0 flex-1 text-[var(--ink)]">{toPlain(line, me)}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
